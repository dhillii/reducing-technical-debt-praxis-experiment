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

/**
 * Returns true if the spec object has the given property.
 * Replaces verbose Object.prototype.hasOwnProperty.call() calls.
 */
const has = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

/**
 * Builds the base column definition based on type and related options.
 */
function buildBaseColumn(tableBuilder, columnName, columnSpec) {
    const {type, fieldtype, maxlength = 191} = columnSpec;

    if (type === 'text' && has(columnSpec, 'fieldtype')) {
        return tableBuilder[type](columnName, fieldtype);
    }

    if (type === 'string') {
        return tableBuilder[type](columnName, has(columnSpec, 'maxlength') ? maxlength : 191);
    }

    return tableBuilder[type](columnName);
}

/**
 * Applies all modifiers (nullable, primary, unique, etc.) to a column builder.
 */
function applyColumnModifiers(column, columnSpec) {
    if (has(columnSpec, 'nullable') && columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }

    if (has(columnSpec, 'primary') && columnSpec.primary) {
        column.primary();
    }

    if (has(columnSpec, 'unique') && columnSpec.unique) {
        column.unique();
    }

    if (has(columnSpec, 'unsigned') && columnSpec.unsigned) {
        column.unsigned();
    }

    if (has(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }

    if (has(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }

    if (has(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (has(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }

    if (has(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }

    if (has(columnSpec, 'index') && columnSpec.index) {
        column.index();
    }
}

// ─── SQLite Foreign Key Pragma Helpers ───────────────────────────────────────

/**
 * Disables SQLite foreign key checks and returns whether they were enabled.
 */
async function disableSQLiteForeignKeys() {
    const result = await db.knex.raw('PRAGMA foreign_keys;');
    const wasEnabled = result[0].foreign_keys;

    if (wasEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    return wasEnabled;
}

/**
 * Re-enables SQLite foreign key checks if they were previously enabled.
 */
async function restoreSQLiteForeignKeys(wasEnabled) {
    if (wasEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    }
}

/**
 * Wraps an async operation with SQLite foreign key disabling/restoring.
 * See: https://github.com/knex/knex/issues/4155
 */
async function withSQLiteForeignKeysDisabled(operation) {
    const wasEnabled = await disableSQLiteForeignKeys();

    try {
        await operation();
    } finally {
        await restoreSQLiteForeignKeys(wasEnabled);
    }
}

// ─── Algorithm Helper ────────────────────────────────────────────────────────

/**
 * Appends a MySQL algorithm clause to a SQL string if applicable.
 */
function appendMySQLAlgorithm(sql, options = {}) {
    if (options.algorithm === 'auto') {
        return sql;
    }

    const algorithm = options.algorithm || 'copy';
    return `${sql.replace(/;\s*$/, '')}, algorithm=${algorithm}`;
}

/**
 * Executes schema builder SQL queries with optional MySQL algorithm support.
 */
async function executeSchemaBuilder(schemaBuilder, transaction, options = {}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        await schemaBuilder;
        return;
    }

    for (const sqlQuery of schemaBuilder.toSQL()) {
        const sql = DatabaseInfo.isMySQL(transaction)
            ? appendMySQLAlgorithm(sqlQuery.sql, options)
            : sqlQuery.sql;

        await transaction.raw(sql);
    }
}

// ─── Duplicate Error Handling ─────────────────────────────────────────────────

const DUPLICATE_CODES = new Set(['SQLITE_ERROR', 'ER_DUP_KEYNAME']);
const MISSING_CODES = new Set(['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']);

function handleConstraintError(err, action, subject, tableName, allowedCodes) {
    if (allowedCodes.has(err.code)) {
        logging.warn(`Constraint for '${subject}' ${action} for table '${tableName}'`);
        return;
    }
    throw err;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = buildBaseColumn(tableBuilder, columnName, columnSpec);
    applyColumnModifiers(column, columnSpec);
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
    const schemaBuilder = transaction.schema.table(tableName, table => {
        addTableColumn(tableName, table, column, columnSpec);
    });

    await executeSchemaBuilder(schemaBuilder, transaction, options);
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
    if (has(columnSpec, 'references')) {
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

    const schemaBuilder = transaction.schema.table(tableName, table => table.dropColumn(column));
    await executeSchemaBuilder(schemaBuilder, transaction, options);
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
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => table.index(columns));
    } catch (err) {
        handleConstraintError(err, 'already exists', columns, tableName, DUPLICATE_CODES);
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
        return await transaction.schema.table(tableName, table => table.dropIndex(columns));
    } catch (err) {
        handleConstraintError(err, 'does not exist', columns, tableName, MISSING_CODES);
    }
}

/**
 * Adds a unique constraint to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => table.unique(columns));
    } catch (err) {
        handleConstraintError(err, 'already exists', columns, tableName, DUPLICATE_CODES);
    }
}

/**
 * Drops a unique constraint from a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => table.dropUnique(columns));
    } catch (err) {
        handleConstraintError(err, 'does not exist', columns, tableName, MISSING_CODES);
    }
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

    return foreignKeys.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

/**
 * Builds a foreign key builder with optional delete behavior.
 */
function buildForeignKey(table, fromColumn, toTable, toColumn, {cascadeDelete, setNullDelete, constraintName}) {
    let fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);

    if (cascadeDelete) {
        fkBuilder = fkBuilder.onDelete('CASCADE');
    } else if (setNullDelete) {
        fkBuilder = fkBuilder.onDelete('SET NULL');
    }

    if (constraintName) {
        fkBuilder.withKeyName(constraintName);
    }
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

        const operation = () => transaction.schema.table(fromTable, table => {
            buildForeignKey(table, fromColumn, toTable, toColumn, {cascadeDelete, setNullDelete, constraintName});
        });

        if (DatabaseInfo.isSQLite(transaction)) {
            await withSQLiteForeignKeysDisabled(operation);
        } else {
            await operation();
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

        const operation = () => transaction.schema.table(fromTable, table => {
            table.dropForeign(fromColumn, constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction)) {
            await withSQLiteForeignKeysDisabled(operation);
        } else {
            await operation();
        }
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fkDescription} - does not exist`);
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

    try {
        logging.info(`Adding primary key constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => table.primary(columns));
    } catch (err) {
        if (err.code === 'ER_MULTIPLE_PRI_KEY') {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
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

// ─── DB Introspection ────────────────────────────────────────────────────────

/**
 * Returns a query result mapped to a flat array using the given key.
 */
function flatMapKey(response, key) {
    return _.flatten(_.map(response, key));
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
        return flatMapKey(response, 'name');
    }

    if (client === 'mysql2') {
        const response = await transaction.raw(`SHOW INDEXES from ${table}`);
        return flatMapKey(response[0], 'Key_name');
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
        return flatMapKey(response, 'name');
    }

    if (client === 'mysql2') {
        const response = await transaction.raw(`SHOW COLUMNS from ${table}`);
        return flatMapKey(response[0], 'Field');
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

// ─── Column Migration Factory ─────────────────────────────────────────────────

/**
 * Runs a single column migration step.
 */
async function runColumnMigration(conn, migration) {
    const {table, column, dbIsInCorrectState, operation, operationVerb, columnDefinition, options} = migration;

    const hasColumn = await conn.schema.hasColumn(table, column);
    const isInCorrectState = dbIsInCorrectState(hasColumn);

    if (isInCorrectState) {
        logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
    } else {
        logging.info(`${operationVerb} ${table}.${column} column`);
        await operation(table, column, conn, columnDefinition, options);
    }
}

/**
 * Creates a migration function that runs multiple column migrations in sequence.
 */
function createColumnMigration(...migrations) {
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
    // NOTE: exposed for testing purposes only
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};
```

Key refactoring changes made:

1. **Extracted `has()` helper** — replaces all verbose `Object.prototype.hasOwnProperty.call()` calls throughout the file.

2. **Split `addTableColumn`** into `buildBaseColumn` and `applyColumnModifiers` — separates column type construction from modifier application, reducing function length and nesting.

3. **Extracted SQLite foreign key helpers** — `disableSQLiteForeignKeys`, `restoreSQLiteForeignKeys`, and `withSQLiteForeignKeysDisabled` eliminate the duplicated pragma logic shared between `addForeign` and `dropForeign`.

4. **Extracted `executeSchemaBuilder`** — consolidates the duplicated SQLite/MySQL schema execution pattern used in both `addColumn` and `dropColumn`.

5. **Extracted `appendMySQLAlgorithm`** — isolates the algorithm-appending logic from the execution loop.

6. **Extracted `handleConstraintError`** — unifies the duplicated error-handling pattern across `addIndex`, `dropIndex`, `addUnique`, and `dropUnique`, using `Set` for O(1) code lookups.

7. **Extracted `buildForeignKey`** — isolates the FK builder logic from `addForeign`.

8. **Extracted `flatMapKey`** — removes repeated `_.flatten(_.map(...))` patterns in `getIndexes` and `getColumns`.

9. **Extracted `runColumnMigration`** — pulls the inner function out of `createColumnMigration` to a named top-level function.

10. **Used optional chaining** (`?.forEach`) in `createTable` to replace explicit `if` guards.

11. **Introduced `fkDescription`** string variable in `addForeign`/`dropForeign` to avoid repeated string interpolation.