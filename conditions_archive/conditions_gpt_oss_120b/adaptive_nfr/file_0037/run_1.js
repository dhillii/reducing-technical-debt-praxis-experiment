```javascript
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
 * Guard predicate: is the transaction using SQLite?
 * @param {import('knex').Knex} transaction
 * @returns {boolean}
 */
function isSQLite(transaction) {
    return DatabaseInfo.isSQLite(transaction);
}

/**
 * Guard predicate: is the transaction using MySQL?
 * @param {import('knex').Knex} transaction
 * @returns {boolean}
 */
function isMySQL(transaction) {
    return DatabaseInfo.isMySQL(transaction);
}

/**
 * Predicate: should we add an algorithm clause for MySQL?
 * @param {object} options
 * @returns {boolean}
 */
function shouldAddAlgorithm(options) {
    return options?.algorithm !== 'auto';
}

/**
 * Returns the algorithm to use for MySQL column operations.
 * @param {object} options
 * @returns {string}
 */
function getAlgorithm(options) {
    return options?.algorithm || 'copy';
}

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
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

    if (columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }

    if (columnSpec.primary === true) {
        column.primary();
    }

    if (columnSpec.unique) {
        column.unique();
    }

    if (columnSpec.unsigned) {
        column.unsigned();
    }

    if (columnSpec.references) {
        column.references(columnSpec.references);
    }

    if (columnSpec.constraintName) {
        column.withKeyName(columnSpec.constraintName);
    }

    if (columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (columnSpec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }

    if (columnSpec.index === true) {
        column.index();
    }
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, table => {
        table.setNullable(column);
    });
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, table => {
        table.dropNullable(column);
    });
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} columnSpec
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const addColumnBuilder = transaction.schema.table(tableName, table => {
        addTableColumn(tableName, table, column, columnSpec);
    });

    if (isSQLite(transaction)) {
        await addColumnBuilder;
        return;
    }

    for (const sqlQuery of addColumnBuilder.toSQL()) {
        let sql = sqlQuery.sql;

        if (isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (shouldAddAlgorithm(options)) {
                sql += `, algorithm=${getAlgorithm(options)}`;
            }
        }

        await transaction.raw(sql);
    }
}

/**
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
        await dropForeign({
            fromTable: tableName,
            fromColumn: column,
            toTable,
            toColumn,
            constraintName: columnSpec.constraintName,
            transaction
        });
    }

    const dropColumnBuilder = transaction.schema.table(tableName, table => {
        table.dropColumn(column);
    });

    if (isSQLite(transaction)) {
        await dropColumnBuilder;
        return;
    }

    for (const sqlQuery of dropColumnBuilder.toSQL()) {
        let sql = sqlQuery.sql;

        if (isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (shouldAddAlgorithm(options)) {
                sql += `, algorithm=${getAlgorithm(options)}`;
            }
        }

        await transaction.raw(sql);
    }
}

/**
 * @param {string} tableName
 * @param {string} from
 * @param {string} to
 * @param {import('knex').Knex.Transaction} [transaction]
 */
async function renameColumn(tableName, from, to, transaction = db.knex) {
    logging.info(`Renaming column '${from}' to '${to}' in table '${tableName}'`);

    if (isMySQL(transaction)) {
        return await transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return await transaction.schema.table(tableName, table => {
        table.renameColumn(from, to);
    });
}

/**
 * Adds a non-unique index to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.index(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME') {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Drops a non-unique index from a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.dropIndex(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Adds a unique index to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.unique(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME') {
            logging.warn(`Constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Drops a unique key constraint from a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.dropUnique(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Predicate: does a foreign key already exist in SQLite?
 * @param {object} cfg
 * @returns {Promise<boolean>}
 */
async function foreignKeyExistsInSQLite(cfg) {
    const foreignKeys = await cfg.transaction.raw(`PRAGMA foreign_key_list('${cfg.fromTable}');`);
    return foreignKeys.some(fk => fk.table === cfg.toTable && fk.from === cfg.fromColumn && fk.to === cfg.toColumn);
}

/**
 * @param {object} cfg
 */
async function addForeign(cfg) {
    const {fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete = false, setNullDelete = false, transaction = db.knex} = cfg;

    if (isSQLite(transaction) && await foreignKeyExistsInSQLite({fromTable, fromColumn, toTable, toColumn, transaction})) {
        logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
        return;
    }

    try {
        logging.info(`Adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        let foreignKeysEnabled;
        if (isSQLite(transaction)) {
            foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
            if (foreignKeysEnabled[0].foreign_keys) {
                await db.knex.raw('PRAGMA foreign_keys = OFF;');
            }
        }

        await transaction.schema.table(fromTable, table => {
            let builder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);

            if (cascadeDelete) {
                builder = builder.onDelete('CASCADE');
            } else if (setNullDelete) {
                builder = builder.onDelete('SET NULL');
            }

            if (constraintName) {
                builder.withKeyName(constraintName);
            }
        });

        if (isSQLite(transaction) && foreignKeysEnabled[0].foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
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
 * @param {object} cfg
 */
async function dropForeign(cfg) {
    const {fromTable, fromColumn, toTable, toColumn, constraintName, transaction = db.knex} = cfg;

    if (isSQLite(transaction) && !(await foreignKeyExistsInSQLite({fromTable, fromColumn, toTable, toColumn, transaction}))) {
        logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
        return;
    }

    try {
        logging.info(`Dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        let foreignKeysEnabled;
        if (isSQLite(transaction)) {
            foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
            if (foreignKeysEnabled[0].foreign_keys) {
                await db.knex.raw('PRAGMA foreign_keys = OFF;');
            }
        }

        await transaction.schema.table(fromTable, table => {
            table.dropForeign(fromColumn, constraintName);
        });

        if (isSQLite(transaction) && foreignKeysEnabled[0].foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
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
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!isSQLite(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasPrimaryKeySQLiteError)
        });
    }

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.find(c => c.origin === 'pk');
}

/**
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
 */
async function addPrimaryKey(tableName, columns, transaction = db.knex) {
    if (isSQLite(transaction) && await hasPrimaryKeySQLite(tableName, transaction)) {
        logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
        return;
    }

    try {
        logging.info(`Adding primary key constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
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
 * @param {String} table
 * @param {import('knex').Knex} [transaction]
 * @param {Object} [tableSpec]
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, t => {
        Object.keys(tableSpec)
            .filter(column => !column.startsWith('@@'))
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
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
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
 * Creates a migration runner for column operations.
 *
 * @param {...object} migrations
 * @returns {function(import('knex').Knex): Promise<void>}
 */
function createColumnMigration(...migrations) {
    /**
     * Determines if a migration should be skipped.
     * @param {boolean} isInCorrectState
     * @returns {boolean}
     */
    function shouldSkip(isInCorrectState) {
        return isInCorrectState;
    }

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

        if (shouldSkip(isInCorrectState)) {
            logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
            return;
        }

        logging.info(`${operationVerb} ${table}.${column} column`);
        await operation(table, column, conn, columnDefinition, options);
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
```