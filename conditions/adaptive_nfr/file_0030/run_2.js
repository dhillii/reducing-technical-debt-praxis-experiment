# Refactored Database Schema Utilities

## Key Refactoring Decisions

1. **Extract `hasOwnProperty` helper** - Eliminates repetitive `Object.prototype.hasOwnProperty.call()` calls
2. **Extract column type builder** - Separates column creation logic from modifier application
3. **Extract column modifiers** - Converts repetitive modifier blocks into a declarative map
4. **Extract `executeWithAlgorithm`** - Deduplicates identical SQL execution logic in `addColumn`/`dropColumn`
5. **Extract `withSQLiteForeignKeys`** - Deduplicates SQLite foreign key pragma toggle logic
6. **Extract `handleConstraintError`** - Deduplicates duplicate-key/missing-key error handling
7. **Extract `queryByClient`** - Deduplicates client-switching logic in `getTables`/`getIndexes`/`getColumns`

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
 * Builds the base column (type + length) without any modifiers.
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 */
function buildColumnType(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && has(columnSpec, 'fieldtype')) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }

    if (columnSpec.type === 'string') {
        return tableBuilder.string(columnName, columnSpec.maxlength ?? 191);
    }

    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies all optional modifiers to an already-created column builder.
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnModifiers(column, columnSpec) {
    const isNullable = has(columnSpec, 'nullable') && columnSpec.nullable === true;
    column.nullable(isNullable);

    if (has(columnSpec, 'primary') && columnSpec.primary)       column.primary();
    if (has(columnSpec, 'unique') && columnSpec.unique)         column.unique();
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
 * Executes a schema-builder query, appending an algorithm hint for MySQL when
 * needed. SQLite uses the default flow because `.toSQL()` is unreliable there.
 *
 * @param {import('knex').SchemaBuilder} schemaBuilder
 * @param {import('knex').Knex} transaction
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm]
 */
async function executeWithAlgorithm(schemaBuilder, transaction, options = {}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        await schemaBuilder;
        return;
    }

    for (const sqlQuery of schemaBuilder.toSQL()) {
        let sql = sqlQuery.sql;

        if (DatabaseInfo.isMySQL(transaction) && options.algorithm !== 'auto') {
            sql = sql.replace(/;\s*$/, '');
            sql += `, algorithm=${options.algorithm ?? 'copy'}`;
        }

        await transaction.raw(sql);
    }
}

/**
 * Temporarily disables SQLite foreign-key checks while `fn` runs, then
 * restores the previous state. No-op on non-SQLite connections.
 *
 * @param {import('knex').Knex} transaction
 * @param {Function} fn
 */
async function withSQLiteForeignKeysDisabled(transaction, fn) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return fn();
    }

    const [{ foreign_keys }] = await db.knex.raw('PRAGMA foreign_keys;');

    if (foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    try {
        await fn();
    } finally {
        if (foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
    }
}

/**
 * Swallows known "already exists" / "does not exist" error codes and logs a
 * warning instead; re-throws everything else.
 *
 * @param {Error & {code?: string}} err
 * @param {string[]} ignoredCodes - error codes to treat as warnings
 * @param {string} warningMessage
 */
function handleConstraintError(err, ignoredCodes, warningMessage) {
    if (ignoredCodes.includes(err.code)) {
        logging.warn(warningMessage);
        return;
    }
    throw err;
}

/**
 * Dispatches a raw query based on the DB client and extracts a flat list from
 * the result using the provided field name.
 *
 * @param {import('knex').Knex} transaction
 * @param {{ sqlite: string, mysql: string }} queries
 * @param {{ sqlite: string, mysql: string }} fields - result field to pluck
 */
async function queryByClient(transaction, queries, fields) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const response = await transaction.raw(queries.sqlite);
        return _.flatten(_.map(response, fields.sqlite));
    }

    if (client === 'mysql2') {
        const response = await transaction.raw(queries.mysql);
        return _.flatten(_.map(response[0], fields.mysql));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

// ─── Public API ─────────────────────────────────────────────────────────────

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
 * @param {import('knex').Knex} [transaction]
 * @param {object} [columnSpec]
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
    await executeWithAlgorithm(builder, transaction, options);
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
        // Knex helper does slow FK work on bigger MySQL clusters; use raw instead
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
        handleConstraintError(
            err,
            ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
            `Index for '${columns}' already exists for table '${tableName}'`
        );
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
        handleConstraintError(
            err,
            ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
            `Constraint for '${columns}' does not exist for table '${tableName}'`
        );
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
        handleConstraintError(
            err,
            ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
            `Constraint for '${columns}' already exists for table '${tableName}'`
        );
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
        handleConstraintError(
            err,
            ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
            `Constraint for '${columns}' does not exist for table '${tableName}'`
        );
    }
}

/**
 * Checks if a foreign key exists in a table (SQLite only).
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

        await withSQLiteForeignKeysDisabled(transaction, async () => {
            await transaction.schema.table(fromTable, (table) => {
                const ref = `${toTable}.${toColumn}`;
                let fkBuilder = table.foreign(fromColumn).references(ref);

                if (cascadeDelete)      fkBuilder = fkBuilder.onDelete('CASCADE');
                else if (setNullDelete) fkBuilder = fkBuilder.onDelete('SET NULL');

                if (constraintName) fkBuilder.withKeyName(constraintName);
            });
        });
    } catch (err) {
        handleConstraintError(
            err,
            ['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'],
            `Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`
        );
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

        await withSQLiteForeignKeysDisabled(transaction, async () => {
            await transaction.schema.table(fromTable, table => table.dropForeign(fromColumn, constraintName));
        });
    } catch (err) {
        handleConstraintError(
            err,
            ['ER_CANT_DROP_FIELD_OR_KEY'],
            `Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`
        );
    }
}

/**
 * Checks if a primary key index exists on a table (SQLite only).
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
        handleConstraintError(
            err,
            ['ER_MULTIPLE_PRI_KEY'],
            `Primary key constraint for '${columns}' already exists for table '${tableName}'`
        );
    }
}

/**
 * Creates a table according to the provided spec (or the current schema).
 * Does NOT check for prior existence — use migration utils for that.
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

/**
 * @param {import('knex').Knex} [transaction]
 */
function getTables(transaction = db.knex) {
    return queryByClient(
        transaction,
        {
            sqlite: 'select * from sqlite_master where type = "table"',
            mysql: 'show tables'
        },
        {sqlite: 'tbl_name', mysql: null}
    ).then(names =>
        transaction.client.config.client === 'sqlite3'
            ? names.filter(name => name !== 'sqlite_sequence')
            : names
    );
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function getIndexes(table, transaction = db.knex) {
    return queryByClient(
        transaction,
        {
            sqlite: `pragma index_list("${table}")`,
            mysql: `SHOW INDEXES from ${table}`
        },
        {sqlite: 'name', mysql: 'Key_name'}
    );
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function getColumns(table, transaction = db.knex) {
    return queryByClient(
        transaction,
        {
            sqlite: `pragma table_info("${table}")`,
            mysql: `SHOW COLUMNS from ${table}`
        },
        {sqlite: 'name', mysql: 'Field'}
    );
}

/**
 * Composes multiple column migration descriptors into a single migration function.
 *
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
| 15× `Object.prototype.hasOwnProperty.call()` | `has()` one-liner helper |
| `addTableColumn` mixed type-building with modifier application | Split into `buildColumnType` + `applyColumnModifiers` |
| Identical SQL-execution loop in `addColumn` / `dropColumn` | `executeWithAlgorithm()` shared helper |
| Identical SQLite FK pragma toggle in `addForeign` / `dropForeign` | `withSQLiteForeignKeysDisabled()` wrapper |
| Identical error-code catch blocks across 6 functions | `handleConstraintError()` helper |
| Identical client-switch pattern in `getTables` / `getIndexes` / `getColumns` | `queryByClient()` helper |
| `tableSpec['@@INDEXES@@']` guarded with `if` | Optional chaining `?.forEach` |
| `options?.algorithm` double optional-chain | Single `options.algorithm` (param always defined) |