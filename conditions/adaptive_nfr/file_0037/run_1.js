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

const hasOwn = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

// --- Column Builder Helpers ---

function buildColumnType(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasOwn(columnSpec, 'fieldtype')) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        return tableBuilder.string(columnName, columnSpec.maxlength || DEFAULT_STRING_MAX_LENGTH);
    }
    return tableBuilder[columnSpec.type](columnName);
}

function applyColumnModifiers(column, columnSpec) {
    const isNullable = hasOwn(columnSpec, 'nullable') && columnSpec.nullable === true;
    isNullable ? column.nullable() : column.nullable(false);

    if (hasOwn(columnSpec, 'primary') && columnSpec.primary) {
        column.primary();
    }
    if (hasOwn(columnSpec, 'unique') && columnSpec.unique) {
        column.unique();
    }
    if (hasOwn(columnSpec, 'unsigned') && columnSpec.unsigned) {
        column.unsigned();
    }
    if (hasOwn(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }
    if (hasOwn(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }
    if (hasOwn(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (hasOwn(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
    if (hasOwn(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
    if (hasOwn(columnSpec, 'index') && columnSpec.index) {
        column.index();
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

// --- Nullable Helpers ---

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

// --- Algorithm SQL Helper ---

function applyMySQLAlgorithm(sql, options = {}) {
    const cleaned = sql.replace(/;\s*$/, '');
    if (options.algorithm === 'auto') {
        return cleaned;
    }
    const algorithm = options.algorithm || 'copy';
    return `${cleaned}, algorithm=${algorithm}`;
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

// --- Column Operations ---

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

// --- Index / Constraint Operations ---

function makeSchemaTableOperation(tableName, transaction, fn) {
    return transaction.schema.table(tableName, fn);
}

async function handleConstraintError(err, alreadyExistsCodes, doesNotExistCodes, logMessage) {
    if (alreadyExistsCodes.includes(err.code) || doesNotExistCodes.includes(err.code)) {
        logging.warn(logMessage);
        return;
    }
    throw err;
}

/**
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);
        return await makeSchemaTableOperation(tableName, transaction, table => table.index(columns));
    } catch (err) {
        await handleConstraintError(
            err,
            ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
            [],
            `Index for '${columns}' already exists for table '${tableName}'`
        );
    }
}

/**
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping index for '${columns}' in table '${tableName}'`);
        return await makeSchemaTableOperation(tableName, transaction, table => table.dropIndex(columns));
    } catch (err) {
        await handleConstraintError(
            err,
            [],
            ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
            `Constraint for '${columns}' does not exist for table '${tableName}'`
        );
    }
}

/**
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
        return await makeSchemaTableOperation(tableName, transaction, table => table.unique(columns));
    } catch (err) {
        await handleConstraintError(
            err,
            ['SQLITE_ERROR', 'ER_DUP_KEYNAME'],
            [],
            `Constraint for '${columns}' already exists for table '${tableName}'`
        );
    }
}

/**
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);
        return await makeSchemaTableOperation(tableName, transaction, table => table.dropUnique(columns));
    } catch (err) {
        await handleConstraintError(
            err,
            [],
            ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'],
            `Constraint for '${columns}' does not exist for table '${tableName}'`
        );
    }
}

// --- Foreign Key Helpers ---

async function withSQLiteForeignKeysDisabled(fn) {
    const foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
    const wasEnabled = foreignKeysEnabled[0].foreign_keys;

    if (wasEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    await fn();

    if (wasEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    }
}

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

function buildForeignKeyReference(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete) {
    const ref = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
    if (cascadeDelete) {
        return ref.onDelete('CASCADE');
    }
    if (setNullDelete) {
        return ref.onDelete('SET NULL');
    }
    return ref;
}

/**
 * @param {Object} config
 * @param {string} config.fromTable
 * @param {string} config.fromColumn
 * @param {string} config.toTable
 * @param {string} config.toColumn
 * @param {string} [config.constraintName]
 * @param {Boolean} [config.cascadeDelete]
 * @param {Boolean} [config.setNullDelete]
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

        const applyForeignKey = async () => {
            await transaction.schema.table(fromTable, (table) => {
                const fkBuilder = buildForeignKeyReference(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete);
                if (constraintName) {
                    fkBuilder.withKeyName(constraintName);
                }
            });
        };

        if (DatabaseInfo.isSQLite(transaction)) {
            await withSQLiteForeignKeysDisabled(applyForeignKey);
        } else {
            await applyForeignKey();
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

        const applyDrop = async () => {
            await transaction.schema.table(fromTable, table => table.dropForeign(fromColumn, constraintName));
        };

        if (DatabaseInfo.isSQLite(transaction)) {
            await withSQLiteForeignKeysDisabled(applyDrop);
        } else {
            await applyDrop();
        }
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${from