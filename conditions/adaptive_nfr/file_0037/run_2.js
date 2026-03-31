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

const CONSTRAINT_ALREADY_EXISTS_CODES = new Set([
    CONSTRAINT_ERROR_CODES.SQLITE_ERROR,
    CONSTRAINT_ERROR_CODES.ER_DUP_KEYNAME,
    CONSTRAINT_ERROR_CODES.ER_DUP_KEY,
    CONSTRAINT_ERROR_CODES.ER_FK_DUP_KEY,
    CONSTRAINT_ERROR_CODES.ER_FK_DUP_NAME,
    CONSTRAINT_ERROR_CODES.ER_MULTIPLE_PRI_KEY
]);

const CONSTRAINT_NOT_EXISTS_CODES = new Set([
    CONSTRAINT_ERROR_CODES.SQLITE_ERROR,
    CONSTRAINT_ERROR_CODES.ER_CANT_DROP_FIELD_OR_KEY
]);

/**
 * Helper to safely get property from object
 */
function hasProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
}

/**
 * Apply column modifiers based on columnSpec
 */
function applyColumnModifiers(column, columnSpec) {
    if (hasProperty(columnSpec, 'nullable') && columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }

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

    if (hasProperty(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (hasProperty(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }

    if (hasProperty(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }

    if (hasProperty(columnSpec, 'index') && columnSpec.index === true) {
        column.index();
    }
}

/**
 * Create column with appropriate type and parameters
 */
function createColumnWithType(tableBuilder, columnName, columnSpec) {
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
    const column = createColumnWithType(tableBuilder, columnName, columnSpec);
    applyColumnModifiers(column, columnSpec);
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
 * Apply MySQL-specific SQL modifications
 */
function applyMySQLModifications(sql, options = {}) {
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
            sql = applyMySQLModifications(sql, options);
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
        (table) => addTableColumn(tableName, table, column, columnSpec)
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
        (table) => table.dropColumn(column)
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

    return await transaction.schema.table(tableName, function (table) {
        table.renameColumn(from, to);
    });
}

/**
 * Handle constraint operation errors
 */
function handleConstraintError(err, operation, tableName, columns, isDropOperation = false) {
    const errorCodes = isDropOperation ? CONSTRAINT_NOT_EXISTS_CODES : CONSTRAINT_ALREADY_EXISTS_CODES;

    if (errorCodes.has(err.code)) {
        const message = isDropOperation
            ? `Constraint for '${columns}' does not exist for table '${tableName}'`
            : `Constraint for '${columns}' already exists for table '${tableName}'`;
        logging.warn(message);
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

        return await transaction.schema.table(tableName, function (table) {
            table.index(columns);
        });
    } catch (err) {
        handleConstraintError(err, 'addIndex', tableName, columns, false);
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

        return await transaction.schema.table(tableName, function (table) {
            table.dropIndex(columns);
        });
    } catch (err) {
        handleConstraintError(err, 'dropIndex', tableName, columns, true);
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

        return await transaction.schema.table(tableName, function (table) {
            table.unique(columns);
        });
    } catch (err) {
        handleConstraintError(err, 'addUnique', tableName, columns, false);
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
        handleConstraintError(err, 'dropUnique', tableName, columns, true);
    }
}

/**
 * Manage SQLite foreign key pragma state
 */
async function manageSQLiteForeignKeyState(transaction, enable) {
    const foreignKeys = await db.knex.raw('PRAGMA foreign_keys;');
    const isEnabled = foreignKeys[0].foreign_keys;

    if (enable && !isEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    } else if (!enable && isEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }

    return isEnabled;
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
 * @param {Boolean} [configuration.setN