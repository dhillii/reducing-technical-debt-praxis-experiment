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
 * Builds a column definition based on the column specification.
 * @private
 */
function buildColumnDefinition(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        const length = Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength')
            ? columnSpec.maxlength
            : 191;
        return tableBuilder[columnSpec.type](columnName, length);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies column constraints such as nullable, primary, unique, unsigned, references, etc.
 * @private
 */
function applyColumnConstraints(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable')) {
        column.nullable(columnSpec.nullable);
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
 * Adds a column to a table based on the provided specification.
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} columnSpec
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const addColumnBuilder = transaction.schema.table(tableName, function (table) {
        const col = buildColumnDefinition(table, column, columnSpec);
        applyColumnConstraints(col, columnSpec);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await addColumnBuilder;
        return;
    }

    for (const sqlQuery of addColumnBuilder.toSQL()) {
        let sql = sqlQuery.sql;
        if (DatabaseInfo.isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (options?.algorithm !== 'auto') {
                const algorithm = options?.algorithm || 'copy';
                sql += `, algorithm=${algorithm}`;
            }
        }
        await transaction.raw(sql);
    }
}

/**
 * Drops a column from a table.
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} [columnSpec]
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function dropColumn(tableName, column, transaction = db.knex, columnSpec = {}, options = {}) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        const [toTable, toColumn] = columnSpec.references.split('.');
        await dropForeign({
            fromTable: tableName,
            fromColumn: column,
            toTable,
            toColumn,
            constraintName: columnSpec.constraintName,
            transaction
        });
    }

    const dropColumnBuilder = transaction.schema.table(tableName, function (table) {
        table.dropColumn(column);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await dropColumnBuilder;
        return;
    }

    for (const sqlQuery of dropColumnBuilder.toSQL()) {
        let sql = sqlQuery.sql;
        if (DatabaseInfo.isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (options?.algorithm !== 'auto') {
                const algorithm = options?.algorithm || 'copy';
                sql += `, algorithm=${algorithm}`;
            }
        }
        await transaction.raw(sql);
    }
}

/**
 * Renames a column in a table.
 * @param {string} tableName
 * @param {string} from
 * @param {string} to
 * @param {import('knex').Knex.Transaction} [transaction]
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
 * Adds an index to a table.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, function (table) {
            table.index(columns);
        });
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_DUP_KEYNAME'].includes(err.code)) {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Drops an index from a table.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, function (table) {
            table.dropIndex(columns);
        });
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'].includes(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Adds a unique constraint to a table.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, function (table) {
            table.unique(columns);
        });
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_DUP_KEYNAME'].includes(err.code)) {
            logging.warn(`Constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Drops a unique constraint from a table.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} transaction
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, function (table) {
            table.dropUnique(columns);
        });
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'].includes(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if a foreign key exists in SQLite.
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
 * Enables or disables foreign key checks in SQLite.
 * @private
 */
async function toggleSQLiteForeignKeys(transaction, enable) {
    const result = await db.knex.raw('PRAGMA foreign_keys;');
    const enabled = result[0].foreign_keys;
    if (enabled !== enable) {
        await db.knex.raw(`PRAGMA foreign_keys = ${enable ? 'ON' : 'OFF'};`);
    }
}

/**
 * Builds a foreign key definition.
 * @private
 */
function buildForeignKey(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete) {
    let fk = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
    if (cascadeDelete) {
        fk = fk.onDelete('CASCADE');
    } else if (setNullDelete) {
        fk = fk.onDelete('SET NULL');
    }
    return fk;
}

/**
 * Adds a foreign key to a table.
 * @param {Object} configuration
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
        if (DatabaseInfo.isSQLite(transaction)) {
            await toggleSQLiteForeignKeys(transaction, false);
        }

        await transaction.schema.table(fromTable, function (table) {
            const fk = buildForeignKey(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete);
            if (constraintName) {
                fk.withKeyName(constraintName);
            }
        });

        if (DatabaseInfo.isSQLite(transaction)) {
            await toggleSQLiteForeignKeys(transaction, true);
        }
    } catch (err) {
        if (['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'].includes(err.code)) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
    }
}

/**
 * Drops a foreign key from a table.
 * @param {Object} configuration
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
        if (DatabaseInfo.isSQLite(transaction)) {
            await toggleSQLiteForeignKeys(transaction, false);
        }

        await transaction.schema.table(fromTable, function (table) {
            table.dropForeign(fromColumn, constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction)) {
            await toggleSQLiteForeignKeys(transaction, true);
        }
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if a primary key exists in SQLite.
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
 * Adds a primary key to a table.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
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
        return await transaction.schema.table(tableName, function (table) {
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
 * Creates a table based on the provided schema.
 * @param {String} table
 * @param {import('knex').Knex} [transaction]
 * @param {Object} [tableSpec]
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, function (t) {
        Object.keys(tableSpec)
            .filter(column => !(column.startsWith('@@')))
            .forEach(column => addTableColumn(table, t, column, tableSpec[column]));
        if (tableSpec['@@INDEXES@@']) {
            tableSpec['@@INDEXES@@'].forEach(index => t.index(index));
        }
        if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
            tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(unique => t.unique(unique));
        }
    });
}

/**
 * Deletes a table if it exists.
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
 * Retrieves all tables in the database.
 * @param {import('knex').Knex} [transaction]
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
 * Retrieves all indexes for a table.
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
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
 * Retrieves all columns for a table.
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
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
 * Creates a migration function for column operations.
 * @param  {...any} migrations
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
    // NOTE: below are exposed for testing purposes only
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};