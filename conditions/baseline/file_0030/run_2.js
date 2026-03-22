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

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true if the spec object has the given property.
 * @param {object} spec
 * @param {string} prop
 */
const hasProp = (spec, prop) => Object.prototype.hasOwnProperty.call(spec, prop);

/**
 * Builds the base column definition on the table builder.
 */
function buildBaseColumn(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasProp(columnSpec, 'fieldtype')) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }

    if (columnSpec.type === 'string') {
        return tableBuilder.string(columnName, columnSpec.maxlength ?? 191);
    }

    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies delete behaviour (CASCADE or SET NULL) to a column builder.
 */
function applyDeleteBehaviour(column, columnSpec) {
    if (hasProp(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (hasProp(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies a MySQL-compatible algorithm suffix to a raw SQL string.
 * @param {string} sql
 * @param {object} options
 * @returns {string}
 */
function applyMySQLAlgorithm(sql, options = {}) {
    sql = sql.replace(/;\s*$/, '');
    if (options.algorithm !== 'auto') {
        sql += `, algorithm=${options.algorithm || 'copy'}`;
    }
    return sql;
}

/**
 * Executes a schema builder, applying MySQL algorithm options where needed.
 * @param {import('knex').SchemaBuilder} builder
 * @param {import('knex').Knex} transaction
 * @param {object} options
 */
async function executeSchemaBuilder(builder, transaction, options = {}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    for (const sqlQuery of builder.toSQL()) {
        let sql = sqlQuery.sql;
        if (DatabaseInfo.isMySQL(transaction)) {
            sql = applyMySQLAlgorithm(sql, options);
        }
        await transaction.raw(sql);
    }
}

/**
 * Temporarily disables SQLite foreign keys, runs an action, then restores them.
 * @param {import('knex').Knex} transaction
 * @param {Function} action
 */
async function withSQLiteForeignKeysDisabled(transaction, action) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return action();
    }

    const [{ foreign_keys }] = await db.knex.raw('PRAGMA foreign_keys;');

    if (foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    await action();

    if (foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    }
}

/**
 * Wraps a schema operation with duplicate-key error handling.
 * @param {Function} operation
 * @param {string[]} skipCodes - error codes to treat as warnings
 * @param {string} warnMessage
 */
async function withDuplicateKeyHandling(operation, skipCodes, warnMessage) {
    try {
        return await operation();
    } catch (err) {
        if (skipCodes.includes(err.code)) {
            logging.warn(warnMessage);
            return;
        }
        throw err;
    }
}

// ─── Column Definition ───────────────────────────────────────────────────────

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = buildBaseColumn(tableBuilder, columnName, columnSpec);

    const isNullable = hasProp(columnSpec, 'nullable') && columnSpec.nullable === true;
    column.nullable(isNullable ? undefined : false);

    if (hasProp(columnSpec, 'primary') && columnSpec.primary)       column.primary();
    if (hasProp(columnSpec, 'unique') && columnSpec.unique)          column.unique();
    if (hasProp(columnSpec, 'unsigned') && columnSpec.unsigned)      column.unsigned();
    if (hasProp(columnSpec, 'references'))                           column.references(columnSpec.references);
    if (hasProp(columnSpec, 'constraintName'))                       column.withKeyName(columnSpec.constraintName);
    if (hasProp(columnSpec, 'defaultTo'))                            column.defaultTo(columnSpec.defaultTo);
    if (hasProp(columnSpec, 'index') && columnSpec.index)            column.index();

    applyDeleteBehaviour(column, columnSpec);
}

// ─── Nullable ────────────────────────────────────────────────────────────────

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

// ─── Column Operations ───────────────────────────────────────────────────────

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
    if (hasProp(columnSpec, 'references')) {
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

// ─── Index Operations ────────────────────────────────────────────────────────

/**
 * Adds a non-unique index to a table over the given columns.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    logging.info(`Adding index for '${columns}' in table '${tableName}'`);
    await withDuplicateKeyHandling(
        () => transaction.schema.table(tableName, table => table.index(columns)),
        ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
        `Index for '${columns}' already exists for table '${tableName}'`
    );
}

/**
 * Drops a non-unique index from a table over the given columns.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    logging.info(`Dropping index for '${columns}' in table '${tableName}'`);
    await withDuplicateKeyHandling(
        () => transaction.schema.table(tableName, table => table.dropIndex(columns)),
        ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        `Constraint for '${columns}' does not exist for table '${tableName}'`
    );
}

/**
 * Adds a unique constraint to a table over the given columns.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
    await withDuplicateKeyHandling(
        () => transaction.schema.table(tableName, table => table.unique(columns)),
        ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
        `Constraint for '${columns}' already exists for table '${tableName}'`
    );
}

/**
 * Drops a unique constraint from a table.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);
    await withDuplicateKeyHandling(
        () => transaction.schema.table(tableName, table => table.dropUnique(columns)),
        ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        `Constraint for '${columns}' does not exist for table '${tableName}'`
    );
}

// ─── Foreign Key Operations ──────────────────────────────────────────────────

/**
 * Checks if a foreign key exists in a table (SQLite only).
 * @param {Object} config
 * @param {string} config.fromTable
 * @param {string} config.fromColumn
 * @param {string} config.toTable
 * @param {string} config.toColumn
 * @param {import('knex').Knex} [config.transaction]
 */
async function hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction = db.knex}) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({ message: tpl(messages.hasForeignSQLite3) });
    }

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return foreignKeys.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

/**
 * Adds a foreign key to a table.
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

    await withDuplicateKeyHandling(
        () => withSQLiteForeignKeysDisabled(transaction, () =>
            transaction.schema.table(fromTable, (table) => {
                const ref = `${toTable}.${toColumn}`;
                let fkBuilder = table.foreign(fromColumn).references(ref);

                if (cascadeDelete)   fkBuilder = fkBuilder.onDelete('CASCADE');
                else if (setNullDelete) fkBuilder = fkBuilder.onDelete('SET NULL');
                if (constraintName)  fkBuilder.withKeyName(constraintName);
            })
        ),
        ['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'],
        `Skipped adding foreign key from ${fkDescription} - already exists`
    );

    logging.info(`Adding foreign key from ${fkDescription}`);
}

/**
 * Drops a foreign key from a table.
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

    logging.info(`Dropping foreign key from ${fkDescription}`);

    await withDuplicateKeyHandling(
        () => withSQLiteForeignKeysDisabled(transaction, () =>
            transaction.schema.table(fromTable, table => table.dropForeign(fromColumn, constraintName))
        ),
        ['ER_CANT_DROP_FIELD_OR_KEY'],
        `Skipped dropping foreign key from ${fkDescription} - does not exist`
    );
}

// ─── Primary Key Operations ──────────────────────────────────────────────────

/**
 * Checks if a primary key index exists in a table (SQLite only).
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({ message: tpl(messages.hasPrimaryKeySQLiteError) });
    }

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.find(c => c.origin === 'pk');
}

/**
 * Adds a primary key index to a table over the given columns.
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

    logging.info(`Adding primary key constraint for '${columns}' in table '${tableName}'`);
    await withDuplicateKeyHandling(
        () => transaction.schema.table(tableName, table => table.primary(columns)),
        ['ER_MULTIPLE_PRI_KEY'],
        `Primary key constraint for '${columns}' already exists for table '${tableName}'`
    );
}

// ─── Table Operations ────────────────────────────────────────────────────────

/**
 * Creates a table according to the provided spec, or falls back to the current schema.
 * NOTE: does NOT check if the table already exists.
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

// ─── Introspection ───────────────────────────────────────────────────────────

/**
 * Returns the DB client name from a transaction/knex instance.
 * @param {import('knex').Knex} transaction
 */
function getClientName(transaction) {
    return transaction.client.config.client;
}

/**
 * @param {import('knex').Knex} [transaction]
 */
async function getTables(transaction = db.knex) {
    const client = getClientName(transaction);

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
    const client = getClientName(transaction);

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
    const client = getClientName(transaction);

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

// ─── Migration Helpers ───────────────────────────────────────────────────────

/**
 * Runs a single column migration step.
 * @param {import('knex').Knex} conn
 * @param {object} migration
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
 * @param {...object} migrations
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

Key refactoring improvements:

1. **`hasProp` helper** — Replaces the verbose `Object.prototype.hasOwnProperty.call(...)` pattern used 20+ times.

2. **`buildBaseColumn`** — Extracts the column-type branching logic from `addTableColumn`, reducing its cyclomatic complexity.

3. **`applyDeleteBehaviour`** — Isolates the cascade/set-null logic into a single reusable function.

4. **`executeSchemaBuilder`** — Consolidates the duplicated SQLite/MySQL schema execution pattern shared by `addColumn` and `dropColumn`.

5. **`withSQLiteForeignKeysDisabled`** — Extracts the repeated SQLite foreign-key toggle pattern from `addForeign` and `dropForeign`.

6. **`withDuplicateKeyHandling`** — Replaces the repeated try/catch blocks in `addIndex`, `dropIndex`, `addUnique`, `dropUnique`, `addForeign`, `dropForeign`, and `addPrimaryKey`.

7. **`getClientName`** — Removes the repeated `transaction.client.config.client` access in `getTables`, `getIndexes`, and `getColumns`.

8. **`runColumnMigration`** — Extracted from the closure inside `createColumnMigration` for clarity and testability.

9. **Optional chaining** — `tableSpec['@@INDEXES@@']?.forEach(...)` replaces the `if` guards in `createTable`.

10. **Consistent `if` chains** — Replaced `else if` chains with early-return `if` blocks in `getTables`, `getIndexes`, and `getColumns`.