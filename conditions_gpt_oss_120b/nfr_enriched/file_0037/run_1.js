const _ = require('lodash');
const logging = require('@tryghost/logging');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const db = require('../db');
const DatabaseInfo = require('@tryghost/database-info');
const schema = require('./schema');

const messages = {
    hasPrimaryKeySQLiteError: 'Must use hasPrimaryKeySQLite on an SQLite3 database',
    hasForeignSQLite3: 'Must use hasForeignSQLite on an SQLite3 database',
    noSupportForDatabase: 'No support for database client {client}'
};

/**
 * Apply column modifiers based on the specification.
 * @param {object} column - Knex column builder.
 * @param {object} spec - Column specification.
 */
function applyColumnSpec(column, spec) {
    if (spec.nullable) {
        column.nullable();
    } else {
        column.nullable(false);
    }

    if (spec.primary) {
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

    if (spec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (spec.setNullDelete) {
        column.onDelete('SET NULL');
    }

    if (spec.defaultTo !== undefined) {
        column.defaultTo(spec.defaultTo);
    }

    if (spec.index) {
        column.index();
    }

    return column;
}

/**
 * Add a column to a table based on the schema definition.
 *
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    let column;

    if (columnSpec.type === 'text' && columnSpec.fieldtype) {
        column = tableBuilder.text(columnName, columnSpec.fieldtype);
    } else if (columnSpec.type === 'string') {
        const length = columnSpec.maxlength || 191;
        column = tableBuilder.string(columnName, length);
    } else {
        column = tableBuilder[columnSpec.type](columnName);
    }

    applyColumnSpec(column, columnSpec);
}

/**
 * Execute raw SQL statements for non‑SQLite databases.
 *
 * @param {object[]} sqlQueries - Array of Knex query objects.
 * @param {import('knex').Knex} transaction
 * @param {'inplace'|'copy'|'auto'} [algorithm] - MySQL only.
 */
async function executeNonSQLite(sqlQueries, transaction, algorithm) {
    for (const query of sqlQueries) {
        let sql = query.sql.replace(/;\s*$/, '');

        if (DatabaseInfo.isMySQL(transaction) && algorithm !== 'auto') {
            const algo = algorithm || 'copy';
            sql += `, algorithm=${algo}`;
        }

        await transaction.raw(sql);
    }
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} columnSpec
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const builder = transaction.schema.table(tableName, table => {
        addTableColumn(tableName, table, column, columnSpec);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    await executeNonSQLite(builder.toSQL(), transaction, options.algorithm);
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} [columnSpec]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function dropColumn(tableName, column, transaction = db.knex, columnSpec = {}, options = {}) {
    if (columnSpec.references) {
        const [toTable, toColumn] = columnSpec.references.split('.');
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }

    const builder = transaction.schema.table(tableName, table => {
        table.dropColumn(column);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    await executeNonSQLite(builder.toSQL(), transaction, options.algorithm);
}

/**
 * @param {string} tableName
 * @param {string} from
 * @param {string} to
 * @param {import('knex').Knex} [transaction]
 */
async function renameColumn(tableName, from, to, transaction = db.knex) {
    logging.info(`Renaming column '${from}' to '${to}' in table '${tableName}'`);

    if (DatabaseInfo.isMySQL(transaction)) {
        return transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return transaction.schema.table(tableName, table => {
        table.renameColumn(from, to);
    });
}

/**
 * Generic index operation with error handling.
 *
 * @param {string} action - 'add' or 'drop'.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} transaction
 */
async function handleIndex(action, tableName, columns, transaction) {
    const method = action === 'add' ? 'index' : 'dropIndex';
    const logVerb = action === 'add' ? 'Adding' : 'Dropping';
    const alreadyMsg = action === 'add' ? 'already exists' : 'does not exist';
    const errCodes = action === 'add' ? ['SQLITE_ERROR', 'ER_DUP_KEYNAME'] : ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'];

    try {
        logging.info(`${logVerb} index for '${columns}' in table '${tableName}'`);
        await transaction.schema.table(tableName, table => {
            table[method](columns);
        });
    } catch (err) {
        if (errCodes.includes(err.code)) {
            logging.warn(`Index for '${columns}' ${alreadyMsg} for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Adds an non‑unique index.
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    await handleIndex('add', tableName, columns, transaction);
}

/**
 * Drops a non‑unique index.
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    await handleIndex('drop', tableName, columns, transaction);
}

/**
 * Generic unique constraint operation with error handling.
 *
 * @param {string} action - 'add' or 'drop'.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} transaction
 */
async function handleUnique(action, tableName, columns, transaction) {
    const method = action === 'add' ? 'unique' : 'dropUnique';
    const logVerb = action === 'add' ? 'Adding' : 'Dropping';
    const alreadyMsg = action === 'add' ? 'already exists' : 'does not exist';
    const errCodes = action === 'add' ? ['SQLITE_ERROR', 'ER_DUP_KEYNAME'] : ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'];

    try {
        logging.info(`${logVerb} unique constraint for '${columns}' in table '${tableName}'`);
        await transaction.schema.table(tableName, table => {
            table[method](columns);
        });
    } catch (err) {
        if (errCodes.includes(err.code)) {
            logging.warn(`Constraint for '${columns}' ${alreadyMsg} for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Adds a unique constraint.
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    await handleUnique('add', tableName, columns, transaction);
}

/**
 * Drops a unique constraint.
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    await handleUnique('drop', tableName, columns, transaction);
}

/**
 * Checks if a foreign key exists in SQLite.
 */
async function hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction = db.knex}) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasForeignSQLite3)});
    }

    const result = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return result.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

/**
 * Enable or disable SQLite foreign key checks.
 *
 * @param {import('knex').Knex} transaction
 * @param {boolean} enable
 * @returns {Promise<boolean>} - previous state
 */
async function toggleSQLiteForeignKeys(transaction, enable) {
    const res = await db.knex.raw('PRAGMA foreign_keys;');
    const currentlyEnabled = !!res[0].foreign_keys;
    if (currentlyEnabled !== enable) {
        await db.knex.raw(`PRAGMA foreign_keys = ${enable ? 'ON' : 'OFF'};`);
    }
    return currentlyEnabled;
}

/**
 * Adds a foreign key.
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

        const wasEnabled = DatabaseInfo.isSQLite(transaction) ? await toggleSQLiteForeignKeys(transaction, false) : null;

        await transaction.schema.table(fromTable, table => {
            let builder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
            if (cascadeDelete) builder = builder.onDelete('CASCADE');
            else if (setNullDelete) builder = builder.onDelete('SET NULL');
            if (constraintName) builder.withKeyName(constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction) && wasEnabled) {
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
 * Drops a foreign key.
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

        const wasEnabled = DatabaseInfo.isSQLite(transaction) ? await toggleSQLiteForeignKeys(transaction, false) : null;

        await transaction.schema.table(fromTable, table => {
            table.dropForeign(fromColumn, constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction) && wasEnabled) {
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
 * Checks for a primary key in SQLite.
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasPrimaryKeySQLiteError)});
    }

    const list = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return list.find(c => c.origin === 'pk');
}

/**
 * Adds a primary key constraint.
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
        await transaction.schema.table(tableName, table => {
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
 * Create a table from a spec.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 * @param {object} [tableSpec]
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, t => {
        Object.keys(tableSpec)
            .filter(col => !col.startsWith('@@'))
            .forEach(col => addTableColumn(table, t, col, tableSpec[col]));

        if (tableSpec['@@INDEXES@@']) {
            tableSpec['@@INDEXES@@'].forEach(idx => t.index(idx));
        }
        if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
            tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(u => t.unique(u));
        }
    });
}

/**
 * Drop a table if it exists.
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
 * Retrieve list of tables.
 */
async function getTables(transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const res = await transaction.raw('select * from sqlite_master where type = "table"');
        return _.reject(_.map(res, 'tbl_name'), name => name === 'sqlite_sequence');
    }

    if (client === 'mysql2') {
        const res = await transaction.raw('show tables');
        return _.flatten(_.map(res[0], entry => _.values(entry)));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * Retrieve indexes for a table.
 */
async function getIndexes(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const res = await transaction.raw(`pragma index_list("${table}")`);
        return _.flatten(_.map(res, 'name'));
    }

    if (client === 'mysql2') {
        const res = await transaction.raw(`SHOW INDEXES from ${table}`);
        return _.flatten(_.map(res[0], 'Key_name'));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * Retrieve columns for a table.
 */
async function getColumns(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const res = await transaction.raw(`pragma table_info("${table}")`);
        return _.flatten(_.map(res, 'name'));
    }

    if (client === 'mysql2') {
        const res = await transaction.raw(`SHOW COLUMNS from ${table}`);
        return _.flatten(_.map(res[0], 'Field'));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * Helper to run a series of column migrations.
 *
 * @param {...object} migrations
 * @returns {function(import('knex').Knex):Promise<void>}
 */
function createColumnMigration(...migrations) {
    async function runMigration(conn, migration) {
        const {table, column, dbIsInCorrectState, operation, operationVerb, columnDefinition, options} = migration;
        const hasColumn = await conn.schema.hasColumn(table, column);
        const correct = dbIsInCorrectState(hasColumn);

        if (correct) {
            logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
            return;
        }

        logging.info(`${operationVerb} ${table}.${column} column`);
        await operation(table, column, conn, columnDefinition, options);
    }

    return async function columnMigration(conn) {
        for (const m of migrations) {
            await runMigration(conn, m);
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