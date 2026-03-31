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
    FOREIGN_KEY_EXISTS: [ERROR_CODES.ER_DUP_KEY, ERROR_CODES.ER_FK_DUP_KEY, ERROR_CODES.ER_FK_DUP_NAME]
};

/**
 * Check if property exists and has a truthy value
 */
function hasProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
}

/**
 * Check if property exists and equals true
 */
function isPropertyTrue(obj, prop) {
    return hasProperty(obj, prop) && obj[prop] === true;
}

/**
 * Apply column modifiers based on column specification
 */
function applyColumnModifiers(column, columnSpec) {
    const modifiers = [
        {
            condition: () => isPropertyTrue(columnSpec, 'nullable'),
            apply: () => column.nullable(),
            fallback: () => column.nullable(false)
        },
        {
            condition: () => isPropertyTrue(columnSpec, 'primary'),
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
            condition: () => isPropertyTrue(columnSpec, 'cascadeDelete'),
            apply: () => column.onDelete('CASCADE')
        },
        {
            condition: () => isPropertyTrue(columnSpec, 'setNullDelete'),
            apply: () => column.onDelete('SET NULL')
        },
        {
            condition: () => hasProperty(columnSpec, 'defaultTo'),
            apply: () => column.defaultTo(columnSpec.defaultTo)
        },
        {
            condition: () => isPropertyTrue(columnSpec, 'index'),
            apply: () => column.index()
        }
    ];

    modifiers.forEach(modifier => {
        if (modifier.condition()) {
            modifier.apply();
        } else if (modifier.fallback) {
            modifier.fallback();
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
 * Apply MySQL algorithm option to SQL query
 */
function applyMySQLAlgorithm(sql, options = {}) {
    const cleanSql = sql.replace(/;\s*$/, '');
    if (options?.algorithm === 'auto') {
        return cleanSql;
    }
    const algorithm = options?.algorithm || 'copy';
    return `${cleanSql}, algorithm=${algorithm}`;
}

/**
 * Execute SQL queries with database-specific handling
 */
async function executeSQLQueries(builder, transaction, options = {}) {
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
    const builder = transaction.schema.table(tableName, table => {
        addTableColumn(tableName, table, column, columnSpec);
    });
    await executeSQLQueries(builder, transaction, options);
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

    const builder = transaction.schema.table(tableName, table => table.dropColumn(column));
    await executeSQLQueries(builder, transaction, options);
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
 * Handle constraint operation with error handling
 */
async function handleConstraintOperation(operationName, operation, errorCodes, skipMessage) {
    try {
        logging.info(operationName);
        return await operation();
    } catch (err) {
        if (errorCodes.includes(err.code)) {
            logging.warn(skipMessage);
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
        () => transaction.schema.table(tableName, table => table.index(columns)),
        CONSTRAINT_ERROR_CODES.EXISTS,
        `Index for '${columns}' already exists for table '${tableName}'`
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
        () => transaction.schema.table(tableName, table => table.dropIndex(columns)),
        CONSTRAINT_ERROR_CODES.NOT_EXISTS,
        `Constraint for '${columns}' does not exist for table '${tableName}'`
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
        () => transaction.schema.table(tableName, table => table.unique(columns)),
        CONSTRAINT_ERROR_CODES.EXISTS,
        `Constraint for '${columns}' already exists for table '${tableName}'`
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
        () => transaction.schema.table(tableName, table => table.dropUnique(columns)),
        CONSTRAINT_ERROR_CODES.NOT_EXISTS,
        `Constraint for '${columns}' does not exist for table '${tableName}'`
    );
}

/**
 * Manage SQLite foreign key pragma state
 */
async function manageSQLiteForeignKeys(transaction, enable) {
    const state = await db.knex.raw('PRAGMA foreign_keys;');
    if (state[0].foreign_keys) {
        const pragma = enable ? 'ON' : 'OFF';
        await db.knex.raw(`PRAGMA foreign_keys = ${pragma};`);
    }
    return state[0].foreign_keys;
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