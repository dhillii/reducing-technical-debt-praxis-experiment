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

const DEFAULT_STRING_MAX_LENGTH = 191;

// Helper to check own property existence and truthiness
function hasSpec(spec, key) {
    return Object.prototype.hasOwnProperty.call(spec, key);
}

function buildColumn(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasSpec(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        return tableBuilder[columnSpec.type](columnName, columnSpec.maxlength || DEFAULT_STRING_MAX_LENGTH);
    }
    return tableBuilder[columnSpec.type](columnName);
}

function applyDeleteBehavior(column, columnSpec) {
    if (hasSpec(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (hasSpec(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
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
    const column = buildColumn(tableBuilder, columnName, columnSpec);

    const isNullable = hasSpec(columnSpec, 'nullable') && columnSpec.nullable === true;
    isNullable ? column.nullable() : column.nullable(false);

    if (hasSpec(columnSpec, 'primary') && columnSpec.primary) column.primary();
    if (hasSpec(columnSpec, 'unique') && columnSpec.unique) column.unique();
    if (hasSpec(columnSpec, 'unsigned') && columnSpec.unsigned) column.unsigned();
    if (hasSpec(columnSpec, 'references')) column.references(columnSpec.references);
    if (hasSpec(columnSpec, 'constraintName')) column.withKeyName(columnSpec.constraintName);
    if (hasSpec(columnSpec, 'defaultTo')) column.defaultTo(columnSpec.defaultTo);
    if (hasSpec(columnSpec, 'index') && columnSpec.index) column.index();

    applyDeleteBehavior(column, columnSpec);
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

function applyMySQLAlgorithm(sql, options) {
    sql = sql.replace(/;\s*$/, '');
    if (options?.algorithm !== 'auto') {
        const algorithm = options?.algorithm || 'copy';
        sql += `, algorithm=${algorithm}`;
    }
    return sql;
}

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
    if (hasSpec(columnSpec, 'references')) {
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

function handleDuplicateError(columns, tableName, duplicateCodes) {
    return function (err) {
        if (duplicateCodes.includes(err.code)) {
            logging.warn(`Constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    };
}

function handleMissingError(columns, tableName, missingCodes) {
    return function (err) {
        if (missingCodes.includes(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    };
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
    return transaction.schema
        .table(tableName, table => table.index(columns))
        .catch(handleDuplicateError(columns, tableName, ['SQLITE_ERROR', 'ER_DUP_KEYNAME']));
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
    return transaction.schema
        .table(tableName, table => table.dropIndex(columns))
        .catch(handleMissingError(columns, tableName, ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']));
}

/**
 * Adds a unique index to a table over the given columns.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
    return transaction.schema
        .table(tableName, table => table.unique(columns))
        .catch(handleDuplicateError(columns, tableName, ['SQLITE_ERROR', 'ER_DUP_KEYNAME']));
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
    return transaction.schema
        .table(tableName, table => table.dropUnique(columns))
        .catch(handleMissingError(columns, tableName, ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']));
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

async function withSQLiteForeignKeysDisabled(transaction, fn) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return fn();
    }

    const [{foreign_keys}] = await db.knex.raw('PRAGMA foreign_keys;');
    if (foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    try {
        return await fn();
    } finally {
        if (foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
    }
}

function buildForeignKeyReference(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete) {
    const fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
    if (cascadeDelete) return fkBuilder.onDelete('CASCADE');
    if (setNullDelete) return fkBuilder.onDelete('SET NULL');
    return fkBuilder;
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
                const fkBuilder = buildForeignKeyReference(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete);
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
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if primary key index exists in a table (SQLite only).
 *
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: t