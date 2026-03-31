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

const SPECIAL_SCHEMA_KEYS = {
    INDEXES: '@@INDEXES@@',
    UNIQUE_CONSTRAINTS: '@@UNIQUE_CONSTRAINTS@@'
};

// Helper to safely check property existence
const hasProperty = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

// Helper to apply column modifiers
const applyColumnModifier = (column, modifier, value) => {
    if (value) {
        column[modifier]();
    }
};

// Helper to apply nullable constraint
const applyNullableConstraint = (column, columnSpec) => {
    if (hasProperty(columnSpec, 'nullable') && columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }
};

// Helper to apply delete behavior
const applyDeleteBehavior = (column, columnSpec) => {
    if (hasProperty(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (hasProperty(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }
};

// Helper to apply column constraints
const applyColumnConstraints = (column, columnSpec) => {
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
    if (hasProperty(columnSpec, 'index') && columnSpec.index === true) {
        column.index();
    }
};

// Helper to create column type
const createColumnType = (tableBuilder, columnName, columnSpec) => {
    if (columnSpec.type === 'text' && hasProperty(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        const maxlength = hasProperty(columnSpec, 'maxlength') ? columnSpec.maxlength : 191;
        return tableBuilder[columnSpec.type](columnName, maxlength);
    }
    return tableBuilder[columnSpec.type](columnName);
};

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = createColumnType(tableBuilder, columnName, columnSpec);

    applyNullableConstraint(column, columnSpec);
    applyColumnConstraints(column, columnSpec);
    applyDeleteBehavior(column, columnSpec);

    if (hasProperty(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
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

// Helper to apply MySQL algorithm option
const applyMySQLAlgorithm = (sql, options = {}) => {
    sql = sql.replace(/;\s*$/, '');
    if (options?.algorithm !== 'auto') {
        const algorithm = options?.algorithm || 'copy';
        sql += `, algorithm=${algorithm}`;
    }
    return sql;
};

// Helper to execute SQL with database-specific handling
const executeSQLWithDatabaseHandling = async (transaction, sqlBuilder, options = {}) => {
    if (DatabaseInfo.isSQLite(transaction)) {
        await sqlBuilder;
        return;
    }

    for (const sqlQuery of sqlBuilder.toSQL()) {
        let sql = sqlQuery.sql;
        if (DatabaseInfo.isMySQL(transaction)) {
            sql = applyMySQLAlgorithm(sql, options);
        }
        await transaction.raw(sql);
    }
};

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

    await executeSQLWithDatabaseHandling(transaction, addColumnBuilder, options);
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
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }

    const dropColumnBuilder = transaction.schema.table(tableName, function (table) {
        table.dropColumn(column);
    });

    await executeSQLWithDatabaseHandling(transaction, dropColumnBuilder, options);
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

// Helper to handle constraint operation errors
const handleConstraintError = (err, operation, columns, tableName, skipMessage) => {
    const ignorableCodes = operation === 'add' 
        ? [CONSTRAINT_ERROR_CODES.SQLITE_ERROR, CONSTRAINT_ERROR_CODES.ER_DUP_KEYNAME]
        : [CONSTRAINT_ERROR_CODES.SQLITE_ERROR, CONSTRAINT_ERROR_CODES.ER_CANT_DROP_FIELD_OR_KEY];

    if (ignorableCodes.includes(err.code)) {
        logging.warn(skipMessage);
        return;
    }
    throw err;
};

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
        handleConstraintError(err, 'add', columns, tableName, `Index for '${columns}' already exists for table '${tableName}'`);
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
        handleConstraintError(err, 'drop', columns, tableName, `Constraint for '${columns}' does not exist for table '${tableName}'`);
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
        handleConstraintError(err, 'add', columns, tableName, `Constraint for '${columns}' already exists for table '${tableName}'`);
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
        handleConstraintError(err, 'drop', columns, tableName, `Constraint for '${columns}' does not exist for table '${tableName}'`);
    }
}

// Helper to manage SQLite foreign key state
const manageSQLiteForeignKeyState = async (transaction, enable) => {
    const foreignKeys = await db.knex.raw('PRAGMA foreign_keys;');
    if (foreignKeys[0].foreign_keys) {
        const state = enable ? 'ON' : 'OFF';
        await db.knex.raw(`PRAGMA foreign_keys = ${state};`);
    }
    return foreignKeys[0].foreign_keys;
};

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

// Helper to build foreign key constraint
const buildForeignKeyConstraint = (table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete, constraintName) => {
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
 * @param {import('knex