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

function applyIf(spec, key, fn) {
    if (spec[key]) {
        fn(spec[key]);
    }
}

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const {type, fieldtype, maxlength, nullable, primary, unique, unsigned, references, constraintName, cascadeDelete, setNullDelete, defaultTo, index} = columnSpec;

    // create column
    let column;
    if (type === 'text' && fieldtype) {
        column = tableBuilder[type](columnName, fieldtype);
    } else if (type === 'string') {
        column = tableBuilder[type](columnName, maxlength ?? 191);
    } else {
        column = tableBuilder[type](columnName);
    }

    // apply modifiers
    column.nullable(nullable === true);
    applyIf(columnSpec, 'primary', () => column.primary());
    applyIf(columnSpec, 'unique', () => column.unique());
    applyIf(columnSpec, 'unsigned', () => column.unsigned());
    applyIf(columnSpec, 'references', () => column.references(references));
    applyIf(columnSpec, 'constraintName', () => column.withKeyName(constraintName));
    if (cascadeDelete) column.onDelete('CASCADE');
    else if (setNullDelete) column.onDelete('SET NULL');
    applyIf(columnSpec, 'defaultTo', () => column.defaultTo(defaultTo));
    if (index) column.index();
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, t => t.setNullable(column));
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, t => t.dropNullable(column));
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
    const builder = transaction.schema.table(tableName, t => addTableColumn(tableName, t, column, columnSpec));

    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    for (const {sql: rawSql} of builder.toSQL()) {
        let sql = rawSql.replace(/;\s*$/, '');
        if (DatabaseInfo.isMySQL(transaction) && options?.algorithm !== 'auto') {
            const algorithm = options?.algorithm || 'copy';
            sql += `, algorithm=${algorithm}`;
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
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }

    const builder = transaction.schema.table(tableName, t => t.dropColumn(column));

    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    for (const {sql: rawSql} of builder.toSQL()) {
        let sql = rawSql.replace(/;\s*$/, '');
        if (DatabaseInfo.isMySQL(transaction) && options?.algorithm !== 'auto') {
            const algorithm = options?.algorithm || 'copy';
            sql += `, algorithm=${algorithm}`;
        }
        await transaction.raw(sql);
    }
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

    return transaction.schema.table(tableName, t => t.renameColumn(from, to));
}

/**
 * Adds an non-unique index to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);
        return transaction.schema.table(tableName, t => t.index(columns));
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_DUP_KEYNAME'].includes(err.code)) {
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
        return transaction.schema.table(tableName, t => t.dropIndex(columns));
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'].includes(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Adds an unique index to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
        return transaction.schema.table(tableName, t => t.unique(columns));
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_DUP_KEYNAME'].includes(err.code)) {
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
        return transaction.schema.table(tableName, t => t.dropUnique(columns));
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'].includes(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if a foreign key exists in a table over the given columns.
 *
 * @param {Object} cfg
 * @param {string} cfg.fromTable
 * @param {string} cfg.fromColumn
 * @param {string} cfg.toTable
 * @param {string} cfg.toColumn
 * @param {import('knex').Knex} [cfg.transaction]
 */
async function hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction = db.knex}) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasForeignSQLite3)});
    }

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return foreignKeys.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

/**
 * Adds a foreign key to a table.
 *
 * @param {Object} cfg
 * @param {string} cfg.fromTable
 * @param {string} cfg.fromColumn
 * @param {string} cfg.toTable
 * @param {string} cfg.toColumn
 * @param {string} [cfg.constraintName]
 * @param {boolean} [cfg.cascadeDelete=false]
 * @param {boolean} [cfg.setNullDelete=false]
 * @param {import('knex').Knex} [cfg.transaction]
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

        let foreignKeysEnabled;
        if (DatabaseInfo.isSQLite(transaction)) {
            foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
            if (foreignKeysEnabled[0].foreign_keys) await db.knex.raw('PRAGMA foreign_keys = OFF;');
        }

        await transaction.schema.table(fromTable, t => {
            const fk = t.foreign(fromColumn).references(`${toTable}.${toColumn}`);
            if (cascadeDelete) fk.onDelete('CASCADE');
            else if (setNullDelete) fk.onDelete('SET NULL');
            if (constraintName) fk.withKeyName(constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction) && foreignKeysEnabled[0].foreign_keys) {
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
 * Drops a foreign key from a table.
 *
 * @param {Object} cfg
 * @param {string} cfg.fromTable
 * @param {string} cfg.fromColumn
 * @param {string} cfg.toTable
 * @param {string} cfg.toColumn
 * @param {string} [cfg.constraintName]
 * @param {import('knex').Knex} [cfg.transaction]
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

        let foreignKeysEnabled;
        if (DatabaseInfo.isSQLite(transaction)) {
            foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
            if (foreignKeysEnabled[0].foreign_keys) await db.knex.raw('PRAGMA foreign_keys = OFF;');
        }

        await transaction.schema.table(fromTable, t => t.dropForeign(fromColumn, constraintName));

        if (DatabaseInfo.isSQLite(transaction) && foreignKeysEnabled[0].foreign_keys) {
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
 * Checks if primary key index exists in a table over the given columns.
 *
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasPrimaryKeySQLiteError)});
    }

    const constraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return constraints.find(c => c.origin === 'pk');
}

/**
 * Adds an primary key index to a table over the given columns.
 *
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
        return transaction.schema.table(tableName, t => t.primary(columns));
    } catch (err) {
        if (err.code === 'ER_MULTIPLE_PRI_KEY') {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Creates a table based on a spec.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 * @param {Object} [tableSpec]
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, t => {
        Object.keys(tableSpec)
            .filter(col => !col.startsWith('@@'))
            .forEach(col => addTableColumn(table, t, col, tableSpec[col]));

        if (tableSpec['@@INDEXES@@']) tableSpec['@@INDEXES@@'].forEach(idx => t.index(idx));
        if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(u => t.unique(u));
    });
}

/**
 * Drops a table if it exists.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
 * Retrieves all tables.
 *
 * @param {import('knex').Knex} [transaction]
 */
async function getTables(transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const res = await transaction.raw('select * from sqlite_master where type = "table"');
        return _.reject(_.map(res, 'tbl_name'), n => n === 'sqlite_sequence');
    }
    if (client === 'mysql2') {
        const res = await transaction.raw('show tables');
        return _.flatten(_.map(res[0], entry => _.values(entry)));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * Retrieves indexes for a table.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
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
 * Retrieves columns for a table.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
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
 * Creates a migration runner for column operations.
 *
 * @param  {...any} migrations
 */
function createColumnMigration(...migrations) {
    async function run(conn, {table, column, dbIsInCorrectState, operation, operationVerb, columnDefinition, options}) {
        const hasColumn = await conn.schema.hasColumn(table, column);
        if (dbIsInCorrectState(hasColumn)) {
            logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
            return;
        }
        logging.info(`${operationVerb} ${table}.${column} column`);
        await operation(table, column, conn, columnDefinition, options);
    }

    return async conn => {
        for (const m of migrations) {
            await run(conn, m);
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
```