const _ = require('lodash');
const logging = require('@tryghost/logging');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const db = require('../db');
const DatabaseInfo = require('@tryghost/database-info');
const schema = require('./schema');

const messages = {
    hasPrimaryKeySQLiteError: 'Must use hasPrimaryKeySQLite on an SQLite3 database',
    hasForeignSQLite3: 'Must use hasForeignSQLite3 on an SQLite3 database',
    noSupportForDatabase: 'No support for database client {client}'
};

/**
 * Create a column on a table builder based on the column specification.
 * @private
 */
function createColumn(tableName, tableBuilder, columnName, columnSpec) {
    let column;
    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        column = tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (columnSpec.type === 'string') {
        const length = Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength')
            ? columnSpec.maxlength
            : 191;
        column = tableBuilder[columnSpec.type](columnName, length);
    } else {
        column = tableBuilder[columnSpec.type](columnName);
    }
    applyColumnOptions(column, columnSpec);
    return column;
}

/**
 * Apply optional properties to a column builder.
 * @private
 */
function applyColumnOptions(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable')) {
        column.nullable(!!columnSpec.nullable);
    } else {
        column.nullable(false);
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary) {
        column.primary();
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique) {
        column.unique();
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned) {
        column.unsigned();
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index) {
        column.index();
    }
}

/**
 * Execute a schema builder with raw SQL for non-SQLite databases.
 * @private
 */
async function executeBuilder(builder, transaction, options = {}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }
    for (const sqlQuery of builder.toSQL()) {
        let sql = sqlQuery.sql;
        if (DatabaseInfo.isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (options.algorithm !== 'auto') {
                const algorithm = options.algorithm || 'copy';
                sql += `, algorithm=${algorithm}`;
            }
        }
        await transaction.raw(sql);
    }
}

/**
 * Handle index/unique operations with error suppression.
 * @private
 */
async function handleIndexOperation(tableName, columns, transaction, operation, errorCodes, logMessage) {
    try {
        logging.info(logMessage);
        await transaction.schema.table(tableName, function (table) {
            operation(table, columns);
        });
    } catch (err) {
        if (errorCodes.includes(err.code)) {
            logging.warn(`${logMessage} - already exists`);
            return;
        }
        throw err;
    }
}

/**
 * Toggle foreign key checks on SQLite.
 * @private
 */
async function toggleForeignKeys(transaction, enable) {
    const result = await transaction.raw('PRAGMA foreign_keys;');
    const current = result[0].foreign_keys;
    if (current !== enable) {
        await transaction.raw(`PRAGMA foreign_keys = ${enable ? 'ON' : 'OFF'};`);
    }
}

/**
 * Check if a foreign key exists on SQLite.
 * @private
 */
async function hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction = db.knex}) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasForeignSQLite3)
        });
    }
    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return foreignKeys.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

/**
 * Add a foreign key to a table.
 * @private
 */
async function addForeign({fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete = false, setNullDelete = false, transaction = db.knex}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (exists) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
    }
    try {
        logging.info(`Adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);
        await toggleForeignKeys(transaction, false);
        await transaction.schema.table(fromTable, function (table) {
            let fk = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
            if (cascadeDelete) {
                fk = fk.onDelete('CASCADE');
            } else if (setNullDelete) {
                fk = fk.onDelete('SET NULL');
            }
            if (constraintName) {
                fk.withKeyName(constraintName);
            }
        });
        await toggleForeignKeys(transaction, true);
    } catch (err) {
        if (['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'].includes(err.code)) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
    }
}

/**
 * Drop a foreign key from a table.
 * @private
 */
async function dropForeign({fromTable, fromColumn, toTable, toColumn, constraintName, transaction = db.knex}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (!exists) {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
    }
    try {
        logging.info(`Dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);
        await toggleForeignKeys(transaction, false);
        await transaction.schema.table(fromTable, function (table) {
            table.dropForeign(fromColumn, constraintName);
        });
        await toggleForeignKeys(transaction, true);
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

/**
 * Check if a primary key exists on SQLite.
 * @private
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasPrimaryKeySQLiteError)
        });
    }
    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.find(c => c.origin === 'pk');
}

/**
 * Add a primary key constraint to a table.
 * @private
 */
async function addPrimaryKey(tableName, columns, transaction = db.knex) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasPrimaryKeySQLite(tableName, transaction);
        if (exists) {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
    }
    try {
        logging.info(`Adding primary key constraint for '${columns}' in table '${tableName}'`);
        await transaction.schema.table(tableName, function (table) {
            table.primary(columns);
        });
    } catch (err) {
        if (err.code === 'ER_MULTIPLE_PRI_KEY') {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Set a column to nullable.
 */
function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, function (table) {
        table.setNullable(column);
    });
}

/**
 * Drop nullable from a column.
 */
function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, function (table) {
        table.dropNullable(column);
    });
}

/**
 * Add a column to a table.
 */
async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const builder = transaction.schema.table(tableName, function (table) {
        createColumn(tableName, table, column, columnSpec);
    });
    await executeBuilder(builder, transaction, options);
}

/**
 * Drop a column from a table.
 */
async function dropColumn(tableName, column, transaction = db.knex, columnSpec = {}, options = {}) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        const [toTable, toColumn] = columnSpec.references.split('.');
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }
    const builder = transaction.schema.table(tableName, function (table) {
        table.dropColumn(column);
    });
    await executeBuilder(builder, transaction, options);
}

/**
 * Rename a column in a table.
 */
async function renameColumn(tableName, from, to, transaction = db.knex) {
    logging.info(`Renaming column '${from}' to '${to}' in table '${tableName}'`);
    if (DatabaseInfo.isMySQL(transaction)) {
        return await transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }
    return await transaction.schema.table(tableName, function (table) {
        table.renameColumn(from, to);
    });
}

/**
 * Add an index to a table.
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    await handleIndexOperation(
        tableName,
        columns,
        transaction,
        (table, cols) => table.index(cols),
        ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
        `Adding index for '${columns}' in table '${tableName}'`
    );
}

/**
 * Drop an index from a table.
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    await handleIndexOperation(
        tableName,
        columns,
        transaction,
        (table, cols) => table.dropIndex(cols),
        ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        `Dropping index for '${columns}' in table '${tableName}'`
    );
}

/**
 * Add a unique constraint to a table.
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    await handleIndexOperation(
        tableName,
        columns,
        transaction,
        (table, cols) => table.unique(cols),
        ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
        `Adding unique constraint for '${columns}' in table '${tableName}'`
    );
}

/**
 * Drop a unique constraint from a table.
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    await handleIndexOperation(
        tableName,
        columns,
        transaction,
        (table, cols) => table.dropUnique(cols),
        ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        `Dropping unique constraint for '${columns}' in table '${tableName}'`
    );
}

/**
 * Create a table based on a schema definition.
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, function (t) {
        Object.keys(tableSpec)
            .filter(col => !col.startsWith('@@'))
            .forEach(col => createColumn(table, t, col, tableSpec[col]));
        if (tableSpec['@@INDEXES@@']) {
            tableSpec['@@INDEXES@@'].forEach(idx => t.index(idx));
        }
        if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
            tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(uniq => t.unique(uniq));
        }
    });
}

/**
 * Delete a table if it exists.
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
 * Retrieve all tables in the database.
 */
async function getTables(transaction = db.knex) {
    const client = transaction.client.config.client;
    if (client === 'sqlite3') {
        const response = await transaction.raw('select * from sqlite_master where type = "table"');
        return _.reject(_.map(response, 'tbl_name'), name => name === 'sqlite_sequence');
    }
    if (client === 'mysql2') {
        const response = await transaction.raw('show tables');
        return _.flatten(_.map(response[0], entry => _.values(entry)));
    }
    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * Retrieve all indexes for a table.
 */
async function getIndexes(table, transaction = db.knex) {
    const client = transaction.client.config.client;
    if (client === 'sqlite3') {
        const response = await transaction.raw(`pragma index_list("${table}")`);
        return _.flatten(_.map(response, 'name'));
    }
    if (client === 'mysql2') {
        const response = await transaction.raw(`SHOW INDEXES from ${table}`);
        return _.flatten(_.map(response[0], 'Key_name'));
    }
    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * Retrieve all columns for a table.
 */
async function getColumns(table, transaction = db.knex) {
    const client = transaction.client.config.client;
    if (client === 'sqlite3') {
        const response = await transaction.raw(`pragma table_info("${table}")`);
        return _.flatten(_.map(response, 'name'));
    }
    if (client === 'mysql2') {
        const response = await transaction.raw(`SHOW COLUMNS from ${table}`);
        return _.flatten(_.map(response[0], 'Field'));
    }
    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * Create a column migration function from a list of migration objects.
 */
function createColumnMigration(...migrations) {
    async function runColumnMigration(conn, migration) {
        const {
            table,
            column,
            dbIsInCorrectState,
            operation,
            operationVerb,
            columnDefinition,
            options
        } = migration;
        const hasColumn = await conn.schema.hasColumn(table, column);
        const isInCorrectState = dbIsInCorrectState(hasColumn);
        if (isInCorrectState) {
            logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
        } else {
            logging.info(`${operationVerb} ${table}.${column} column`);
            await operation(table, column, conn, columnDefinition, options);
        }
    }
    return async function columnMigration(conn) {
        for (const migration of migrations) {
            await runColumnMigration(conn, migration);
        }
    };
}

module.exports = {
    createTable,
    deleteTable,
    getTables,
    getIndexes,
    addUnique,
    dropUnique,
    addIndex,
    dropIndex,
    addPrimaryKey,
    addForeign,
    dropForeign,
    addColumn,
    renameColumn,
    dropColumn,
    setNullable,
    dropNullable,
    getColumns,
    createColumnMigration,
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};