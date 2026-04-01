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

/**
 * Applies column type configuration to the column builder
 * @param {object} column - knex column builder
 * @param {object} columnSpec - column specification
 */
function applyColumnType(column, columnSpec) {
    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        return columnSpec.fieldtype;
    }
    if (columnSpec.type === 'string' && Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength')) {
        return columnSpec.maxlength;
    }
    if (columnSpec.type === 'string') {
        return 191;
    }
    return null;
}

/**
 * Creates the base column with appropriate type and parameters
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {object} column builder
 */
function createBaseColumn(tableBuilder, columnName, columnSpec) {
    const typeParam = applyColumnType(null, columnSpec);
    if (typeParam !== null) {
        return tableBuilder[columnSpec.type](columnName, typeParam);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies nullable constraint to column
 * @param {object} column - knex column builder
 * @param {object} columnSpec - column specification
 */
function applyNullableConstraint(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }
}

/**
 * Applies key constraints to column (primary, unique, unsigned)
 * @param {object} column - knex column builder
 * @param {object} columnSpec - column specification
 */
function applyKeyConstraints(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true) {
        column.primary();
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique) {
        column.unique();
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned) {
        column.unsigned();
    }
}

/**
 * Applies foreign key reference to column
 * @param {object} column - knex column builder
 * @param {object} columnSpec - column specification
 */
function applyForeignKeyReference(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * Applies delete behavior to column
 * @param {object} column - knex column builder
 * @param {object} columnSpec - column specification
 */
function applyDeleteBehavior(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies default value and index to column
 * @param {object} column - knex column builder
 * @param {object} columnSpec - column specification
 */
function applyDefaultAndIndex(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true) {
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
    const column = createBaseColumn(tableBuilder, columnName, columnSpec);
    
    applyNullableConstraint(column, columnSpec);
    applyKeyConstraints(column, columnSpec);
    applyForeignKeyReference(column, columnSpec);
    applyDeleteBehavior(column, columnSpec);
    applyDefaultAndIndex(column, columnSpec);
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, function (table) {
        table.setNullable(column);
    });
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, function (table) {
        table.dropNullable(column);
    });
}

/**
 * Executes raw SQL queries for column addition
 * @param {import('knex').Knex.Transaction} transaction
 * @param {object} addColumnBuilder - knex schema builder
 * @param {object} options - algorithm options
 */
async function executeAddColumnQueries(transaction, addColumnBuilder, options = {}) {
    for (const sqlQuery of addColumnBuilder.toSQL()) {
        let sql = sqlQuery.sql;

        if (DatabaseInfo.isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (options?.algorithm !== 'auto') {
                const algorithm = options?.algorithm || 'copy';
                sql += `, algorithm=${algorithm}`;
            }
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
    const addColumnBuilder = transaction.schema.table(tableName, function (table) {
        addTableColumn(tableName, table, column, columnSpec);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await addColumnBuilder;
        return;
    }

    await executeAddColumnQueries(transaction, addColumnBuilder, options);
}

/**
 * Executes raw SQL queries for column dropping
 * @param {import('knex').Knex.Transaction} transaction
 * @param {object} dropColumnBuilder - knex schema builder
 * @param {object} options - algorithm options
 */
async function executeDropColumnQueries(transaction, dropColumnBuilder, options = {}) {
    for (const sqlQuery of dropColumnBuilder.toSQL()) {
        let sql = sqlQuery.sql;

        if (DatabaseInfo.isMySQL(transaction)) {
            sql = sql.replace(/;\s*$/, '');
            if (options?.algorithm !== 'auto') {
                const algorithm = options?.algorithm || 'copy';
                sql += `, algorithm=${algorithm}`;
            }
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
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function dropColumn(tableName, column, transaction = db.knex, columnSpec = {}, options = {}) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        const [toTable, toColumn] = columnSpec.references.split('.');
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }

    const dropColumnBuilder = transaction.schema.table(tableName, function (table) {
        table.dropColumn(column);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await dropColumnBuilder;
        return;
    }

    await executeDropColumnQueries(transaction, dropColumnBuilder, options);
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

    return await transaction.schema.table(tableName, function (table) {
        table.renameColumn(from, to);
    });
}

/**
 * Handles duplicate index errors
 * @param {Error} err - error object
 * @param {string} columns - column name(s)
 * @param {string} tableName - table name
 * @returns {boolean} true if error was handled
 */
function handleDuplicateIndexError(err, columns, tableName) {
    if (err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME') {
        logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
        return true;
    }
    return false;
}

/**
 * Adds an non-unique index to a table over the given columns.
 *
 * @param {string} tableName - name of the table to add indexes to
 * @param {string|string[]} columns - column(s) to add indexes for
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);

        return await transaction.schema.table(tableName, function (table) {
            table.index(columns);
        });
    } catch (err) {
        if (handleDuplicateIndexError(err, columns, tableName)) {
            return;
        }
        throw err;
    }
}

/**
 * Handles missing index errors
 * @param {Error} err - error object
 * @param {string} columns - column name(s)
 * @param {string} tableName - table name
 * @returns {boolean} true if error was handled
 */
function handleMissingIndexError(err, columns, tableName) {
    if (err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
        logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
        return true;
    }
    return false;
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

        return await transaction.schema.table(tableName, function (table) {
            table.dropIndex(columns);
        });
    } catch (err) {
        if (handleMissingIndexError(err, columns, tableName)) {
            return;
        }
        throw err;
    }
}

/**
 * Adds an unique index to a table over the given columns.
 *
 * @param {string} tableName - name of the table to add unique constraint to
 * @param {string|string[]} columns - column(s) to form unique constraint with
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);

        return await transaction.schema.table(tableName, function (table) {
            table.unique(columns);
        });
    } catch (err) {
        if (handleDuplicateIndexError(err, columns, tableName)) {
            return;
        }
        throw err;
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

        return await transaction.schema.table(tableName, function (table) {
            table.dropUnique(columns);
        });
    } catch (err) {
        if (handleMissingIndexError(err, columns, tableName)) {
            return;
        }
        throw err;
    }
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

    const hasForeignKey = foreignKeys.some(foreignKey => foreign