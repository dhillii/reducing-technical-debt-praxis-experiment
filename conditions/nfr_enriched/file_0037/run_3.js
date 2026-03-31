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

const DB_ERROR_CODES = {
    SQLITE_ERROR: 'SQLITE_ERROR',
    DUPLICATE_KEY: ['ER_DUP_KEYNAME', 'ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'],
    CANT_DROP: ['ER_CANT_DROP_FIELD_OR_KEY'],
    MULTIPLE_PRI_KEY: 'ER_MULTIPLE_PRI_KEY'
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function isTrue(obj, key) {
    return hasOwn(obj, key) && obj[key] === true;
}

function getDbClient(transaction) {
    return transaction.client.config.client;
}

function isErrorCode(err, codes) {
    return [].concat(codes).includes(err.code);
}

// ─── Column Building ─────────────────────────────────────────────────────────

function buildColumnType(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasOwn(columnSpec, 'fieldtype')) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }

    if (columnSpec.type === 'string') {
        const maxlength = columnSpec.maxlength || DEFAULT_STRING_MAX_LENGTH;
        return tableBuilder.string(columnName, maxlength);
    }

    return tableBuilder[columnSpec.type](columnName);
}

function applyColumnModifiers(column, columnSpec) {
    const isNullable = isTrue(columnSpec, 'nullable');
    isNullable ? column.nullable() : column.nullable(false);

    if (isTrue(columnSpec, 'primary'))       column.primary();
    if (isTrue(columnSpec, 'unique'))        column.unique();
    if (isTrue(columnSpec, 'unsigned'))      column.unsigned();
    if (isTrue(columnSpec, 'index'))         column.index();
    if (hasOwn(columnSpec, 'references'))    column.references(columnSpec.references);
    if (hasOwn(columnSpec, 'constraintName')) column.withKeyName(columnSpec.constraintName);
    if (hasOwn(columnSpec, 'defaultTo'))     column.defaultTo(columnSpec.defaultTo);

    if (isTrue(columnSpec, 'cascadeDelete')) {
        column.onDelete('CASCADE');
    } else if (isTrue(columnSpec, 'setNullDelete')) {
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

// ─── Algorithm Helpers ───────────────────────────────────────────────────────

function buildMySQLAlterSQL(sql, options = {}) {
    const cleaned = sql.replace(/;\s*$/, '');
    if (options.algorithm === 'auto') {
        return cleaned;
    }
    const algorithm = options.algorithm || 'copy';
    return `${cleaned}, algorithm=${algorithm}`;
}

async function executeAlterStatements(builder, transaction, options = {}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    for (const sqlQuery of builder.toSQL()) {
        const sql = DatabaseInfo.isMySQL(transaction)
            ? buildMySQLAlterSQL(sqlQuery.sql, options)
            : sqlQuery.sql;
        await transaction.raw(sql);
    }
}

// ─── SQLite Foreign Key Pragma Helpers ───────────────────────────────────────

async function withSQLiteForeignKeysDisabled(transaction, fn) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return fn();
    }

    const [{ foreign_keys }] = await db.knex.raw('PRAGMA foreign_keys;');

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

// ─── Add / Drop Column ───────────────────────────────────────────────────────

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
    await executeAlterStatements(builder, transaction, options);
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
    await executeAlterStatements(builder, transaction, options);
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

// ─── Index / Unique Helpers ──────────────────────────────────────────────────

async function schemaTableOperation(transaction, tableName, fn, {
    logMessage,
    warnMessage,
    alreadyExistsCodes = [],
    doesNotExistCodes = []
}) {
    try {
        logging.info(logMessage);
        return await transaction.schema.table(tableName, fn);
    } catch (err) {
        const ignoreCodes = [...alreadyExistsCodes, ...doesNotExistCodes];
        if (isErrorCode(err, ignoreCodes) || err.code === DB_ERROR_CODES.SQLITE_ERROR) {
            logging.warn(warnMessage);
            return;
        }
        throw err;
    }
}

/**
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    return schemaTableOperation(
        transaction, tableName,
        table => table.index(columns),
        {
            logMessage: `Adding index for '${columns}' in table '${tableName}'`,
            warnMessage: `Index for '${columns}' already exists for table '${tableName}'`,
            alreadyExistsCodes: ['ER_DUP_KEYNAME']
        }
    );
}

/**
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    return schemaTableOperation(
        transaction, tableName,
        table => table.dropIndex(columns),
        {
            logMessage: `Dropping index for '${columns}' in table '${tableName}'`,
            warnMessage: `Constraint for '${columns}' does not exist for table '${tableName}'`,
            doesNotExistCodes: ['ER_CANT_DROP_FIELD_OR_KEY']
        }
    );
}

/**
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    return schemaTableOperation(
        transaction, tableName,
        table => table.unique(columns),
        {
            logMessage: `Adding unique constraint for '${columns}' in table '${tableName}'`,
            warnMessage: `Constraint for '${columns}' already exists for table '${tableName}'`,
            alreadyExistsCodes: ['ER_DUP_KEYNAME']
        }
    );
}

/**
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    return schemaTableOperation(
        transaction, tableName,
        table => table.dropUnique(columns),
        {
            logMessage: `Dropping unique constraint for '${columns}' in table '${tableName}'`,
            warnMessage: `Constraint for '${columns}' does not exist for table '${tableName}'`,
            doesNotExistCodes: ['ER_CANT_DROP_FIELD_OR_KEY']
        }
    );
}

// ─── Foreign Keys ────────────────────────────────────────────────────────────

/**
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

function buildForeignKeyBuilder(table, fromColumn, toTable, toColumn, {cascadeDelete, setNullDelete, constraintName}) {
    let fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);

    if (cascadeDelete)  fkBuilder = fkBuilder.onDelete('CASCADE');
    else if (setNullDelete) fkBuilder = fkBuilder.onDelete('SET NULL');

    if (constraintName) fkBuilder.withKeyName(constraintName);
}

/**
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
    const fkLabel = `${fromTable}.${fromColumn} to ${toTable}.${toColumn}`;

    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (exists) {
            logging.warn(`Skipped adding foreign key from ${fkLabel} - already exists`);
            return;
        }
    }

    try {
        logging.info(`Adding foreign key from ${fkLabel}`);

        await withSQLiteForeignKeysDisabled(transaction, () =>
            transaction.schema.table(fromTable, table =>
                buildForeignKeyBuilder(table, fromColumn, toTable, toColumn, {cascadeDelete, setNullDelete, constraintName})
            )
        );
    } catch (err) {
        if (isErrorCode(err, DB_ERROR_CODES.DUPLICATE_KEY)) {
            logging.warn(`Skipped adding foreign key from ${fkLabel} - already exists`);
            return;
        }
        throw err;
    }
}

/**
 * @param {Object} config
 * @param {string} config.fromTable
 * @param {string} config.fromColumn
 * @param {string} config.toTable
 * @param {string} config.toColumn
 * @param {string} [config.constraintName]
 * @param {import('knex').Knex} [config.transaction]
 */
async function dropForeign({fromTable, fromColumn, toTable, toColumn, constraintName, transaction = db.knex}) {
    const fkLabel = `${fromTable}.${fromColumn} to ${toTable}.${toColumn}`;

    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (!exists) {
            logging.warn(`Skipped dropping foreign key from