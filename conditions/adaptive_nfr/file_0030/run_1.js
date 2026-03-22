# Refactored Database Schema Utilities

## Key Refactoring Decisions

1. **Extract `hasOwnProperty` helper** - Eliminates repetitive `Object.prototype.hasOwnProperty.call()` calls
2. **Extract column type builder** - Separates column creation logic from modifier application
3. **Extract MySQL algorithm modifier** - Removes duplicated SQL manipulation in `addColumn`/`dropColumn`
4. **Extract SQLite foreign key pragma helpers** - Consolidates repeated SQLite pragma patterns
5. **Extract constraint error handler** - Unifies duplicated try/catch patterns in index/unique operations
6. **Extract database query dispatcher** - Removes duplicated client-switching logic in `getTables`/`getIndexes`/`getColumns`

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
 * Concise own-property check.
 * @param {object} obj
 * @param {string} key
 */
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Appends the MySQL algorithm clause to a raw SQL string when appropriate.
 * @param {string} sql
 * @param {object} options
 * @param {'inplace'|'copy'|'auto'} [options.algorithm]
 * @returns {string}
 */
function applyMySQLAlgorithm(sql, options = {}) {
    if (options.algorithm === 'auto') {
        return sql;
    }
    const algorithm = options.algorithm || 'copy';
    return sql.replace(/;\s*$/, '') + `, algorithm=${algorithm}`;
}

/**
 * Executes a schema builder, applying the MySQL algorithm option when needed.
 * Falls back to the default Knex flow for SQLite (toSQL() is unreliable there).
 *
 * @param {import('knex').SchemaBuilder} builder
 * @param {import('knex').Knex} transaction
 * @param {object} [options]
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
 * Wraps a schema operation in a try/catch that silently warns on known
 * "already exists" or "does not exist" error codes.
 *
 * @param {Function} operation - async function to execute
 * @param {string[]} ignoredCodes - DB error codes to treat as warnings
 * @param {string} warningMessage - message to log when an ignored error occurs
 */
async function withConstraintGuard(operation, ignoredCodes, warningMessage) {
    try {
        return await operation();
    } catch (err) {
        if (ignoredCodes.includes(err.code)) {
            logging.warn(warningMessage);
            return;
        }
        throw err;
    }
}

// ─── SQLite Foreign-Key Pragma Helpers ──────────────────────────────────────

/**
 * Reads the current PRAGMA foreign_keys value.
 * @returns {Promise<boolean>}
 */
async function getSQLiteForeignKeysEnabled() {
    const result = await db.knex.raw('PRAGMA foreign_keys;');
    return Boolean(result[0].foreign_keys);
}

/**
 * Temporarily disables SQLite foreign key checks, runs `fn`, then restores
 * the original setting.  Required due to https://github.com/knex/knex/issues/4155
 *
 * @param {Function} fn
 */
async function withSQLiteForeignKeysDisabled(fn) {
    const wasEnabled = await getSQLiteForeignKeysEnabled();
    if (wasEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }
    await fn();
    if (wasEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    }
}

// ─── Column Builder ─────────────────────────────────────────────────────────

/**
 * Creates the base column object on the table builder according to the spec's type.
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').knex.ColumnBuilder}
 */
function buildColumnType(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && has(columnSpec, 'fieldtype')) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }

    if (columnSpec.type === 'string') {
        return tableBuilder.string(columnName, columnSpec.maxlength || 191);
    }

    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies all modifier methods (nullable, primary, unique, …) to a column builder.
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnModifiers(column, columnSpec) {
    if (has(columnSpec, 'nullable') && columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }

    if (has(columnSpec, 'primary') && columnSpec.primary)       column.primary();
    if (has(columnSpec, 'unique')  && columnSpec.unique)        column.unique();
    if (has(columnSpec, 'unsigned') && columnSpec.unsigned)     column.unsigned();
    if (has(columnSpec, 'references'))                          column.references(columnSpec.references);
    if (has(columnSpec, 'constraintName'))                      column.withKeyName(columnSpec.constraintName);
    if (has(columnSpec, 'defaultTo'))                           column.defaultTo(columnSpec.defaultTo);
    if (has(columnSpec, 'index') && columnSpec.index)           column.index();

    if (has(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (has(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
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
    const column = buildColumnType(tableBuilder, columnName, columnSpec);
    applyColumnModifiers(column, columnSpec);
}

// ─── Nullable ───────────────────────────────────────────────────────────────

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

// ─── Column Operations ──────────────────────────────────────────────────────

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} [columnSpec]
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

    const builder = transaction.schema.table(tableName, table => table.dropColumn(column));
    await executeSchemaBuilder(builder, transaction, options);
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
        // Knex helper is slow on bigger MySQL clusters; use raw instead
        return transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return transaction.schema.table(tableName, table => table.renameColumn(from, to));
}

// ─── Index / Unique Constraint Operations ───────────────────────────────────

/**
 * Adds a non-unique index to a table over the given columns.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    logging.info(`Adding index for '${columns}' in table '${tableName}'`);

    return withConstraintGuard(
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

    return withConstraintGuard(
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

    return withConstraintGuard(
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

    return withConstraintGuard(
        () => transaction.schema.table(tableName, table => table.dropUnique(columns)),
        ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        `Constraint for '${columns}' does not exist for table '${tableName}'`
    );
}

// ─── Foreign Key Operations ─────────────────────────────────────────────────

/**
 * Checks if a foreign key exists in a table (SQLite only).
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
 * Builds the foreign key builder with the correct delete behaviour.
 * @param {import('knex').knex.TableBuilder} table
 * @param {string} fromColumn
 * @param {string} toTable
 * @param {string} toColumn
 * @param {boolean} cascadeDelete
 * @param {boolean} setNullDelete
 * @param {string} [constraintName]
 */
function buildForeignKey(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete, constraintName) {
    let fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);

    if (cascadeDelete)   fkBuilder = fkBuilder.onDelete('CASCADE');
    else if (setNullDelete) fkBuilder = fkBuilder.onDelete('SET NULL');

    if (constraintName) fkBuilder.withKeyName(constraintName);
}

/**
 * Adds a foreign key to a table.
 * @param {Object} cfg
 * @param {string} cfg.fromTable
 * @param {string} cfg.fromColumn
 * @param {string} cfg.toTable
 * @param {string} cfg.toColumn
 * @param {string} [cfg.constraintName]
 * @param {boolean} [cfg.cascadeDelete]
 * @param {boolean} [cfg.setNullDelete]
 * @param {import('knex').Knex} [cfg.transaction]
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

        const addFK = () => transaction.schema.table(fromTable, table =>
            buildForeignKey(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete, constraintName)
        );

        if (DatabaseInfo.isSQLite(transaction)) {
            await withSQLiteForeignKeysDisabled(addFK);
        } else {
            await addFK();
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

        const dropFK = () => transaction.schema.table(fromTable, table =>
            table.dropForeign(fromColumn, constraintName)
        );

        if (DatabaseInfo.isSQLite(transaction)) {
            await withSQLiteForeignKeysDisabled(dropFK);
        } else {
            await dropFK();
        }
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

// ─── Primary Key ────────────────────────────────────────────────────────────

/**
 * Checks if a primary key index exists on a table (SQLite only).
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

    return withConstraintGuard(
        () => transaction.schema.table(tableName, table => table.primary(columns)),
        ['ER_MULTIPLE_PRI_KEY'],
        `Primary key constraint for '${columns}' already exists for table '${tableName}'`
    );
}

// ─── Table Operations ───────────────────────────────────────────────────────

/**
 * Creates a table according to the provided spec (or the current schema).
 * Does NOT check if the table already exists.
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

// ─── Introspection ──────────────────────────────────────────────────────────

/**
 * Dispatches a raw query based on the DB client, or rejects for unsupported clients.
 * @param {import('knex').Knex} transaction
 * @param {string} sqliteQuery
 * @param {string} mysqlQuery
 * @param {Function} extractSQLite  - maps the SQLite response to the desired value
 * @param {Function} extractMySQL   - maps the MySQL response to the desired value
 */
async function dispatchByClient(transaction, sqliteQuery, mysqlQuery, extractSQLite, extractMySQL) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const response = await transaction.raw(sqliteQuery);
        return extractSQLite(response);
    }

    if (client === 'mysql2') {
        const response = await transaction.raw(mysqlQuery);
        return extractMySQL(response);
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * @param {import('knex').Knex} [transaction]
 */
function getTables(transaction = db.knex) {
    return dispatchByClient(
        transaction,
        'select * from sqlite_master where type = "table"',
        'show tables',
        response => _.reject(_.map(response, 'tbl_name'), name => name === 'sqlite_sequence'),
        response => _.flatten(_.map(response[0], entry => _.values(entry)))
    );
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function getIndexes(table, transaction = db.knex) {
    return dispatchByClient(
        transaction,
        `pragma index_list("${table}")`,
        `SHOW INDEXES from ${table}`,
        response => _.flatten(_.map(response, 'name')),
        response => _.flatten(_.map(response[0], 'Key_name'))
    );
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function getColumns(table, transaction = db.knex) {
    return dispatchByClient(
        transaction,
        `pragma table_info("${table}")`,
        `SHOW COLUMNS from ${table}`,
        response => _.flatten(_.map(response, 'name')),
        response => _.flatten(_.map(response[0], 'Field'))
    );
}

// ─── Migration Helper ───────────────────────────────────────────────────────

/**
 * @param {...object} migrations
 */
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

// ─── Exports ────────────────────────────────────────────────────────────────

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
    // Exposed for testing purposes only
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};
```

## Summary of Changes

| Problem | Solution |
|---|---|
| `Object.prototype.hasOwnProperty.call()` repeated ~15× | `has()` one-liner helper |
| Identical MySQL algorithm SQL manipulation in `addColumn` & `dropColumn` | `applyMySQLAlgorithm()` + `executeSchemaBuilder()` |
| Identical SQLite pragma on/off blocks in `addForeign` & `dropForeign` | `withSQLiteForeignKeysDisabled()` |
| Identical try/catch with ignored error codes in 4 functions | `withConstraintGuard()` |
| Identical client-switch pattern in `getTables`, `getIndexes`, `getColumns` | `dispatchByClient()` |
| `addTableColumn` mixing type creation with modifier application | Split into `buildColumnType()` + `applyColumnModifiers()` |
| `addForeign` mixing FK builder logic with orchestration | `buildForeignKey()` extracted |