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
 * Applies the delete behaviour (CASCADE / SET NULL) to a column builder.
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
 * Appends the MySQL algorithm clause to a raw SQL string.
 */
function appendMySQLAlgorithm(sql, options = {}) {
    if (options.algorithm === 'auto') {
        return sql;
    }
    const algorithm = options.algorithm || 'copy';
    return `${sql.replace(/;\s*$/, '')}, algorithm=${algorithm}`;
}

/**
 * Executes a schema builder, applying MySQL algorithm hints when needed.
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
 * Temporarily disables SQLite foreign key checks, runs an operation, then
 * restores the previous state.
 */
async function withSQLiteForeignKeysDisabled(transaction, operation) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return operation();
    }

    const [{foreign_keys: wasEnabled}] = await db.knex.raw('PRAGMA foreign_keys;');

    if (wasEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    try {
        await operation();
    } finally {
        if (wasEnabled) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
    }
}

/**
 * Wraps a schema operation with consistent duplicate-key / missing-key warning
 * handling.
 *
 * @param {Function} operation - async function to execute
 * @param {string[]} duplicateCodes - error codes that indicate "already exists"
 * @param {string[]} missingCodes - error codes that indicate "does not exist"
 * @param {string} warnMessage - message to log on a handled error
 */
async function withConstraintErrorHandling(operation, duplicateCodes, missingCodes, warnMessage) {
    try {
        return await operation();
    } catch (err) {
        if ([...duplicateCodes, ...missingCodes].includes(err.code)) {
            logging.warn(warnMessage);
            return;
        }
        throw err;
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

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

    if (hasOwn(columnSpec, 'primary') && columnSpec.primary)       column.primary();
    if (hasOwn(columnSpec, 'unique') && columnSpec.unique)         column.unique();
    if (hasOwn(columnSpec, 'unsigned') && columnSpec.unsigned)     column.unsigned();
    if (hasOwn(columnSpec, 'references'))                          column.references(columnSpec.references);
    if (hasOwn(columnSpec, 'constraintName'))                      column.withKeyName(columnSpec.constraintName);
    if (hasOwn(columnSpec, 'defaultTo'))                           column.defaultTo(columnSpec.defaultTo);
    if (hasOwn(columnSpec, 'index') && columnSpec.index)           column.index();

    applyDeleteBehaviour(column, columnSpec);
}

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
        return transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return transaction.schema.table(tableName, table => table.renameColumn(from, to));
}

/**
 * Adds a non-unique index to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    logging.info(`Adding index for '${columns}' in table '${tableName}'`);

    return withConstraintErrorHandling(
        () => transaction.schema.table(tableName, table => table.index(columns)),
        ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
        [],
        `Index for '${columns}' already exists for table '${tableName}'`
    );
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

    return withConstraintErrorHandling(
        () => transaction.schema.table(tableName, table => table.dropIndex(columns)),
        [],
        ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        `Constraint for '${columns}' does not exist for table '${tableName}'`
    );
}

/**
 * Adds a unique constraint to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);

    return withConstraintErrorHandling(
        () => transaction.schema.table(tableName, table => table.unique(columns)),
        ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
        [],
        `Constraint for '${columns}' already exists for table '${tableName}'`
    );
}

/**
 * Drops a unique constraint from a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);

    return withConstraintErrorHandling(
        () => transaction.schema.table(tableName, table => table.dropUnique(columns)),
        [],
        ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        `Constraint for '${columns}' does not exist for table '${tableName}'`
    );
}

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
    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (exists) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
    }

    try {
        logging.info(`Adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        await withSQLiteForeignKeysDisabled(transaction, () =>
            transaction.schema.table(fromTable, (table) => {
                const ref = `${toTable}.${toColumn}`;
                let fkBuilder = applyForeignKeyDeleteBehaviour(
                    table.foreign(fromColumn).references(ref),
                    {cascadeDelete, setNullDelete}
                );
                if (constraintName) {
                    fkBuilder.withKeyName(constraintName);
                }
            })
        );
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

        await withSQLiteForeignKeysDisabled(transaction, () =>
            transaction.schema.table(fromTable, table => table.dropForeign(fromColumn, constraintName))
        );
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

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
 * Adds a primary key constraint to a table.
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

    return withConstraintErrorHandling(
        () => {
            logging.info(`Adding primary key constraint for '${columns}' in table '${tableName}'`);
            return transaction.schema.table(tableName, table => table.primary(columns));
        },
        ['ER_MULTIPLE_PRI_KEY'],
        [],
        `Primary key constraint for '${columns}' already exists for table '${tableName}'`
    );
}

/**
 * Creates a table according to the provided spec, or falls back to the current schema.
 *
 * NOTE: does NOT check if the table already exists.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 * @param {Object} [tableSpec]
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

// ─── DB Introspection ────────────────────────────────────────────────────────

const DB_QUERIES = {
    sqlite3: {
        tables: async (trx) => {
            const rows = await trx.raw('select * from sqlite_master where type = "table"');
            return _.reject(_.map(rows, 'tbl_name'), name => name === 'sqlite_sequence');
        },
        indexes: async (trx, table) => {
            const rows = await trx.raw(`pragma index_list("${table}")`);
            return _.flatten(_.map(rows, 'name'));
        },
        columns: async (trx, table) => {
            const rows = await trx.raw(`pragma table_info("${table}")`);
            return _.flatten(_.map(rows, 'name'));
        }
    },
    mysql2: {
        tables: async (trx) => {
            const [rows] = await trx.raw('show tables');
            return _.flatten(_.map(rows, entry => _.values(entry)));
        },
        indexes: async (trx, table) => {
            const [rows] = await trx.raw(`SHOW INDEXES from ${table}`);
            return _.flatten(_.map(rows, 'Key_name'));
        },
        columns: async (trx, table) => {
            const [rows] = await trx.raw(`SHOW COLUMNS from ${table}`);
            return _.flatten(_.map(rows, 'Field'));
        }
    }
};

/**
 * Resolves the correct DB query set or rejects with an unsupported-client error.
 */
function getDBQueries(transaction) {
    const client = transaction.client.config.client;
    const queries = DB_QUERIES[client];

    if (!queries) {
        return Promise.reject(new Error(tpl(messages.noSupportForDatabase, {client})));
    }

    return queries;
}

/**
 * @param {import('knex').Knex} [transaction]
 */
async function getTables(transaction = db.knex) {
    const queries = await getDBQueries(transaction);
    return queries.tables(transaction);
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getIndexes(table, transaction = db.knex) {
    const queries = await getDBQueries(transaction);
    return queries.indexes(transaction, table);
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getColumns(table, transaction = db.knex) {
    const queries = await getDBQueries(transaction);
    return queries.columns(transaction, table);
}

// ─── Migration Helpers ───────────────────────────────────────────────────────

/**
 * Runs a single column migration step.
 */
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

/**
 * Creates a migration function that runs one or more column migrations in sequence.
 *
 * @param {...Object} migrations
 */
function createColumnMigration(...migrations) {
    return async function columnMigration(conn) {
        for (const migration of migrations) {
            await runColumnMigration(conn, migration);
        }
    };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

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

---

### Key refactoring decisions

| Area | What changed | Why |
|---|---|---|
| **`hasOwn` helper** | Extracted `Object.prototype.hasOwnProperty.call` into a one-liner | Eliminates repetitive boilerplate throughout `addTableColumn` |
| **`buildColumnType`** | Extracted column-type branching from `addTableColumn` | Single responsibility; easier to test in isolation |
| **`applyDeleteBehaviour` / `applyForeignKeyDeleteBehaviour`** | Extracted delete-behaviour logic | Removes duplication between `addTableColumn` and `addForeign` |
| **`executeSchemaBuilder`** | Extracted the SQLite/MySQL execution branching used in `addColumn` and `dropColumn` | Eliminates ~15 lines of duplicated code |
| **`withSQLiteForeignKeysDisabled`** | Extracted the PRAGMA on/off dance used in `addForeign` and `dropForeign` | Removes ~12 lines of duplication and adds a `finally` guard |
| **`withConstraintErrorHandling`** | Extracted the try/catch pattern shared by `addIndex`, `dropIndex`, `addUnique`, `dropUnique`, `addPrimaryKey` | Removes ~40 lines of duplicated error-handling |
| **`DB_QUERIES` lookup table** | Replaced the if/else chains in `getTables`, `getIndexes`, `getColumns` with a strategy object | Eliminates branching; adding a new DB client is a single object entry |
| **`runColumnMigration`** | Lifted the inner function out of `createColumnMigration` | Reduces nesting and makes the step independently testable |
| **`createTable`** | Used optional chaining (`?.forEach`) | Removes two `if` guards |
| **`nullable` call** | Collapsed the `if/else` into a ternary | Reduces 4 lines to 1 |