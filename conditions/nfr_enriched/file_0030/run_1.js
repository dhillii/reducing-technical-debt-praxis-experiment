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
 * @param {object} spec
 * @param {string} prop
 */
const hasProp = (spec, prop) => Object.prototype.hasOwnProperty.call(spec, prop);

/**
 * Builds the base column definition on the table builder.
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
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
 * Applies the delete behaviour (CASCADE or SET NULL) to a column builder.
 * @param {object} column
 * @param {object} columnSpec
 */
function applyDeleteBehaviour(column, columnSpec) {
    if (hasProp(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (hasProp(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies the delete behaviour to a foreign key builder.
 * @param {object} fkBuilder
 * @param {boolean} cascadeDelete
 * @param {boolean} setNullDelete
 */
function applyForeignKeyDeleteBehaviour(fkBuilder, cascadeDelete, setNullDelete) {
    if (cascadeDelete) {
        return fkBuilder.onDelete('CASCADE');
    }
    if (setNullDelete) {
        return fkBuilder.onDelete('SET NULL');
    }
    return fkBuilder;
}

/**
 * Disables SQLite foreign keys and returns whether they were enabled.
 * @param {import('knex').Knex} knex
 * @returns {Promise<boolean>}
 */
async function disableSQLiteForeignKeys(knex) {
    const [{foreign_keys}] = await knex.raw('PRAGMA foreign_keys;');
    if (foreign_keys) {
        await knex.raw('PRAGMA foreign_keys = OFF;');
    }
    return Boolean(foreign_keys);
}

/**
 * Re-enables SQLite foreign keys if they were previously enabled.
 * @param {import('knex').Knex} knex
 * @param {boolean} wereEnabled
 */
async function restoreSQLiteForeignKeys(knex, wereEnabled) {
    if (wereEnabled) {
        await knex.raw('PRAGMA foreign_keys = ON;');
    }
}

/**
 * Applies an ALTER TABLE statement with an optional MySQL algorithm hint.
 * @param {import('knex').Knex} transaction
 * @param {object[]} sqlQueries
 * @param {object} options
 * @param {'inplace'|'copy'|'auto'} [options.algorithm]
 */
async function executeAlterWithAlgorithm(transaction, sqlQueries, options = {}) {
    for (const {sql: rawSql} of sqlQueries) {
        let sql = rawSql;

        if (DatabaseInfo.isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (options.algorithm !== 'auto') {
                sql += `, algorithm=${options.algorithm ?? 'copy'}`;
            }
        }

        await transaction.raw(sql);
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
    const column = buildBaseColumn(tableBuilder, columnName, columnSpec);

    hasProp(columnSpec, 'nullable') && columnSpec.nullable === true
        ? column.nullable()
        : column.nullable(false);

    if (hasProp(columnSpec, 'primary') && columnSpec.primary)       { column.primary(); }
    if (hasProp(columnSpec, 'unique') && columnSpec.unique)         { column.unique(); }
    if (hasProp(columnSpec, 'unsigned') && columnSpec.unsigned)     { column.unsigned(); }
    if (hasProp(columnSpec, 'references'))                          { column.references(columnSpec.references); }
    if (hasProp(columnSpec, 'constraintName'))                      { column.withKeyName(columnSpec.constraintName); }
    if (hasProp(columnSpec, 'defaultTo'))                           { column.defaultTo(columnSpec.defaultTo); }
    if (hasProp(columnSpec, 'index') && columnSpec.index)           { column.index(); }

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

// ─── Add / Drop / Rename column ───────────────────────────────────────────────

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

    if (DatabaseInfo.isSQLite(transaction)) {
        return await builder;
    }

    await executeAlterWithAlgorithm(transaction, builder.toSQL(), options);
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

    if (DatabaseInfo.isSQLite(transaction)) {
        return await builder;
    }

    await executeAlterWithAlgorithm(transaction, builder.toSQL(), options);
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
        return await transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return await transaction.schema.table(tableName, table => table.renameColumn(from, to));
}

// ─── Index helpers ────────────────────────────────────────────────────────────

/**
 * Wraps a schema operation and swallows known "already exists" / "does not exist" errors.
 * @param {Function} operation - async function to execute
 * @param {string[]} alreadyExistsCodes - error codes that mean "skip silently"
 * @param {string} warnMessage - message to log when skipping
 */
async function schemaOperationWithFallback(operation, alreadyExistsCodes, warnMessage) {
    try {
        return await operation();
    } catch (err) {
        if (alreadyExistsCodes.includes(err.code)) {
            logging.warn(warnMessage);
            return;
        }
        throw err;
    }
}

/**
 * Adds a non-unique index to a table over the given columns.
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    logging.info(`Adding index for '${columns}' in table '${tableName}'`);

    return schemaOperationWithFallback(
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

    return schemaOperationWithFallback(
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

    return schemaOperationWithFallback(
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

    return schemaOperationWithFallback(
        () => transaction.schema.table(tableName, table => table.dropUnique(columns)),
        ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
        `Constraint for '${columns}' does not exist for table '${tableName}'`
    );
}

// ─── Foreign key helpers ──────────────────────────────────────────────────────

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
        throw new errors.InternalServerError({message: tpl(messages.hasForeignSQLite3)});
    }

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);

    return foreignKeys.some(
        fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn
    );
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
async function addForeign({
    fromTable, fromColumn, toTable, toColumn,
    constraintName, cascadeDelete = false, setNullDelete = false,
    transaction = db.knex
}) {
    const skipMessage = `Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`;

    if (DatabaseInfo.isSQLite(transaction)) {
        if (await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction})) {
            logging.warn(skipMessage);
            return;
        }
    }

    try {
        logging.info(`Adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        const isSQLite = DatabaseInfo.isSQLite(transaction);
        const wereEnabled = isSQLite ? await disableSQLiteForeignKeys(db.knex) : false;

        await transaction.schema.table(fromTable, (table) => {
            let fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
            fkBuilder = applyForeignKeyDeleteBehaviour(fkBuilder, cascadeDelete, setNullDelete);
            if (constraintName) {
                fkBuilder.withKeyName(constraintName);
            }
        });

        if (isSQLite) {
            await restoreSQLiteForeignKeys(db.knex, wereEnabled);
        }
    } catch (err) {
        if (['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'].includes(err.code)) {
            logging.warn(skipMessage);
            return;
        }
        throw err;
    }
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
    const skipMessage = `Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`;

    if (DatabaseInfo.isSQLite(transaction)) {
        if (!await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction})) {
            logging.warn(skipMessage);
            return;
        }
    }

    try {
        logging.info(`Dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        const isSQLite = DatabaseInfo.isSQLite(transaction);
        const wereEnabled = isSQLite ? await disableSQLiteForeignKeys(db.knex) : false;

        await transaction.schema.table(fromTable, table => table.dropForeign(fromColumn, constraintName));

        if (isSQLite) {
            await restoreSQLiteForeignKeys(db.knex, wereEnabled);
        }
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(skipMessage);
            return;
        }
        throw err;
    }
}

// ─── Primary key ──────────────────────────────────────────────────────────────

/**
 * Checks if a primary key index exists in a table (SQLite only).
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
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addPrimaryKey(tableName, columns, transaction = db.knex) {
    const skipMessage = `Primary key constraint for '${columns}' already exists for table '${tableName}'`;

    if (DatabaseInfo.isSQLite(transaction) && await hasPrimaryKeySQLite(tableName, transaction)) {
        logging.warn(skipMessage);
        return;
    }

    return schemaOperationWithFallback(
        () => {
            logging.info(`Adding primary key constraint for '${columns}' in table '${tableName}'`);
            return transaction.schema.table(tableName, table => table.primary(columns));
        },
        ['ER_MULTIPLE_PRI_KEY'],
        skipMessage
    );
}

// ─── Table helpers ────────────────────────────────────────────────────────────

/**
 * Creates a table according to the provided spec, or falls back to the current schema.
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
 * Runs a client-specific query and rejects with a helpful message for unsupported clients.
 * @param {import('knex').Knex} transaction
 * @param {{ sqlite3: Function, mysql2: Function }} handlers
 */
async function runClientQuery(transaction, handlers) {
    const client = transaction.client.config.client;
    const handler = handlers[client];

    if (!handler) {
        return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
    }

    return handler();
}

/**
 * @param {import('knex').Knex} [transaction]
 */
async function getTables(transaction = db.knex) {
    return runClientQuery(transaction, {
        sqlite3: async () => {
            const response = await transaction.raw('select * from sqlite_master where type = "table"');
            return _.reject(_.map(response, 'tbl_name'), name => name === 'sqlite_sequence');
        },
        mysql2: async () => {
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
    return runClientQuery(transaction, {
        sqlite3: async () => {
            const response = await transaction.raw(`pragma index_list("${table}")`);
            return _.flatten(_.map(response, 'name'));
        },
        mysql2: async () => {
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
    return runClientQuery(transaction, {
        sqlite3: async () => {
            const response = await transaction.raw(`pragma table_info("${table}")`);
            return _.flatten(_.map(response, 'name'));
        },
        mysql2: async () => {
            const response = await transaction.raw(`SHOW COLUMNS from ${table}`);
            return _.flatten(_.map(response[0], 'Field'));
        }
    });
}

// ─── Migration factory ────────────────────────────────────────────────────────

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

---

### Key refactoring decisions

| Problem | Solution |
|---|---|
| `Object.prototype.hasOwnProperty.call(spec, prop)` repeated ~15 times | Extracted into a `hasProp(spec, prop)` helper |
| `addTableColumn` was a long, flat function | Split into `buildBaseColumn` and `applyDeleteBehaviour` helpers |
| `addIndex/dropIndex/addUnique/dropUnique` all had identical try/catch structure | Extracted into `schemaOperationWithFallback(operation, codes, warnMessage)` |
| `getTables/getIndexes/getColumns` all had identical `if/else if/reject` branching | Extracted into `runClientQuery(transaction, handlers)` dispatch table |
| SQLite foreign-key pragma toggle duplicated in `addForeign` and `dropForeign` | Extracted into `disableSQLiteForeignKeys` / `restoreSQLiteForeignKeys` |
| `addForeign` had a three-branch `if/else if/else` for delete behaviour | Extracted into `applyForeignKeyDeleteBehaviour` |
| `addColumn`/`dropColumn` duplicated the MySQL algorithm-hint loop | Extracted into `executeAlterWithAlgorithm` |
| Repeated skip/warn messages built inline | Hoisted into named `skipMessage` constants |
| `tableSpec['@@INDEXES@@']` guarded with `if` before `.forEach` | Replaced with optional chaining (`?.forEach`) |