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
 * @param {object} columnSpec
 * @param {string} columnName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 */
function createColumnType(columnSpec, columnName, tableBuilder) {
    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        const maxlength = Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength') ? columnSpec.maxlength : 191;
        return tableBuilder[columnSpec.type](columnName, maxlength);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyColumnConstraints(column, columnSpec) {
    const constraints = [
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true,
            apply: () => column.nullable()
        },
        {
            check: () => !Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') || columnSpec.nullable !== true,
            apply: () => column.nullable(false)
        },
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true,
            apply: () => column.primary()
        },
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique,
            apply: () => column.unique()
        },
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned,
            apply: () => column.unsigned()
        },
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'references'),
            apply: () => column.references(columnSpec.references)
        },
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName'),
            apply: () => column.withKeyName(columnSpec.constraintName)
        },
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true,
            apply: () => column.onDelete('CASCADE')
        },
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true,
            apply: () => column.onDelete('SET NULL')
        },
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo'),
            apply: () => column.defaultTo(columnSpec.defaultTo)
        },
        {
            check: () => Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true,
            apply: () => column.index()
        }
    ];

    constraints.forEach(constraint => {
        if (constraint.check()) {
            constraint.apply();
        }
    });
}

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = createColumnType(columnSpec, columnName, tableBuilder);
    applyColumnConstraints(column, columnSpec);
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
 * @param {string} sql
 * @param {object} options
 * @param {import('knex').Knex} transaction
 */
function applySQLOptions(sql, options, transaction) {
    if (!DatabaseInfo.isMySQL(transaction)) {
        return sql;
    }
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
        const sql = applySQLOptions(sqlQuery.sql, options, transaction);
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

    for (const sqlQuery of dropColumnBuilder.toSQL()) {
        const sql = applySQLOptions(sqlQuery.sql, options, transaction);
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
 * @param {string} errorCode
 */
function isIndexAlreadyExistsError(errorCode) {
    return errorCode === 'SQLITE_ERROR' || errorCode === 'ER_DUP_KEYNAME';
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
        if (isIndexAlreadyExistsError(err.code)) {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * @param {string} errorCode
 */
function isIndexDoesNotExistError(errorCode) {
    return errorCode === 'SQLITE_ERROR' || errorCode === 'ER_CANT_DROP_FIELD_OR_KEY';
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
        if (isIndexDoesNotExistError(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
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
        if (isIndexAlreadyExistsError(err.code)) {
            logging.warn(`Constraint for '${columns}' already exists for table '${tableName}'`);
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
        if (isIndexDoesNotExistError(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
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

    const hasForeignKey = foreignKeys.some(foreignKey => foreignKey.table === toTable && foreignKey.from === fromColumn && foreignKey.to === toColumn);

    return hasForeignKey;
}

/**
 * @param {import('knex').Knex} transaction
 */
async function getForeignKeysState(transaction) {
    const foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
    return foreignKeysEnabled[0].foreign_keys;
}

/**
 * @param {import('knex').Knex} transaction
 * @param {boolean} enabled
 */
async function setForeignKeysState(transaction, enabled) {
    const state = enabled ? 'ON' : 'OFF';
    await db.knex.raw(`PRAGMA foreign_keys = ${state};`);
}

/**
 * @param {string} fromTable
 * @param {string} fromColumn
 * @param {string} toTable
 * @param {string} toColumn
 * @param {import('knex').Knex} transaction
 * @param {boolean} cascadeDelete
 * @param {boolean} setNullDelete
 * @param {string} constraintName
 */
async function createForeignKeyBuilder(fromTable, fromColumn, toTable, toColumn, transaction, cascadeDelete, setNullDelete, constraintName) {
    await transaction.schema.table(fromTable, function (table) {
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
    });
}

/**
 * Adds a foreign key to a table.
 *
 * @param {Object} configuration - contains all configuration for this function
 * @param {string} configuration.fromTable - name of the table to add the foreign key to
 * @param {string} configuration.