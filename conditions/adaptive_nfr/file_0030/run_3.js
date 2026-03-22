# Refactored Database Schema Utilities

## Key Refactoring Decisions

1. **Extract `hasOwnProperty` helper** - eliminates repetitive `Object.prototype.hasOwnProperty.call()` pattern
2. **Extract column type builder** - separates column creation from column configuration
3. **Extract MySQL algorithm logic** - deduplicates identical code in `addColumn`/`dropColumn`
4. **Extract SQLite foreign key pragma helpers** - reduces duplication in `addForeign`/`dropForeign`
5. **Extract constraint operation wrapper** - unifies `addIndex`/`dropIndex`/`addUnique`/`dropUnique` patterns
6. **Extract database query dispatcher** - unifies `getTables`/`getIndexes`/`getColumns` patterns

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
 * Builds the base knex column object according to the column type spec.
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 */
function buildColumnType(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && has(columnSpec, 'fieldtype')) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }

    if (columnSpec.type === 'string') {
        return tableBuilder.string(columnName, has(columnSpec, 'maxlength') ? columnSpec.maxlength : 191);
    }

    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies all modifiers (nullable, primary, unique, …) to a knex column builder.
 * @param {object} column - knex column builder
 * @param {object} columnSpec
 */
function applyColumnModifiers(column, columnSpec) {
    column[has(columnSpec, 'nullable') && columnSpec.nullable === true ? 'nullable' : 'notNullable']();

    if (has(columnSpec, 'primary') && columnSpec.primary)         column.primary();
    if (has(columnSpec, 'unique')  && columnSpec.unique)          column.unique();
    if (has(columnSpec, 'unsigned') && columnSpec.unsigned)       column.unsigned();
    if (has(columnSpec, 'references'))                            column.references(columnSpec.references);
    if (has(columnSpec, 'constraintName'))                        column.withKeyName(columnSpec.constraintName);
    if (has(columnSpec, 'defaultTo'))                             column.defaultTo(columnSpec.defaultTo);
    if (has(columnSpec, 'index') && columnSpec.index)             column.index();

    if (has(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (has(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
}

/**
 * Appends the MySQL algorithm clause to a raw SQL string when required.
 * @param {string} sql
 * @param {object} options
 * @param {'inplace'|'copy'|'auto'} [options.algorithm]
 */
function appendMySQLAlgorithm(sql, options = {}) {
    if (options.algorithm === 'auto') {
        return sql;
    }
    const algorithm = options.algorithm || 'copy';
    return sql.replace(/;\s*$/, '') + `, algorithm=${algorithm}`;
}

/**
 * Executes a schema builder, applying MySQL algorithm hints when needed.
 * Falls back to the default Knex flow for SQLite (toSQL() is unreliable there).
 *
 * @param {import('knex').SchemaBuilder} schemaBuilder
 * @param {import('knex').Knex} transaction
 * @param {object} [options]
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

/**
 * Wraps a schema-altering operation so that known "already exists / does not
 * exist" error codes are turned into warnings instead of thrown errors.
 *
 * @param {Function} operation - async () => void
 * @param {{ alreadyExistsCode: string[], doesNotExistCode: string[] }} errorCodes
 * @param {string} warningMessage
 */
async function withConstraintErrorHandling(operation, errorCodes, warningMessage) {
    try {
        return await operation();
    } catch (err) {
        const knownCodes = [...(errorCodes.alreadyExistsCode || []), ...(errorCodes.doesNotExistCode || [])];
        if (knownCodes.includes(err.code)) {
            logging.warn(warningMessage);
            return;
        }
        throw err;
    }
}

/**
 * Dispatches a raw query to the correct SQL dialect and maps the response.
 *
 * @param {import('knex').Knex} transaction
 * @param {{ sqlite: Function, mysql: Function }} handlers - each returns a Promise<string[]>
 */
async function dispatchByClient(transaction, handlers) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3')  return handlers.sqlite();
    if (client === 'mysql2')   return handlers.mysql();

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

// ─── SQLite foreign-key pragma helpers ──────────────────────────────────────

async function getSQLiteForeignKeysPragma(transaction) {
    return db.knex.raw('PRAGMA foreign_keys;');
}

async function withSQLiteForeignKeysDisabled(transaction, fn) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return fn();
    }

    const foreignKeysEnabled = await getSQLiteForeignKeysPragma(transaction);
    const wasEnabled = foreignKeysEnabled[0].foreign_keys;

    if (wasEnabled) await db.knex.raw('PRAGMA foreign_keys = OFF;');
    try {
        return await fn();
    } finally {
        if (wasEnabled) await db.knex.raw('PRAGMA foreign_keys = ON;');
    }
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
    logging.info(`Adding index for '${columns}' in table '${tableName}'`);

    return withConstraintErrorHandling(
        () => transaction.schema.table(tableName, table => table.index(columns)),
        {alreadyExistsCode: ['SQLITE_ERROR', 'ER_DUP_KEYNAME']},
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
        {doesNotExistCode: ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']},
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
        {alreadyExistsCode: ['SQLITE_ERROR', 'ER_DUP_KEYNAME']},
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
        {doesNotExistCode: ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']},
        `Constraint for '${columns}' does not exist for table '${tableName}'`
    );
}

/**
 * Checks if a foreign key exists (SQLite only).
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

        await withSQLiteForeignKeysDisabled(transaction, () =>
            transaction.schema.table(fromTable, (table) => {
                const ref = `${toTable}.${toColumn}`;
                let fkBuilder = table.foreign(fromColumn).references(ref);

                if (cascadeDelete)   fkBuilder = fkBuilder.onDelete('CASCADE');
                else if (setNullDelete) fkBuilder = fkBuilder.onDelete('SET NULL');

                if (constraintName) fkBuilder.withKeyName(constraintName);
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
 * Checks if a primary key index exists (SQLite only).
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
        {alreadyExistsCode: ['ER_MULTIPLE_PRI_KEY']},
        `Primary key constraint for '${columns}' already exists for table '${tableName}'`
    );
}

/**
 * Creates a table from a spec (does NOT check for prior existence).
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
async function getTables(transaction = db.knex) {
    return dispatchByClient(transaction, {
        sqlite: async () => {
            const response = await transaction.raw('select * from sqlite_master where type = "table"');
            return _.reject(_.map(response, 'tbl_name'), name => name === 'sqlite_sequence');
        },
        mysql: async () => {
            const response = await transaction.raw('show tables');
            return _.flatten(_.map(response[0], entry => _.values(entry)));
        }
    });
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getIndexes(table, transaction = db.knex) {
    return dispatchByClient(transaction, {
        sqlite: async () => {
            const response = await transaction.raw(`pragma index_list("${table}")`);
            return _.flatten(_.map(response, 'name'));
        },
        mysql: async () => {
            const response = await transaction.raw(`SHOW INDEXES from ${table}`);
            return _.flatten(_.map(response[0], 'Key_name'));
        }
    });
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getColumns(table, transaction = db.knex) {
    return dispatchByClient(transaction, {
        sqlite: async () => {
            const response = await transaction.raw(`pragma table_info("${table}")`);
            return _.flatten(_.map(response, 'name'));
        },
        mysql: async () => {
            const response = await transaction.raw(`SHOW COLUMNS from ${table}`);
            return _.flatten(_.map(response[0], 'Field'));
        }
    });
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
    // NOTE: exposed for testing purposes only
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};
```

## Summary of Changes

| Problem | Solution |
|---|---|
| `Object.prototype.hasOwnProperty.call()` repeated 20+ times | `has()` one-liner helper |
| Column type selection mixed with modifier application | Split into `buildColumnType()` + `applyColumnModifiers()` |
| Identical MySQL algorithm-append logic in `addColumn`/`dropColumn` | `appendMySQLAlgorithm()` helper |
| Identical SQLite/non-SQLite execution branching in `addColumn`/`dropColumn` | `executeSchemaBuilder()` helper |
| SQLite `PRAGMA foreign_keys` disable/re-enable duplicated in `addForeign`/`dropForeign` | `withSQLiteForeignKeysDisabled()` helper using `try/finally` |
| Identical try/catch error-code patterns in `addIndex`/`dropIndex`/`addUnique`/`dropUnique` | `withConstraintErrorHandling()` wrapper |
| Identical client-dispatch pattern in `getTables`/`getIndexes`/`getColumns` | `dispatchByClient()` helper |
| `tableSpec['@@INDEXES@@']` existence checks | Optional chaining (`?.forEach`) |