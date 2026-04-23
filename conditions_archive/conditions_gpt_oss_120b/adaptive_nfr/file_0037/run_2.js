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

/* Predicate helpers ------------------------------------------------------- */

/**
 * @param {object} spec
 * @returns {boolean}
 */
function isTextWithFieldtype(spec) {
    return spec.type === 'text' && Object.prototype.hasOwnProperty.call(spec, 'fieldtype');
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function isString(spec) {
    return spec.type === 'string';
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function isStringWithMaxlength(spec) {
    return Object.prototype.hasOwnProperty.call(spec, 'maxlength');
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasNullableTrue(spec) {
    return spec.nullable === true;
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasPrimaryTrue(spec) {
    return spec.primary === true;
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasUnique(spec) {
    return !!spec.unique;
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasUnsigned(spec) {
    return !!spec.unsigned;
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasReferences(spec) {
    return Object.prototype.hasOwnProperty.call(spec, 'references');
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasConstraintName(spec) {
    return Object.prototype.hasOwnProperty.call(spec, 'constraintName');
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasCascadeDelete(spec) {
    return spec.cascadeDelete === true;
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasSetNullDelete(spec) {
    return spec.setNullDelete === true;
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasDefaultTo(spec) {
    return Object.prototype.hasOwnProperty.call(spec, 'defaultTo');
}

/**
 * @param {object} spec
 * @returns {boolean}
 */
function hasIndexTrue(spec) {
    return spec.index === true;
}

/* Column creation helpers ------------------------------------------------- */

/**
 * @param {object} column
 * @param {object} spec
 */
function applyNullable(column, spec) {
    if (hasNullableTrue(spec)) {
        column.nullable();
    } else {
        column.nullable(false);
    }
}

/**
 * @param {object} column
 * @param {object} spec
 */
function applyPrimary(column, spec) {
    if (hasPrimaryTrue(spec)) {
        column.primary();
    }
}

/**
 * @param {object} column
 * @param {object} spec
 */
function applyUnique(column, spec) {
    if (hasUnique(spec)) {
        column.unique();
    }
}

/**
 * @param {object} column
 * @param {object} spec
 */
function applyUnsigned(column, spec) {
    if (hasUnsigned(spec)) {
        column.unsigned();
    }
}

/**
 * @param {object} column
 * @param {object} spec
 */
function applyReferences(column, spec) {
    if (hasReferences(spec)) {
        column.references(spec.references);
    }
}

/**
 * @param {object} column
 * @param {object} spec
 */
function applyConstraintName(column, spec) {
    if (hasConstraintName(spec)) {
        column.withKeyName(spec.constraintName);
    }
}

/**
 * @param {object} column
 * @param {object} spec
 */
function applyOnDelete(column, spec) {
    if (hasCascadeDelete(spec)) {
        column.onDelete('CASCADE');
    } else if (hasSetNullDelete(spec)) {
        column.onDelete('SET NULL');
    }
}

/**
 * @param {object} column
 * @param {object} spec
 */
function applyDefault(column, spec) {
    if (hasDefaultTo(spec)) {
        column.defaultTo(spec.defaultTo);
    }
}

/**
 * @param {object} column
 * @param {object} spec
 */
function applyIndex(column, spec) {
    if (hasIndexTrue(spec)) {
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
    let column;

    if (isTextWithFieldtype(columnSpec)) {
        column = tableBuilder.text(columnName, columnSpec.fieldtype);
    } else if (isString(columnSpec)) {
        if (isStringWithMaxlength(columnSpec)) {
            column = tableBuilder.string(columnName, columnSpec.maxlength);
        } else {
            column = tableBuilder.string(columnName, 191);
        }
    } else {
        column = tableBuilder[columnSpec.type](columnName);
    }

    applyNullable(column, columnSpec);
    applyPrimary(column, columnSpec);
    applyUnique(column, columnSpec);
    applyUnsigned(column, columnSpec);
    applyReferences(column, columnSpec);
    applyConstraintName(column, columnSpec);
    applyOnDelete(column, columnSpec);
    applyDefault(column, columnSpec);
    applyIndex(column, columnSpec);
}

/* Misc helpers ----------------------------------------------------------- */

/**
 * @param {string} sql
 * @param {object} options
 * @returns {string}
 */
function augmentSqlForMySQL(sql, options) {
    let cleaned = sql.replace(/;\s*$/, '');
    if (options?.algorithm !== 'auto') {
        const algorithm = options?.algorithm || 'copy';
        cleaned += `, algorithm=${algorithm}`;
    }
    return cleaned;
}

/**
 * @param {import('knex').Knex} transaction
 * @returns {Promise<boolean>}
 */
async function maybeDisableForeignKeysIfSQLite(transaction) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const result = await db.knex.raw('PRAGMA foreign_keys;');
        if (result[0].foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = OFF;');
            return true;
        }
    }
    return false;
}

/**
 * @param {import('knex').Knex} transaction
 * @param {boolean} wasDisabled
 * @returns {Promise<void>}
 */
async function maybeReenableForeignKeysIfSQLite(transaction, wasDisabled) {
    if (wasDisabled && DatabaseInfo.isSQLite(transaction)) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    }
}

/**
 * @param {object} table
 * @param {string} fromColumn
 * @param {string} toTable
 * @param {string} toColumn
 * @param {object} opts
 */
function buildForeignKey(table, fromColumn, toTable, toColumn, opts) {
    let builder;
    if (opts.cascadeDelete) {
        builder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`).onDelete('CASCADE');
    } else if (opts.setNullDelete) {
        builder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`).onDelete('SET NULL');
    } else {
        builder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
    }
    if (opts.constraintName) {
        builder.withKeyName(opts.constraintName);
    }
}

/* Public API ------------------------------------------------------------- */

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, table => {
        table.setNullable(column);
    });
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, table => {
        table.dropNullable(column);
    });
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} columnSpec
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm]
 */
async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const builder = transaction.schema.table(tableName, table => {
        addTableColumn(tableName, table, column, columnSpec);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    for (const sqlQuery of builder.toSQL()) {
        let sql = sqlQuery.sql;
        if (DatabaseInfo.isMySQL(transaction)) {
            sql = augmentSqlForMySQL(sql, options);
        }
        await transaction.raw(sql);
    }
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 * @param {object} [columnSpec]
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm]
 */
async function dropColumn(tableName, column, transaction = db.knex, columnSpec = {}, options = {}) {
    if (hasReferences(columnSpec)) {
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

    const builder = transaction.schema.table(tableName, table => {
        table.dropColumn(column);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await builder;
        return;
    }

    for (const sqlQuery of builder.toSQL()) {
        let sql = sqlQuery.sql;
        if (DatabaseInfo.isMySQL(transaction)) {
            sql = augmentSqlForMySQL(sql, options);
        }
        await transaction.raw(sql);
    }
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
        return await transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return await transaction.schema.table(tableName, table => {
        table.renameColumn(from, to);
    });
}

/**
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.index(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME') {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
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
async function dropIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.dropIndex(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
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
async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.unique(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME') {
            logging.warn(`Constraint for '${columns}' already exists for table '${tableName}'`);
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
async function dropUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.dropUnique(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
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
        const disabled = await maybeDisableForeignKeysIfSQLite(transaction);

        await transaction.schema.table(fromTable, table => {
            buildForeignKey(table, fromColumn, toTable, toColumn, {
                cascadeDelete,
                setNullDelete,
                constraintName
            });
        });

        await maybeReenableForeignKeysIfSQLite(transaction, disabled);
    } catch (err) {
        if (['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'].includes(err.code)) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
    }
}

/**
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
        const disabled = await maybeDisableForeignKeysIfSQLite(transaction);

        await transaction.schema.table(fromTable, table => {
            table.dropForeign(fromColumn, constraintName);
        });

        await maybeReenableForeignKeysIfSQLite(transaction, disabled);
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

/**
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasPrimaryKeySQLiteError)});
    }

    const raw = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return raw.find(c => c.origin === 'pk');
}

/**
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
        return await transaction.schema.table(tableName, table => {
            table.primary(columns);
        });
    } catch (err) {
        if (err.code === 'ER_MULTIPLE_PRI_KEY') {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * @param {String} table
 * @param {import('knex').Knex} [transaction]
 * @param {Object} [tableSpec]
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, t => {
        Object.keys(tableSpec)
            .filter(col => !col.startsWith('@@'))
            .forEach(col => addTableColumn(table, t, col, tableSpec[col]));

        if (tableSpec['@@INDEXES@@']) {
            tableSpec['@@INDEXES@@'].forEach(idx => t.index(idx));
        }
        if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
            tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(uniq => t.unique(uniq));
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

/**
 * @param {import('knex').Knex} [transaction]
 */
async function getTables(transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const resp = await transaction.raw('select * from sqlite_master where type = "table"');
        return _.reject(_.map(resp, 'tbl_name'), name => name === 'sqlite_sequence');
    }

    if (client === 'mysql2') {
        const resp = await transaction.raw('show tables');
        return _.flatten(_.map(resp[0], entry => _.values(entry)));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getIndexes(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const resp = await transaction.raw(`pragma index_list("${table}")`);
        return _.flatten(_.map(resp, 'name'));
    }

    if (client === 'mysql2') {
        const resp = await transaction.raw(`SHOW INDEXES from ${table}`);
        return _.flatten(_.map(resp[0], 'Key_name'));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getColumns(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const resp = await transaction.raw(`pragma table_info("${table}")`);
        return _.flatten(_.map(resp, 'name'));
    }

    if (client === 'mysql2') {
        const resp = await transaction.raw(`SHOW COLUMNS from ${table}`);
        return _.flatten(_.map(resp[0], 'Field'));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

/**
 * @param {...object} migrations
 * @returns {function(import('knex').Knex): Promise<void>}
 */
function createColumnMigration(...migrations) {
    async function runColumnMigration(conn, migration) {
        const {
            table,
            column,
            dbIsInCorrectState,
            operation,
            operationVerb,
            columnDefinition,
            options
        } = migration;

        const hasColumn = await conn.schema.hasColumn(table, column);
        const correct = dbIsInCorrectState(hasColumn);

        if (correct) {
            logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
            return;
        }

        logging.info(`${operationVerb} ${table}.${column} column`);
        await operation(table, column, conn, columnDefinition, options);
    }

    return async function columnMigration(conn) {
        for (const migration of migrations) {
            await runColumnMigration(conn, migration);
        }
    };
}

/* Export ----------------------------------------------------------------- */

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
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};
```