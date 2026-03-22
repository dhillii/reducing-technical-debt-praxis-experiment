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
 * Builds the base column definition on the table builder.
 */
function buildColumnType(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasOwn(columnSpec, 'fieldtype')) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }

    if (columnSpec.type === 'string') {
        return tableBuilder.string(columnName, columnSpec.maxlength ?? 191);
    }

    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies delete behaviour (CASCADE / SET NULL) to a column builder.
 */
function applyDeleteBehaviour(column, columnSpec) {
    if (hasOwn(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (hasOwn(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies the delete behaviour to a foreign key builder.
 */
function applyForeignKeyDeleteBehaviour(fkBuilder, {cascadeDelete, setNullDelete}) {
    if (cascadeDelete) {
        return fkBuilder.onDelete('CASCADE');
    }
    if (setNullDelete) {
        return fkBuilder.onDelete('SET NULL');
    }
    return fkBuilder;
}

/**
 * Appends an algorithm clause to a raw ALTER TABLE SQL string for MySQL.
 */
function appendMySQLAlgorithm(sql, options = {}) {
    const cleaned = sql.replace(/;\s*$/, '');
    if (options.algorithm === 'auto') {
        return cleaned;
    }
    return `${cleaned}, algorithm=${options.algorithm ?? 'copy'}`;
}

/**
 * Executes a schema builder, optionally injecting MySQL algorithm hints.
 */
async function executeSchemaBuilder(builder, transaction, options = {}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    for (const sqlQuery of builder.toSQL()) {
        let sql = sqlQuery.sql;

        if (DatabaseInfo.isMySQL(transaction)) {
            sql = appendMySQLAlgorithm(sql, options);
        }

        await transaction.raw(sql);
    }
}

/**
 * Temporarily disables SQLite foreign key checks, runs an action, then restores them.
 */
async function withSQLiteForeignKeysDisabled(action) {
    const [{foreign_keys}] = await db.knex.raw('PRAGMA foreign_keys;');

    if (foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    await action();

    if (foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    }
}

/**
 * Runs a schema table operation and swallows known "already exists" / "does not exist" errors.
 */
async function safeSchemaOperation({transaction, operation, warnCodes, warnMessage}) {
    try {
        return await operation();
    } catch (err) {
        if (warnCodes.includes(err.code)) {
            logging.warn(warnMessage);
            return;
        }
        throw err;
    }
}

// ─── Column helpers ───────────────────────────────────────────────────────────

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = buildColumnType(tableBuilder, columnName, columnSpec);

    const isNullable = hasOwn(columnSpec, 'nullable') && columnSpec.nullable === true;
    column.nullable(isNullable ? undefined : false);
    // knex treats .nullable() (no args) as "make nullable" and .nullable(false) as NOT NULL

    if (hasOwn(columnSpec, 'primary') && columnSpec.primary)       column.primary();
    if (hasOwn(columnSpec, 'unique') && columnSpec.unique)         column.unique();
    if (hasOwn(columnSpec, 'unsigned') && columnSpec.unsigned)     column.unsigned();
    if (hasOwn(columnSpec, 'references'))                          column.references(columnSpec.references);
    if (hasOwn(columnSpec, 'constraintName'))                      column.withKeyName(columnSpec.constraintName);
    if (hasOwn(columnSpec, 'defaultTo'))                           column.defaultTo(columnSpec.defaultTo);
    if (hasOwn(columnSpec, 'index') && columnSpec.index)           column.index();

    applyDeleteBehaviour(column, columnSpec);
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

// ─── Column operations ────────────────────────────────────────────────────────

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
    await executeSchemaBuilder(builder, transaction, options);
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
        await dropForeign({
            fromTable: tableName,
            fromColumn: column,
            toTable,
            toColumn,
            constraintName: columnSpec.constraintName,
            transaction
        });
    }

    const builder = transaction.schema.table(tableName, table => table.dropColumn(column));
    await executeSchemaBuilder(builder, transaction, options);
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
        // The knex helper does a lot of interesting things with foreign keys that are slow on bigger MySQL clusters
        return transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return transaction.schema.table(tableName, table => table.renameColumn(from, to));
}

// ─── Index operations ─────────────────────────────────────────────────────────

/**
 * Adds a non-unique index to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    logging.info(`Adding index for '${columns}' in table '${tableName}'`);

    return safeSchemaOperation({
        transaction,
        operation: () => transaction.schema.table(tableName, table => table.index(columns)),
        warnCodes: ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
        warnMessage: `Index for '${columns}' already exists for table '${tableName}'`
    });
}

/**
 * Drops a non-unique index from a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    logging.info(`Dropping index for '${columns}' in table '${tableName}'`);

    return safeSchemaOperation({
        transaction,
        operation: () => transaction.schema.table(tableName, table => table.dropIndex(columns)),
        warnCodes: ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        warnMessage: `Constraint for '${columns}' does not exist for table '${tableName}'`
    });
}

// ─── Unique constraint operations ─────────────────────────────────────────────

/**
 * Adds a unique index to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);

    return safeSchemaOperation({
        transaction,
        operation: () => transaction.schema.table(tableName, table => table.unique(columns)),
        warnCodes: ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
        warnMessage: `Constraint for '${columns}' already exists for table '${tableName}'`
    });
}

/**
 * Drops a unique key constraint from a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);

    return safeSchemaOperation({
        transaction,
        operation: () => transaction.schema.table(tableName, table => table.dropUnique(columns)),
        warnCodes: ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        warnMessage: `Constraint for '${columns}' does not exist for table '${tableName}'`
    });
}

// ─── Foreign key operations ───────────────────────────────────────────────────

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

    return foreignKeys.some(
        fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn
    );
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
async function addForeign({
    fromTable, fromColumn, toTable, toColumn,
    constraintName, cascadeDelete = false, setNullDelete = false,
    transaction = db.knex
}) {
    const fkDescription = `${fromTable}.${fromColumn} to ${toTable}.${toColumn}`;

    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (exists) {
            logging.warn(`Skipped adding foreign key from ${fkDescription} - already exists`);
            return;
        }
    }

    try {
        logging.info(`Adding foreign key from ${fkDescription}`);

        const addForeignKey = async () => {
            await transaction.schema.table(fromTable, (table) => {
                const ref = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
                const fkBuilder = applyForeignKeyDeleteBehaviour(ref, {cascadeDelete, setNullDelete});
                if (constraintName) {
                    fkBuilder.withKeyName(constraintName);
                }
            });
        };

        if (DatabaseInfo.isSQLite(transaction)) {
            await withSQLiteForeignKeysDisabled(addForeignKey);
        } else {
            await addForeignKey();
        }
    } catch (err) {
        if (['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'].includes(err.code)) {
            logging.warn(`Skipped adding foreign key from ${fkDescription} - already exists`);
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
    const fkDescription = `${fromTable}.${fromColumn} to ${toTable}.${toColumn}`;

    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (!exists) {
            logging.warn(`Skipped dropping foreign key from ${fkDescription} - does not exist`);
            return;
        }
    }

    try {
        logging.info(`Dropping foreign key from ${fkDescription}`);

        const dropForeignKey = async () => {
            await transaction.schema.table(fromTable, table => table.dropForeign(fromColumn, constraintName));
        };

        if (DatabaseInfo.isSQLite(transaction)) {
            await withSQLiteForeignKeysDisabled(dropForeignKey);
        } else {
            await dropForeignKey();
        }
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fkDescription} - does not exist`);
            return;
        }
        throw err;
    }
}

// ─── Primary key operations ───────────────────────────────────────────────────

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
    const alreadyExistsMessage = `Primary key constraint for '${columns}' already exists for table '${tableName}'`;

    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasPrimaryKeySQLite(tableName, transaction);
        if (exists) {
            logging.warn(alreadyExistsMessage);
            return;
        }
    }

    return safeSchemaOperation({
        transaction,
        operation: () => {
            logging.info(`Adding primary key constraint for '${columns}' in table '${tableName}'`);
            return transaction.schema.table(tableName, table => table.primary(columns));
        },
        warnCodes: ['ER_MULTIPLE_PRI_KEY'],
        warnMessage: alreadyExistsMessage
    });
}

// ─── Table operations ─────────────────────────────────────────────────────────

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
    return transaction.schema.createTable(table, (t) => {
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
 * Returns a query result mapped to a flat array, handling SQLite vs MySQL differences.
 */
async function queryByClient(transaction, {sqlite, mysql}) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const response = await transaction.raw(sqlite.query);
        return _.flatten(_.map(response, sqlite.map));
    }

    if (client === 'mysql2') {
        const response = await transaction.raw(mysql.query);
        return _.flatten(_.map(response[0], mysql.map));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
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

    return queryByClient(transaction, {
        sqlite: {query: 'select * from sqlite_master where type = "table"', map: 'tbl_name'},
        mysql: {query: 'show tables', map: entry => _.values(entry)}
    });
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function getIndexes(table, transaction = db.knex) {
    return queryByClient(transaction, {
        sqlite: {query: `pragma index_list("${table}")`, map: 'name'},
        mysql: {query: `SHOW INDEXES from ${table}`, map: 'Key_name'}
    });
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function getColumns(table, transaction = db.knex) {
    return queryByClient(transaction, {
        sqlite: {query: `pragma table_info("${table}")`, map: 'name'},
        mysql: {query: `SHOW COLUMNS from ${table}`, map: 'Field'}
    });
}

// ─── Migration helpers ────────────────────────────────────────────────────────

function createColumnMigration(...migrations) {
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
    // NOTE: exposed for testing purposes only
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};
```

Key refactoring decisions:

1. **`hasOwn` helper** — eliminates the verbose `Object.prototype.hasOwnProperty.call(...)` repetition throughout `addTableColumn`.

2. **`buildColumnType`** — extracts the column-type branching logic out of `addTableColumn`, reducing its cyclomatic complexity.

3. **`applyDeleteBehaviour` / `applyForeignKeyDeleteBehaviour`** — isolates the delete-behaviour logic for reuse in both column and foreign key builders.

4. **`executeSchemaBuilder`** — deduplicates the identical SQLite/MySQL execution pattern shared by `addColumn` and `dropColumn`.

5. **`withSQLiteForeignKeysDisabled`** — extracts the PRAGMA toggle pattern repeated in both `addForeign` and `dropForeign`.

6. **`safeSchemaOperation`** — replaces the repetitive try/catch blocks in `addIndex`, `dropIndex`, `addUnique`, `dropUnique`, and `addPrimaryKey` with a single configurable helper.

7. **`queryByClient`** — unifies the SQLite/MySQL branching in `getIndexes` and `getColumns` (and partially `getTables`) into one place.

8. **`fkDescription` variable** — removes duplicated interpolation strings in `addForeign` and `dropForeign`.

9. **Optional chaining (`?.`)** — replaces the `if (tableSpec['@@INDEXES@@'])` guards in `createTable` with concise optional chaining.