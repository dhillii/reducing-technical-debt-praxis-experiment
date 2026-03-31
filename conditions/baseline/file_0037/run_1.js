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

/**
 * Check if property exists and has a truthy value
 */
function hasProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
}

/**
 * Apply column modifiers based on column specification
 */
function applyColumnModifiers(column, columnSpec) {
    const modifiers = [
        {
            condition: () => hasProperty(columnSpec, 'nullable') && columnSpec.nullable === true,
            apply: () => column.nullable()
        },
        {
            condition: () => !hasProperty(columnSpec, 'nullable') || columnSpec.nullable !== true,
            apply: () => column.nullable(false)
        },
        {
            condition: () => hasProperty(columnSpec, 'primary') && columnSpec.primary === true,
            apply: () => column.primary()
        },
        {
            condition: () => hasProperty(columnSpec, 'unique') && columnSpec.unique,
            apply: () => column.unique()
        },
        {
            condition: () => hasProperty(columnSpec, 'unsigned') && columnSpec.unsigned,
            apply: () => column.unsigned()
        },
        {
            condition: () => hasProperty(columnSpec, 'references'),
            apply: () => column.references(columnSpec.references)
        },
        {
            condition: () => hasProperty(columnSpec, 'constraintName'),
            apply: () => column.withKeyName(columnSpec.constraintName)
        },
        {
            condition: () => hasProperty(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true,
            apply: () => column.onDelete('CASCADE')
        },
        {
            condition: () => hasProperty(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true,
            apply: () => column.onDelete('SET NULL')
        },
        {
            condition: () => hasProperty(columnSpec, 'defaultTo'),
            apply: () => column.defaultTo(columnSpec.defaultTo)
        },
        {
            condition: () => hasProperty(columnSpec, 'index') && columnSpec.index === true,
            apply: () => column.index()
        }
    ];

    modifiers.forEach(({condition, apply}) => {
        if (condition()) {
            apply();
        }
    });
}

/**
 * Create column based on type and specification
 */
function createColumn(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && hasProperty(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        const maxlength = hasProperty(columnSpec, 'maxlength') ? columnSpec.maxlength : 191;
        return tableBuilder[columnSpec.type](columnName, maxlength);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = createColumn(tableBuilder, columnName, columnSpec);
    applyColumnModifiers(column, columnSpec);
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, (table) => {
        table.setNullable(column);
    });
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
 */
function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, (table) => {
        table.dropNullable(column);
    });
}

/**
 * Apply MySQL algorithm option to SQL query
 */
function applyMySQLAlgorithm(sql, options = {}) {
    let modifiedSql = sql.replace(/;\s*$/, '');
    if (options?.algorithm !== 'auto') {
        const algorithm = options?.algorithm || 'copy';
        modifiedSql += `, algorithm=${algorithm}`;
    }
    return modifiedSql;
}

/**
 * Execute schema modification with database-specific handling
 */
async function executeSchemaModification(tableName, builderFn, transaction = db.knex, options = {}) {
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
    await executeSchemaModification(
        tableName,
        (table) => addTableColumn(tableName, table, column, columnSpec),
        transaction,
        options
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

    await executeSchemaModification(
        tableName,
        (table) => table.dropColumn(column),
        transaction,
        options
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
        return await transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return await transaction.schema.table(tableName, (table) => {
        table.renameColumn(from, to);
    });
}

/**
 * Handle constraint operation with error handling
 */
async function handleConstraintOperation(operationName, operationFn, errorCodes) {
    try {
        logging.info(operationName);
        return await operationFn();
    } catch (err) {
        if (errorCodes.includes(err.code)) {
            logging.warn(operationName.replace('Adding', 'Skipped adding').replace('Dropping', 'Skipped dropping'));
            return;
        }
        throw err;
    }
}

/**
 * Adds a non-unique index to a table over the given columns.
 *
 * @param {string} tableName - name of the table to add indexes to
 * @param {string|string[]} columns - column(s) to add indexes for
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    return handleConstraintOperation(
        `Adding index for '${columns}' in table '${tableName}'`,
        () => transaction.schema.table(tableName, (table) => table.index(columns)),
        CONSTRAINT_ERROR_CODES.EXISTS
    );
}

/**
 * Drops a non-unique index from a table over the given columns.
 *
 * @param {string} tableName - name of the table to remove indexes from
 * @param {string|string[]} columns - column(s) to remove indexes for
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    return handleConstraintOperation(
        `Dropping index for '${columns}' in table '${tableName}'`,
        () => transaction.schema.table(tableName, (table) => table.dropIndex(columns)),
        CONSTRAINT_ERROR_CODES.NOT_EXISTS
    );
}

/**
 * Adds a unique index to a table over the given columns.
 *
 * @param {string} tableName - name of the table to add unique constraint to
 * @param {string|string[]} columns - column(s) to form unique constraint with
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    return handleConstraintOperation(
        `Adding unique constraint for '${columns}' in table '${tableName}'`,
        () => transaction.schema.table(tableName, (table) => table.unique(columns)),
        CONSTRAINT_ERROR_CODES.EXISTS
    );
}

/**
 * Drops a unique key constraint from a table.
 *
 * @param {string} tableName - name of the table to drop unique constraint from
 * @param {string|string[]} columns - column(s) unique constraint was formed
 * @param {import('knex').Knex} transaction - connection object containing knex reference
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    return handleConstraintOperation(
        `Dropping unique constraint for '${columns}' in table '${tableName}'`,
        () => transaction.schema.table(tableName, (table) => table.dropUnique(columns)),
        CONSTRAINT_ERROR_CODES.NOT_EXISTS
    );
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
 * Manage SQLite foreign key state
 */
async function manageSQLiteForeignKeys(transaction, enable) {
    const state = await db.knex.raw('PRAGMA foreign_keys;');
    const isEnabled = state[0].foreign_keys;

    if (enable && !isEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    } else if (!enable && isEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    return isEnabled;
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
 * @param {import('knex').Knex