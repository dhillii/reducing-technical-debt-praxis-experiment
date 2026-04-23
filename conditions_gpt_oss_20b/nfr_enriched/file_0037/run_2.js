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
 * Apply column options to a Knex column builder.
 * @private
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} spec
 */
function applyColumnOptions(column, spec) {
    if (spec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }
    if (spec.primary === true) {
        column.primary();
    }
    if (spec.unique) {
        column.unique();
    }
    if (spec.unsigned) {
        column.unsigned();
    }
    if (spec.references) {
        column.references(spec.references);
    }
    if (spec.constraintName) {
        column.withKeyName(spec.constraintName);
    }
    if (spec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (spec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }
    if (spec.defaultTo !== undefined) {
        column.defaultTo(spec.defaultTo);
    }
    if (spec.index === true) {
        column.index();
    }
}

/**
 * Create a column on a table based on the schema spec.
 * @private
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    let column;
    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        column = tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (columnSpec.type === 'string') {
        const length = Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength') ? columnSpec.maxlength : 191;
        column = tableBuilder[columnSpec.type](columnName, length);
    } else {
        column = tableBuilder[columnSpec.type](columnName);
    }
    applyColumnOptions(column, columnSpec);
}

/**
 * Set a column to nullable.
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, function (table) {
        table.setNullable(column);
    });
}

/**
 * Drop nullable from a column.
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, function (table) {
        table.dropNullable(column);
    });
}

/**
 * Build SQL statements for adding a column.
 * @private
 * @param {string} tableName
 * @param {string} column
 * @param {object} columnSpec
 * @param {object} options
 * @param {import('knex').Knex} transaction
 * @returns {string[]}
 */
function buildAddColumnSQLs(tableName, column, columnSpec, options, transaction) {
    const builder = transaction.schema.table(tableName, function (table) {
        addTableColumn(tableName, table, column, columnSpec);
    });
    if (DatabaseInfo.isSQLite(transaction)) {
        return [builder];
    }
    const sqls = [];
    for (const sqlQuery of builder.toSQL()) {
        let sql = sqlQuery.sql;
        if (DatabaseInfo.isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (options?.algorithm !== 'auto') {
                const algorithm = options?.algorithm || 'copy';
                sql += `, algorithm=${algorithm}`;
            }
        }
        sqls.push(sql);
    }
    return sqls;
}

/**
 * Add a column to a table.
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} columnSpec
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const sqls = buildAddColumnSQLs(tableName, column, columnSpec, options, transaction);
    if (DatabaseInfo.isSQLite(transaction)) {
        await sqls[0];
        return;
    }
    for (const sql of sqls) {
        await transaction.raw(sql);
    }
}

/**
 * Build SQL statements for dropping a column.
 * @private
 * @param {string} tableName
 * @param {string} column
 * @param {object} options
 * @param {import('knex').Knex} transaction
 * @returns {string[]}
 */
function buildDropColumnSQLs(tableName, column, options, transaction) {
    const builder = transaction.schema.table(tableName, function (table) {
        table.dropColumn(column);
    });
    if (DatabaseInfo.isSQLite(transaction)) {
        return [builder];
    }
    const sqls = [];
    for (const sqlQuery of builder.toSQL()) {
        let sql = sqlQuery.sql;
        if (DatabaseInfo.isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (options?.algorithm !== 'auto') {
                const algorithm = options?.algorithm || 'copy';
                sql += `, algorithm=${algorithm}`;
            }
        }
        sqls.push(sql);
    }
    return sqls;
}

/**
 * Drop a column from a table.
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} [columnSpec]
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function dropColumn(tableName, column, transaction = db.knex, columnSpec = {}, options = {}) {
    if (columnSpec.references) {
        const [toTable, toColumn] = columnSpec.references.split('.');
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }
    const sqls = buildDropColumnSQLs(tableName, column, options, transaction);
    if (DatabaseInfo.isSQLite(transaction)) {
        await sqls[0];
        return;
    }
    for (const sql of sqls) {
        await transaction.raw(sql);
    }
}

/**
 * Rename a column in a table.
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
 * Add a non-unique index to a table.
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
 * Drop a non-unique index from a table.
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
 * Add a unique constraint to a table.
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
 * Drop a unique constraint from a table.
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
 * Check if a foreign key exists in SQLite.
 * @private
 * @param {Object} config
 * @param {string} config.fromTable
 * @param {string} config.fromColumn
 * @param {string} config.toTable
 * @param {string} config.toColumn
 * @param {import('knex').Knex} [config.transaction]
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
 * Enable or disable foreign key checks on SQLite.
 * @private
 * @param {import('knex').Knex} transaction
 * @param {boolean} enable
 */
async function setSQLiteForeignKeys(transaction, enable) {
    const status = await transaction.raw('PRAGMA foreign_keys;');
    if (status[0].foreign_keys !== enable) {
        await transaction.raw(`PRAGMA foreign_keys = ${enable ? 'ON' : 'OFF'};`);
    }
}

/**
 * Add a foreign key to a table.
 * @param {Object} config
 * @param {string} config.fromTable
 * @param {string} config.fromColumn
 * @param {string} config.toTable
 * @param {string} config.toColumn
 * @param {string} [config.constraintName]
 * @param {boolean} [config.cascadeDelete]
 * @param {boolean} [config.setNullDelete]
 * @param {import('knex').Knex} [config.transaction]
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
            await setSQLiteForeignKeys(transaction, false);
        }
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
        if (DatabaseInfo.isSQLite(transaction)) {
            await setSQLiteForeignKeys(transaction, true);
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
 * Drop a foreign key from a table.
 * @param {Object} config
 * @param {string} config.fromTable
 * @param {string} config.fromColumn
 * @param {string} config.toTable
 * @param {string} config.toColumn
 * @param {string} [config.constraintName]
 * @param {import('knex').Knex} [config.transaction]
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
            await setSQLiteForeignKeys(transaction, false);
        }
        await transaction.schema.table(fromTable, function (table) {
            table.dropForeign(fromColumn, constraintName);
        });
        if (DatabaseInfo.isSQLite(transaction)) {
            await setSQLiteForeignKeys(transaction, true);
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
 * Check if a primary key exists in SQLite.
 * @private
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
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
 * Add a primary key to a table.
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
 * Create a table based on a schema spec.
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 * @param {object} [tableSpec]
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, function (t) {
        Object.keys(tableSpec)
            .filter(col => !col.startsWith('@@'))
            .forEach(col => addTableColumn(table, t, col, tableSpec[col]));
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
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
 * Get all tables in the database.
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
 * Get all indexes for a table.
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
 * Get all columns for a table.
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
 * Create a column migration function from a list of migrations.
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
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};