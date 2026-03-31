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

const CONSTRAINT_ERROR_CODES = {
    SQLITE_ERROR: 'SQLITE_ERROR',
    ER_DUP_KEYNAME: 'ER_DUP_KEYNAME',
    ER_CANT_DROP_FIELD_OR_KEY: 'ER_CANT_DROP_FIELD_OR_KEY',
    ER_DUP_KEY: 'ER_DUP_KEY',
    ER_FK_DUP_KEY: 'ER_FK_DUP_KEY',
    ER_FK_DUP_NAME: 'ER_FK_DUP_NAME',
    ER_MULTIPLE_PRI_KEY: 'ER_MULTIPLE_PRI_KEY'
};

const DEFAULT_STRING_LENGTH = 191;

/**
 * Helper to check if object has property
 */
function hasProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
}

/**
 * Apply column type and length
 */
function applyColumnType(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasProperty(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        const length = hasProperty(columnSpec, 'maxlength') ? columnSpec.maxlength : DEFAULT_STRING_LENGTH;
        return tableBuilder[columnSpec.type](columnName, length);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Apply column modifiers (nullable, primary, unique, etc.)
 */
function applyColumnModifiers(column, columnSpec) {
    const isNullable = hasProperty(columnSpec, 'nullable') && columnSpec.nullable === true;
    column.nullable(isNullable);

    if (hasProperty(columnSpec, 'primary') && columnSpec.primary === true) {
        column.primary();
    }
    if (hasProperty(columnSpec, 'unique') && columnSpec.unique) {
        column.unique();
    }
    if (hasProperty(columnSpec, 'unsigned') && columnSpec.unsigned) {
        column.unsigned();
    }
    if (hasProperty(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }
    if (hasProperty(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }

    applyColumnDeleteBehavior(column, columnSpec);

    if (hasProperty(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
    if (hasProperty(columnSpec, 'index') && columnSpec.index === true) {
        column.index();
    }
}

/**
 * Apply delete behavior (CASCADE, SET NULL)
 */
function applyColumnDeleteBehavior(column, columnSpec) {
    if (hasProperty(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (hasProperty(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true) {
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
    const column = applyColumnType(tableBuilder, columnName, columnSpec);
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
 * Apply MySQL algorithm option to SQL
 */
function applyMySQLAlgorithm(sql, options = {}) {
    sql = sql.replace(/;\s*$/, '');
    if (options?.algorithm !== 'auto') {
        const algorithm = options?.algorithm || 'copy';
        sql += `, algorithm=${algorithm}`;
    }
    return sql;
}

/**
 * Execute column operation with database-specific handling
 */
async function executeColumnOperation(tableName, column, transaction, columnSpec, options, builderFn) {
    const builder = transaction.schema.table(tableName, builderFn);

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
    return executeColumnOperation(
        tableName,
        column,
        transaction,
        columnSpec,
        options,
        table => addTableColumn(tableName, table, column, columnSpec)
    );
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
    if (hasProperty(columnSpec, 'references')) {
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

    return executeColumnOperation(
        tableName,
        column,
        transaction,
        columnSpec,
        options,
        table => table.dropColumn(column)
    );
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

/**
 * Handle constraint operation errors
 */
function handleConstraintError(err, operation, columns, tableName, ignoreCodes) {
    if (ignoreCodes.includes(err.code)) {
        logging.warn(`${operation} for '${columns}' ${err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY' ? 'does not exist' : 'already exists'} for table '${tableName}'`);
        return;
    }
    throw err;
}

/**
 * Adds a non-unique index to a table over the given columns.
 *
 * @param {string} tableName - name of the table to add indexes to
 * @param {string|string[]} columns - column(s) to add indexes for
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);
        return transaction.schema.table(tableName, table => table.index(columns));
    } catch (err) {
        handleConstraintError(err, 'Index', columns, tableName, [
            CONSTRAINT_ERROR_CODES.SQLITE_ERROR,
            CONSTRAINT_ERROR_CODES.ER_DUP_KEYNAME
        ]);
    }
}

/**
 * Drops a non-unique index from a table over the given columns.
 *
 * @param {string} tableName - name of the table to remove indexes from
 * @param {string|string[]} columns - column(s) to remove indexes for
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping index for '${columns}' in table '${tableName}'`);
        return transaction.schema.table(tableName, table => table.dropIndex(columns));
    } catch (err) {
        handleConstraintError(err, 'Constraint', columns, tableName, [
            CONSTRAINT_ERROR_CODES.SQLITE_ERROR,
            CONSTRAINT_ERROR_CODES.ER_CANT_DROP_FIELD_OR_KEY
        ]);
    }
}

/**
 * Adds a unique index to a table over the given columns.
 *
 * @param {string} tableName - name of the table to add unique constraint to
 * @param {string|string[]} columns - column(s) to form unique constraint with
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
        return transaction.schema.table(tableName, table => table.unique(columns));
    } catch (err) {
        handleConstraintError(err, 'Constraint', columns, tableName, [
            CONSTRAINT_ERROR_CODES.SQLITE_ERROR,
            CONSTRAINT_ERROR_CODES.ER_DUP_KEYNAME
        ]);
    }
}

/**
 * Drops a unique key constraint from a table.
 *
 * @param {string} tableName - name of the table to drop unique constraint from
 * @param {string|string[]} columns - column(s) unique constraint was formed
 * @param {import('knex').Knex} transaction - connection object containing knex reference
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);
        return transaction.schema.table(tableName, table => table.dropUnique(columns));
    } catch (err) {
        handleConstraintError(err, 'Constraint', columns, tableName, [
            CONSTRAINT_ERROR_CODES.SQLITE_ERROR,
            CONSTRAINT_ERROR_CODES.ER_CANT_DROP_FIELD_OR_KEY
        ]);
    }
}

/**
 * Manage SQLite foreign key state
 */
async function manageSQLiteForeignKeys(transaction, enable) {
    const result = await db.knex.raw('PRAGMA foreign_keys;');
    if (result[0].foreign_keys) {
        const state = enable ? 'ON' : 'OFF';
        await db.knex.raw(`PRAGMA foreign_keys = ${state};`);
    }
    return result[0].foreign_keys;
}

/**
 * Checks if a foreign key exists in a table over the given columns.
 *
 * @param {Object} configuration - contains all configuration for this function
 * @param {string} configuration.fromTable - name of the table to add the foreign key to
 * @param {string} configuration.fromColumn - column of the table to add the foreign key to
 * @param {string} configuration.toTable - name of the table to point the foreign key to
 * @param {string} configuration.toColumn - column of the table to point the foreign key to
 * @param {import('knex').Knex} [configuration.transaction] - connection object containing knex reference
 */
async function hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction = db.knex}) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasForeignSQLite3)
        });
    }

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return foreignKeys.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

/**
 * Build foreign key constraint
 */
function buildForeignKeyConstraint(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete, constraintName) {
    let fkBuilder;

    if (cascadeDelete) {
        fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`).onDelete('CASCADE');
    } else if (setNullDelete) {
        fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`).onDelete('SET NULL');
    } else {
        fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
    }

    if (constraintName) {
        fkBuilder.withKeyName(constraintName);
    }

    return fkBuilder;
}

/**
 * Adds a foreign key to a table.
 *
 * @param {Object} configuration - contains all configuration for this function
 * @param {string} configuration.fromTable - name of the table to add the foreign key to
 * @param {string} configuration.fromColumn - column of the table to add the foreign key to
 * @param {string} configuration.toTable - name of the table to point the foreign key to
 * @param {string} configuration.toColumn - column of the table to point the foreign key to
 * @param {string} [configuration.constraintName] - name of the FK to create
 * @param {Boolean} [configuration.cascadeDelete] - adds the "on delete cascade" option if true
 * @param {Boolean} [configuration.setNullDelete] - adds the "on delete SET NULL" option if true
 * @param {import('knex').Knex} [configuration.transaction] - connection object containing knex reference
 */
async function addForeign({fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete = false, setNullDelete = false, transaction = db.knex