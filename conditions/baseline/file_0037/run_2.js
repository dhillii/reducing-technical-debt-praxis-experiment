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

// --- Column Builder Helpers ---

function buildColumnType(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasOwn(columnSpec, 'fieldtype')) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        return tableBuilder.string(columnName, columnSpec.maxlength || 191);
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

// --- MySQL Algorithm Helper ---

function applyMySQLAlgorithm(sql, options) {
    if (!options?.algorithm || options.algorithm !== 'auto') {
        const algorithm = options?.algorithm || 'copy';
        return sql.replace(/;\s*$/, '') + `, algorithm=${algorithm}`;
    }
    return sql.replace(/;\s*$/, '');
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

// --- Index / Unique Constraint Helpers ---

function makeSchemaTableOperation(action, logVerb, alreadyExistsCodes, doesNotExistCodes) {
    return async function (tableName, columns, transaction = db.knex) {
        try {
            logging.info(`${logVerb} for '${columns}' in table '${tableName}'`);
            return await transaction.schema.table(tableName, table => table[action](columns));
        } catch (err) {
            const warnCodes = [...(alreadyExistsCodes || []), ...(doesNotExistCodes || [])];
            if (warnCodes.includes(err.code)) {
                logging.warn(`Constraint for '${columns}' in table '${tableName}' - skipped`);
                return;
            }
            throw err;
        }
    };
}

/**
 * Adds a non-unique index to a table over the given columns.
 */
const addIndex = makeSchemaTableOperation(
    'index',
    'Adding index',
    ['SQLITE_ERROR', 'ER_DUP_KEYNAME']
);

/**
 * Drops a non-unique index from a table over the given columns.
 */
const dropIndex = makeSchemaTableOperation(
    'dropIndex',
    'Dropping index',
    ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']
);

/**
 * Adds a unique index to a table over the given columns.
 */
const addUnique = makeSchemaTableOperation(
    'unique',
    'Adding unique constraint',
    ['SQLITE_ERROR', 'ER_DUP_KEYNAME']
);

/**
 * Drops a unique key constraint from a table.
 */
const dropUnique = makeSchemaTableOperation(
    'dropUnique',
    'Dropping unique constraint',
    ['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY']
);

// --- SQLite Foreign Key / Primary Key Checks ---

/**
 * Checks if a foreign key exists in a table (SQLite only).
 */
async function hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction = db.knex}) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasForeignSQLite3)});
    }

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return foreignKeys.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

/**
 * Checks if a primary key index exists in a table (SQLite only).
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasPrimaryKeySQLiteError)});
    }

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.find(c => c.origin === 'pk');
}

// --- SQLite Foreign Key Toggle ---

async function withSQLiteForeignKeysDisabled(transaction, fn) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return fn();
    }

    const [{foreign_keys}] = await db.knex.raw('PRAGMA foreign_keys;');
    if (foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    await fn();

    if (foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    }
}

// --- Foreign Key Operations ---

/**
 * Adds a foreign key to a table.
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

        await withSQLiteForeignKeysDisabled(transaction, async () => {
            await transaction.schema.table(fromTable, function (table) {
                let fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);

                if (cascadeDelete)    fkBuilder = fkBuilder.onDelete('CASCADE');
                else if (setNullDelete) fkBuilder = fkBuilder.onDelete('SET NULL');

                if (constraintName) fkBuilder.withKeyName(constraintName);
            });
        });
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
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

// --- Primary Key ---

/**
 * Adds a primary key index to a table over the given columns.
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

// --- Table Operations ---

/**
 * Creates a table according to the provided spec, or falls back to the current schema.
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, function (t) {
        Object.keys(tableSpec)
            .filter(column => !column.startsWith('@@'))
            .forEach(column => addTableColumn(table, t, column, tableSpec[column]));

        if (tableSpec['@@INDEXES@@']) {
            tableSpec['@@INDEXES@@'].forEach(index => t.index(index));
        }
        if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
            tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(unique => t.unique(unique));
        }
    });
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

// --- Introspection ---

const DB_QUERIES = {
    sqlite3: {
        getTables:  tx => tx.raw('select * from sqlite_master where type = "table"')
            .then(r => _.reject(_.map(r, 'tbl_name'), n => n === 'sqlite_sequence')),
        getIndexes: (tx, table) => tx.raw(`pragma index_list("${table}")`)
            .then(r => _.flatten(_.map(r, 'name'))),
        getColumns: (tx, table) => tx.raw(`pragma table_info("${table}")`)
            .then(r =>