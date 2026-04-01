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
 * Checks if columnSpec has a fieldtype property
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasFieldType(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype');
}

/**
 * Checks if columnSpec has a maxlength property
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasMaxLength(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength');
}

/**
 * Checks if columnSpec has a nullable property set to true
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isNullable(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true;
}

/**
 * Checks if columnSpec has a primary property set to true
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isPrimary(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true;
}

/**
 * Checks if columnSpec has a unique property
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnique(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique;
}

/**
 * Checks if columnSpec has an unsigned property
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnsigned(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned;
}

/**
 * Checks if columnSpec has a references property
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasReferences(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'references');
}

/**
 * Checks if columnSpec has a constraintName property
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasConstraintName(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName');
}

/**
 * Checks if columnSpec has cascadeDelete property set to true
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasCascadeDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true;
}

/**
 * Checks if columnSpec has setNullDelete property set to true
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasSetNullDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true;
}

/**
 * Checks if columnSpec has a defaultTo property
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasDefaultTo(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo');
}

/**
 * Checks if columnSpec has an index property set to true
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasIndex(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true;
}

/**
 * Creates a column with appropriate type and parameters
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').knex.ColumnBuilder}
 */
function createColumn(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasFieldType(columnSpec)) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        const maxLength = hasMaxLength(columnSpec) ? columnSpec.maxlength : 191;
        return tableBuilder[columnSpec.type](columnName, maxLength);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies nullable constraint to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyNullableConstraint(column, columnSpec) {
    if (isNullable(columnSpec)) {
        column.nullable();
    } else {
        column.nullable(false);
    }
}

/**
 * Applies primary key constraint to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyPrimaryConstraint(column, columnSpec) {
    if (isPrimary(columnSpec)) {
        column.primary();
    }
}

/**
 * Applies unique constraint to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyUniqueConstraint(column, columnSpec) {
    if (isUnique(columnSpec)) {
        column.unique();
    }
}

/**
 * Applies unsigned constraint to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyUnsignedConstraint(column, columnSpec) {
    if (isUnsigned(columnSpec)) {
        column.unsigned();
    }
}

/**
 * Applies foreign key reference to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyReferencesConstraint(column, columnSpec) {
    if (hasReferences(columnSpec)) {
        column.references(columnSpec.references);
    }
}

/**
 * Applies constraint name to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyConstraintName(column, columnSpec) {
    if (hasConstraintName(columnSpec)) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * Applies delete behavior to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyDeleteBehavior(column, columnSpec) {
    if (hasCascadeDelete(columnSpec)) {
        column.onDelete('CASCADE');
    } else if (hasSetNullDelete(columnSpec)) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies default value to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyDefaultValue(column, columnSpec) {
    if (hasDefaultTo(columnSpec)) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

/**
 * Applies index to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyIndexConstraint(column, columnSpec) {
    if (hasIndex(columnSpec)) {
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
    const column = createColumn(tableBuilder, columnName, columnSpec);
    
    applyNullableConstraint(column, columnSpec);
    applyPrimaryConstraint(column, columnSpec);
    applyUniqueConstraint(column, columnSpec);
    applyUnsignedConstraint(column, columnSpec);
    applyReferencesConstraint(column, columnSpec);
    applyConstraintName(column, columnSpec);
    applyDeleteBehavior(column, columnSpec);
    applyDefaultValue(column, columnSpec);
    applyIndexConstraint(column, columnSpec);
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
 * Applies MySQL-specific SQL modifications
 * @param {string} sql
 * @param {object} options
 * @returns {string}
 */
function applyMySQLAlgorithm(sql, options) {
    let modifiedSql = sql.replace(/;\s*$/, '');
    if (options?.algorithm !== 'auto') {
        const algorithm = options?.algorithm || 'copy';
        modifiedSql += `, algorithm=${algorithm}`;
    }
    return modifiedSql;
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

    for (const sqlQuery of addColumnBuilder.toSQL()) {
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
 * @param {import('knex').Knex} [transaction]
 * @param {object} [columnSpec]
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function dropColumn(tableName, column, transaction = db.knex, columnSpec = {}, options = {}) {
    if (hasReferences(columnSpec)) {
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

    for (const sqlQuery of dropColumnBuilder.toSQL()) {
        let sql = sqlQuery.sql;

        if (DatabaseInfo.isMySQL(transaction)) {
            sql = applyMySQLAlgorithm(sql, options);
        }

        await transaction.raw(sql);
    }
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
 * Checks if error indicates index already exists
 * @param {object} err
 * @returns {boolean}
 */
function isIndexAlreadyExistsError(err) {
    return err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME';
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
        if (isIndexAlreadyExistsError(err)) {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if error indicates constraint does not exist
 * @param {object} err
 * @returns {boolean}
 */
function isConstraintDoesNotExistError(err) {
    return err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY';
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
        if (isConstraintDoesNotExistError(err)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if error indicates unique constraint already exists
 * @param {object} err
 * @returns {boolean}
 */
function isUniqueConstraint