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

const hasOwn = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

// --- Column builder helpers ---

function buildColumnType(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasOwn(columnSpec, 'fieldtype')) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        return tableBuilder.string(columnName, hasOwn(columnSpec, 'maxlength') ? columnSpec.maxlength : 191);
    }
    return tableBuilder[columnSpec.type](columnName);
}

function applyColumnModifiers(column, columnSpec) {
    column[columnSpec.nullable === true ? 'nullable' : 'notNullable']();

    if (hasOwn(columnSpec, 'primary') && columnSpec.primary)       column.primary();
    if (hasOwn(columnSpec, 'unique') && columnSpec.unique)         column.unique();
    if (hasOwn(columnSpec, 'unsigned') && columnSpec.unsigned)     column.unsigned();
    if (hasOwn(columnSpec, 'references'))                          column.references(columnSpec.references);
    if (hasOwn(columnSpec, 'constraintName'))                      column.withKeyName(columnSpec.constraintName);
    if (hasOwn(columnSpec, 'defaultTo'))                           column.defaultTo(columnSpec.defaultTo);
    if (hasOwn(columnSpec, 'index') && columnSpec.index)           column.index();

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
    const column = buildColumnType(tableBuilder, columnName, columnSpec);
    applyColumnModifiers(column, columnSpec);
}

// --- Nullable helpers ---

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

// --- MySQL algorithm helper ---

function applyMySQLAlgorithm(sql, options) {
    const cleaned = sql.replace(/;\s*$/, '');
    if (options?.algorithm === 'auto') {
        return cleaned;
    }
    const algorithm = options?.algorithm || 'copy';
    return `${cleaned}, algorithm=${algorithm}`;
}

async function executeSchemaBuilder(builder, transaction, options = {}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    for (const sqlQuery of builder.toSQL()) {
        const sql = DatabaseInfo.isMySQL(transaction)
            ? applyMySQLAlgorithm(sqlQuery.sql, options)
            : sqlQuery.sql;
        await transaction.raw(sql);
    }
}

// --- Column operations ---

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
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
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
        return await transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return await transaction.schema.table(tableName, table => table.renameColumn(from, to));
}

// --- Index / constraint operations ---

const DUPLICATE_INDEX_CODES = new Set(['SQLITE_ERROR', 'ER_DUP_KEYNAME']);
const MISSING_INDEX_CODES = new Set(['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']);

async function withConstraintErrorHandling(fn, alreadyExistsMsg, doesNotExistMsg, duplicateCodes, missingCodes) {
    try {
        return await fn();
    } catch (err) {
        if (duplicateCodes && duplicateCodes.has(err.code)) {
            logging.warn(alreadyExistsMsg);
            return;
        }
        if (missingCodes && missingCodes.has(err.code)) {
            logging.warn(doesNotExistMsg);
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
async function addIndex(tableName, columns, transaction = db.knex) {
    logging.info(`Adding index for '${columns}' in table '${tableName}'`);
    await withConstraintErrorHandling(
        () => transaction.schema.table(tableName, table => table.index(columns)),
        `Index for '${columns}' already exists for table '${tableName}'`,
        null,
        DUPLICATE_INDEX_CODES,
        null
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
    await withConstraintErrorHandling(
        () => transaction.schema.table(tableName, table => table.dropIndex(columns)),
        null,
        `Constraint for '${columns}' does not exist for table '${tableName}'`,
        null,
        MISSING_INDEX_CODES
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
    await withConstraintErrorHandling(
        () => transaction.schema.table(tableName, table => table.unique(columns)),
        `Constraint for '${columns}' already exists for table '${tableName}'`,
        null,
        DUPLICATE_INDEX_CODES,
        null
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
    await withConstraintErrorHandling(
        () => transaction.schema.table(tableName, table => table.dropUnique(columns)),
        null,
        `Constraint for '${columns}' does not exist for table '${tableName}'`,
        null,
        MISSING_INDEX_CODES
    );
}

// --- SQLite foreign key / primary key pragma helpers ---

/**
 * @param {import('knex').Knex} transaction
 */
async function getSQLiteForeignKeyState(transaction) {
    const result = await db.knex.raw('PRAGMA foreign_keys;');
    return result[0].foreign_keys;
}

/**
 * Temporarily disables SQLite foreign keys, runs fn, then restores state.
 * See https://github.com/knex/knex/issues/4155
 *
 * @param {import('knex').Knex} transaction
 * @param {Function} fn
 */
async function withSQLiteForeignKeysDisabled(transaction, fn) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return fn();
    }

    const foreignKeysEnabled = await getSQLiteForeignKeyState(transaction);
    if (foreignKeysEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    try {
        return await fn();
    } finally {
        if (foreignKeysEnabled) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
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
                let fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);

                if (cascadeDelete)    fkBuilder = fkBuilder.onDelete('CASCADE');
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
    } catch (err)