Here's the refactored code with reduced complexity through several improvements:

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Builds the base column definition based on type and related options.
 */
function buildBaseColumn(tableBuilder, columnName, columnSpec) {
    const {type, fieldtype, maxlength = 191} = columnSpec;

    if (type === 'text' && hasOwn(columnSpec, 'fieldtype')) {
        return tableBuilder[type](columnName, fieldtype);
    }
    if (type === 'string') {
        return tableBuilder[type](columnName, hasOwn(columnSpec, 'maxlength') ? maxlength : 191);
    }
    return tableBuilder[type](columnName);
}

/**
 * Resolves the delete behavior for a column.
 */
function applyDeleteBehavior(column, columnSpec) {
    if (hasOwn(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (hasOwn(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
}

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = buildBaseColumn(tableBuilder, columnName, columnSpec);

    column[columnSpec.nullable === true ? 'nullable' : 'notNullable']();

    if (hasOwn(columnSpec, 'primary') && columnSpec.primary)         column.primary();
    if (hasOwn(columnSpec, 'unique') && columnSpec.unique)           column.unique();
    if (hasOwn(columnSpec, 'unsigned') && columnSpec.unsigned)       column.unsigned();
    if (hasOwn(columnSpec, 'references'))                            column.references(columnSpec.references);
    if (hasOwn(columnSpec, 'constraintName'))                        column.withKeyName(columnSpec.constraintName);
    if (hasOwn(columnSpec, 'defaultTo'))                             column.defaultTo(columnSpec.defaultTo);
    if (hasOwn(columnSpec, 'index') && columnSpec.index)             column.index();

    applyDeleteBehavior(column, columnSpec);
}

// ─── Algorithm Helpers ────────────────────────────────────────────────────────

/**
 * Executes a schema builder, applying MySQL algorithm hints when appropriate.
 */
async function executeWithAlgorithm(builder, transaction, options = {}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    for (const sqlQuery of builder.toSQL()) {
        let sql = sqlQuery.sql;

        if (DatabaseInfo.isMySQL(transaction) && options.algorithm !== 'auto') {
            const algorithm = options.algorithm || 'copy';
            sql = sql.replace(/;\s*$/, '') + `, algorithm=${algorithm}`;
        }

        await transaction.raw(sql);
    }
}

// ─── SQLite Foreign Key Pragma Helpers ────────────────────────────────────────

async function disableSQLiteForeignKeys() {
    const [{foreign_keys}] = await db.knex.raw('PRAGMA foreign_keys;');
    if (foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }
    return foreign_keys;
}

async function restoreSQLiteForeignKeys(wasEnabled) {
    if (wasEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    }
}

async function withSQLiteForeignKeysDisabled(transaction, fn) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return fn();
    }
    const wasEnabled = await disableSQLiteForeignKeys();
    try {
        await fn();
    } finally {
        await restoreSQLiteForeignKeys(wasEnabled);
    }
}

// ─── Nullable ─────────────────────────────────────────────────────────────────

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, table => table.setNullable(column));
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, table => table.dropNullable(column));
}

// ─── Column Operations ────────────────────────────────────────────────────────

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex.Transaction} [transaction]
 * @param {object} columnSpec
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const builder = transaction.schema.table(tableName, table => addTableColumn(tableName, table, column, columnSpec));
    await executeWithAlgorithm(builder, transaction, options);
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
    if (hasOwn(columnSpec, 'references')) {
        const [toTable, toColumn] = columnSpec.references.split('.');
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }

    const builder = transaction.schema.table(tableName, table => table.dropColumn(column));
    await executeWithAlgorithm(builder, transaction, options);
}

/**
 * @param {string} tableName
 * @param {string} from
 * @param {string} to
 * @param {import('knex').Knex.Transaction} [transaction]
 */
async function renameColumn(tableName, from, to, transaction = db.knex) {
    logging.info(`Renaming column '${from}' to '${to}' in table '${tableName}'`);

    if (DatabaseInfo.isMySQL(transaction)) {
        return transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return transaction.schema.table(tableName, table => table.renameColumn(from, to));
}

// ─── Index / Unique Constraint Operations ─────────────────────────────────────

/**
 * Wraps a schema operation with consistent error handling for duplicate/missing constraints.
 */
async function schemaOperationWithWarning({operation, successLog, warnLog, duplicateCodes, missingCodes}) {
    try {
        logging.info(successLog);
        return await operation();
    } catch (err) {
        const isDuplicate = duplicateCodes && duplicateCodes.includes(err.code);
        const isMissing = missingCodes && missingCodes.includes(err.code);

        if (isDuplicate || isMissing) {
            logging.warn(warnLog);
            return;
        }
        throw err;
    }
}

/**
 * Adds a non-unique index to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
function addIndex(tableName, columns, transaction = db.knex) {
    return schemaOperationWithWarning({
        operation: () => transaction.schema.table(tableName, table => table.index(columns)),
        successLog: `Adding index for '${columns}' in table '${tableName}'`,
        warnLog: `Index for '${columns}' already exists for table '${tableName}'`,
        duplicateCodes: ['SQLITE_ERROR', 'ER_DUP_KEYNAME']
    });
}

/**
 * Drops a non-unique index from a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
function dropIndex(tableName, columns, transaction = db.knex) {
    return schemaOperationWithWarning({
        operation: () => transaction.schema.table(tableName, table => table.dropIndex(columns)),
        successLog: `Dropping index for '${columns}' in table '${tableName}'`,
        warnLog: `Constraint for '${columns}' does not exist for table '${tableName}'`,
        missingCodes: ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']
    });
}

/**
 * Adds a unique constraint to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
function addUnique(tableName, columns, transaction = db.knex) {
    return schemaOperationWithWarning({
        operation: () => transaction.schema.table(tableName, table => table.unique(columns)),
        successLog: `Adding unique constraint for '${columns}' in table '${tableName}'`,
        warnLog: `Constraint for '${columns}' already exists for table '${tableName}'`,
        duplicateCodes: ['SQLITE_ERROR', 'ER_DUP_KEYNAME']
    });
}

/**
 * Drops a unique constraint from a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
function dropUnique(tableName, columns, transaction = db.knex) {
    return schemaOperationWithWarning({
        operation: () => transaction.schema.table(tableName, table => table.dropUnique(columns)),
        successLog: `Dropping unique constraint for '${columns}' in table '${tableName}'`,
        warnLog: `Constraint for '${columns}' does not exist for table '${tableName}'`,
        missingCodes: ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']
    });
}

// ─── Foreign Key Operations ───────────────────────────────────────────────────

/**
 * Checks if a foreign key exists in a table (SQLite only).
 *
 * @param {Object} config
 * @param {string} config.fromTable
 * @param {string} config.fromColumn
 * @param {string} config.toTable
 * @param {string} config.toColumn
 * @param {import('knex').Knex} [config.transaction]
 */
async function hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction = db.knex}) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasForeignSQLite3)});
    }

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return foreignKeys.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

/**
 * Builds a foreign key reference with optional delete behavior.
 */
function buildForeignKey(table, fromColumn, toTable, toColumn, {cascadeDelete, setNullDelete, constraintName}) {
    let fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);

    if (cascadeDelete)  fkBuilder = fkBuilder.onDelete('CASCADE');
    if (setNullDelete)  fkBuilder = fkBuilder.onDelete('SET NULL');
    if (constraintName) fkBuilder = fkBuilder.withKeyName(constraintName);
}

/**
 * Adds a foreign key to a table.
 *
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
    const fkDesc = `${fromTable}.${fromColumn} to ${toTable}.${toColumn}`;

    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (exists) {
            logging.warn(`Skipped adding foreign key from ${fkDesc} - already exists`);
            return;
        }
    }

    try {
        logging.info(`Adding foreign key from ${fkDesc}`);
        await withSQLiteForeignKeysDisabled(transaction, () =>
            transaction.schema.table(fromTable, table =>
                buildForeignKey(table, fromColumn, toTable, toColumn, {cascadeDelete, setNullDelete, constraintName})
            )
        );
    } catch (err) {
        if (['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'].includes(err.code)) {
            logging.warn(`Skipped adding foreign key from ${fkDesc} - already exists`);
            return;
        }
        throw err;
    }
}

/**
 * Drops a foreign key from a table.
 *
 * @param {Object} config
 * @param {string} config.fromTable
 * @param {string} config.fromColumn
 * @param {string} config.toTable
 * @param {string} config.toColumn
 * @param {string} [config.constraintName]
 * @param {import('knex').Knex} [config.transaction]
 */
async function dropForeign({fromTable, fromColumn, toTable, toColumn, constraintName, transaction = db.knex}) {
    const fkDesc = `${fromTable}.${fromColumn} to ${toTable}.${toColumn}`;

    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (!exists) {
            logging.warn(`Skipped dropping foreign key from ${fkDesc} - does not exist`);
            return;
        }
    }

    try {
        logging.info(`Dropping foreign key from ${fkDesc}`);
        await withSQLiteForeignKeysDisabled(transaction, () =>
            transaction.schema.table(fromTable, table => table.dropForeign(fromColumn, constraintName))
        );
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fkDesc} - does not exist`);
            return;
        }
        throw err;
    }
}

// ─── Primary Key Operations ───────────────────────────────────────────────────

/**
 * Checks if a primary key index exists in a table (SQLite only).
 *
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasPrimaryKeySQLiteError)});
    }

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.find(c => c.origin === 'pk');
}

/**
 * Adds a primary key index to a table over the given columns.
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

    return schemaOperationWithWarning({
        operation: () => transaction.schema.table(tableName, table => table.primary(columns)),
        successLog: `Adding primary key constraint for '${columns}' in table '${tableName}'`,
        warnLog: `Primary key constraint for '${columns}' already exists for table '${tableName}'`,
        duplicateCodes: ['ER_MULTIPLE_PRI_KEY']
    });
}

// ─── Table Operations ─────────────────────────────────────────────────────────

/**
 * Creates a table according to the provided spec, or falls back to the current schema.
 *
 * NOTE: does NOT check if the table already exists.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 * @param {object} [tableSpec]
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, function (t) {
        Object.keys(tableSpec)
            .filter(column => !column.startsWith('@@'))
            .forEach(column => addTableColumn(table, t, column, tableSpec[column]));

        tableSpec['@@INDEXES@@']?.forEach(index => t.index(index));
        tableSpec['@@UNIQUE_CONSTRAINTS@@']?.forEach(unique => t.unique(unique));
    });
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

// ─── Introspection ────────────────────────────────────────────────────────────

/**
 * Runs a client-specific query and rejects with a helpful message for unsupported clients.
 */
async function runClientQuery(transaction, {sqlite, mysql}) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') return sqlite(transaction);
    if (client === 'mysql2') return mysql(transaction);

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * @param {import('knex').Knex} [transaction]
 */
function getTables(transaction = db.knex) {
    return runClientQuery(transaction, {
        sqlite: async (trx) => {
            const response = await trx.raw('select * from sqlite_master where type = "table"');
            return _.reject(_.map(response, 'tbl_name'), name => name === 'sqlite_sequence');
        },
        mysql: async (trx) => {
            const response = await trx.raw('show tables');
            return _.flatten(_.map(response[0], entry => _.values(entry)));
        }
    });
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function getIndexes(table, transaction = db.knex) {
    return runClientQuery(transaction, {
        sqlite: async (trx) => {
            const response = await trx.raw(`pragma index_list("${table}")`);
            return _.flatten(_.map(response, 'name'));
        },
        mysql: async (trx) => {
            const response = await trx.raw(`SHOW INDEXES from ${table}`);
            return _.flatten(_.map(response[0], 'Key_name'));
        }
    });
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function getColumns(table, transaction = db.knex) {
    return runClientQuery(transaction, {
        sqlite: async (trx) => {
            const response = await trx.raw(`pragma table_info("${table}")`);
            return _.flatten(_.map(response, 'name'));
        },
        mysql: async (trx) => {
            const response = await trx.raw(`SHOW COLUMNS from ${table}`);
            return _.flatten(_.map(response[0], 'Field'));
        }
    });
}

// ─── Migration Helpers ────────────────────────────────────────────────────────

async function runColumnMigration(conn, migration) {
    const {table, column, dbIsInCorrectState, operation, operationVerb, columnDefinition, options} = migration;

    const hasColumn = await conn.schema.hasColumn(table, column);

    if (dbIsInCorrectState(hasColumn)) {
        logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
    } else {
        logging.info(`${operationVerb} ${table}.${column} column`);
        await operation(table, column, conn, columnDefinition, options);
    }
}

function createColumnMigration(...migrations) {
    return async function columnMigration(conn) {
        for (const migration of migrations) {
            await runColumnMigration(conn, migration);
        }
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

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

Key refactoring improvements:

1. **`hasOwn` helper** — eliminates repeated `Object.prototype.hasOwnProperty.call(...)` calls throughout.

2. **`buildBaseColumn` / `applyDeleteBehavior`** — splits `addTableColumn` into focused sub-functions, reducing its cognitive complexity.

3. **`executeWithAlgorithm`** — extracts the duplicated SQLite/MySQL algorithm logic shared by `addColumn` and `dropColumn`.

4. **`withSQLiteForeignKeysDisabled`** — encapsulates the SQLite foreign key pragma toggle pattern used in both `addForeign` and `dropForeign`.

5. **`schemaOperationWithWarning`** — unifies the repetitive try/catch/warn pattern across `addIndex`, `dropIndex`, `addUnique`, `dropUnique`, and `addPrimaryKey`.

6. **`runClientQuery`** — replaces the duplicated `if sqlite / if mysql / reject` pattern in `getTables`, `getIndexes`, and `getColumns`.

7. **`buildForeignKey`** — extracts the FK builder chain from `addForeign`, reducing nesting.

8. **`runColumnMigration`** — extracted from `createColumnMigration` to separate concerns.

9. **Optional chaining** (`?.`) replaces `if` guards for `@@INDEXES@@` and `@@UNIQUE_CONSTRAINTS@@` in `createTable`.

10. **`fkDesc` string variable** — avoids repeating the same interpolated string multiple times in `addForeign`/`dropForeign`.