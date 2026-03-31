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

const ERROR_CODES = {
    SQLITE_ERROR: 'SQLITE_ERROR',
    ER_DUP_KEYNAME: 'ER_DUP_KEYNAME',
    ER_CANT_DROP_FIELD_OR_KEY: 'ER_CANT_DROP_FIELD_OR_KEY',
    ER_DUP_KEY: 'ER_DUP_KEY',
    ER_FK_DUP_KEY: 'ER_FK_DUP_KEY',
    ER_FK_DUP_NAME: 'ER_FK_DUP_NAME',
    ER_MULTIPLE_PRI_KEY: 'ER_MULTIPLE_PRI_KEY'
};

const CONSTRAINT_ERROR_CODES = {
    EXISTS: [ERROR_CODES.SQLITE_ERROR, ERROR_CODES.ER_DUP_KEYNAME],
    NOT_EXISTS: [ERROR_CODES.SQLITE_ERROR, ERROR_CODES.ER_CANT_DROP_FIELD_OR_KEY],
    FK_EXISTS: [ERROR_CODES.ER_DUP_KEY, ERROR_CODES.ER_FK_DUP_KEY, ERROR_CODES.ER_FK_DUP_NAME]
};

// Column specification helpers
const columnSpecHelpers = {
    hasProperty: (spec, prop) => Object.prototype.hasOwnProperty.call(spec, prop),
    
    getColumnType: (spec, columnName, tableBuilder) => {
        if (spec.type === 'text' && columnSpecHelpers.hasProperty(spec, 'fieldtype')) {
            return tableBuilder[spec.type](columnName, spec.fieldtype);
        }
        if (spec.type === 'string') {
            const maxlength = columnSpecHelpers.hasProperty(spec, 'maxlength') ? spec.maxlength : 191;
            return tableBuilder[spec.type](columnName, maxlength);
        }
        return tableBuilder[spec.type](columnName);
    },

    applyNullability: (column, spec) => {
        const isNullable = columnSpecHelpers.hasProperty(spec, 'nullable') && spec.nullable === true;
        column.nullable(isNullable);
    },

    applyConstraints: (column, spec) => {
        if (columnSpecHelpers.hasProperty(spec, 'primary') && spec.primary === true) {
            column.primary();
        }
        if (columnSpecHelpers.hasProperty(spec, 'unique') && spec.unique) {
            column.unique();
        }
        if (columnSpecHelpers.hasProperty(spec, 'unsigned') && spec.unsigned) {
            column.unsigned();
        }
    },

    applyReferences: (column, spec) => {
        if (columnSpecHelpers.hasProperty(spec, 'references')) {
            column.references(spec.references);
        }
        if (columnSpecHelpers.hasProperty(spec, 'constraintName')) {
            column.withKeyName(spec.constraintName);
        }
    },

    applyDeleteBehavior: (column, spec) => {
        if (columnSpecHelpers.hasProperty(spec, 'cascadeDelete') && spec.cascadeDelete === true) {
            column.onDelete('CASCADE');
        } else if (columnSpecHelpers.hasProperty(spec, 'setNullDelete') && spec.setNullDelete === true) {
            column.onDelete('SET NULL');
        }
    },

    applyDefaults: (column, spec) => {
        if (columnSpecHelpers.hasProperty(spec, 'defaultTo')) {
            column.defaultTo(spec.defaultTo);
        }
        if (columnSpecHelpers.hasProperty(spec, 'index') && spec.index === true) {
            column.index();
        }
    }
};

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = columnSpecHelpers.getColumnType(columnSpec, columnName, tableBuilder);
    
    columnSpecHelpers.applyNullability(column, columnSpec);
    columnSpecHelpers.applyConstraints(column, columnSpec);
    columnSpecHelpers.applyReferences(column, columnSpec);
    columnSpecHelpers.applyDeleteBehavior(column, columnSpec);
    columnSpecHelpers.applyDefaults(column, columnSpec);
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
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex.Transaction} [transaction]
 * @param {object} columnSpec
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const addColumnBuilder = transaction.schema.table(tableName, table => {
        addTableColumn(tableName, table, column, columnSpec);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await addColumnBuilder;
        return;
    }

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
 * @param {import('knex').Knex} [transaction]
 * @param {object} [columnSpec]
 * @param {object} [options]
 * @param {'inplace'|'copy'|'auto'} [options.algorithm] - MySQL only
 */
async function dropColumn(tableName, column, transaction = db.knex, columnSpec = {}, options = {}) {
    if (columnSpecHelpers.hasProperty(columnSpec, 'references')) {
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

    const dropColumnBuilder = transaction.schema.table(tableName, table => table.dropColumn(column));

    if (DatabaseInfo.isSQLite(transaction)) {
        await dropColumnBuilder;
        return;
    }

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
        return await transaction.schema.table(tableName, table => table.index(columns));
    } catch (err) {
        if (CONSTRAINT_ERROR_CODES.EXISTS.includes(err.code)) {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
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
        return await transaction.schema.table(tableName, table => table.dropIndex(columns));
    } catch (err) {
        if (CONSTRAINT_ERROR_CODES.NOT_EXISTS.includes(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
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
        return await transaction.schema.table(tableName, table => table.unique(columns));
    } catch (err) {
        if (CONSTRAINT_ERROR_CODES.EXISTS.includes(err.code)) {
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
        return await transaction.schema.table(tableName, table => table.dropUnique(columns));
    } catch (err) {
        if (CONSTRAINT_ERROR_CODES.NOT_EXISTS.includes(err.code)) {
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
    return foreignKeys.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

/**
 * Manages SQLite foreign key pragma state
 */
const sqliteForeignKeyManager = {
    async getState(transaction) {
        const result = await transaction.raw('PRAGMA foreign_keys;');
        return result[0].foreign_keys;
    },

    async setState(transaction, enabled) {
        const state = enabled ? 'ON' : 'OFF';
        await transaction.raw(`PRAGMA foreign_keys = ${state};`);
    },

    async withDisabled(transaction, callback) {
        const wasEnabled = await this.getState(transaction);
        if (wasEnabled) {
            await this.setState(transaction, false);
        }
        try {
            await callback();
        } finally {
            if (wasEnabled) {
                await this.setState(transaction, true);
            }
        }
    }
};

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
async function addForeign({fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete = false, setNullDelete = false, transaction = db.knex}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const foreignKeyExists = await hasForeign