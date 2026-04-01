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
 * Checks if columnSpec property is truthy
 * @param {object} columnSpec
 * @param {string} property
 * @returns {boolean}
 */
function hasProperty(columnSpec, property) {
    return Object.prototype.hasOwnProperty.call(columnSpec, property);
}

/**
 * Checks if columnSpec property equals true
 * @param {object} columnSpec
 * @param {string} property
 * @returns {boolean}
 */
function isPropertyTrue(columnSpec, property) {
    return hasProperty(columnSpec, property) && columnSpec[property] === true;
}

/**
 * Checks if columnSpec property is truthy
 * @param {object} columnSpec
 * @param {string} property
 * @returns {boolean}
 */
function isPropertyTruthy(columnSpec, property) {
    return hasProperty(columnSpec, property) && columnSpec[property];
}

/**
 * Creates the base column with appropriate type and parameters
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').ColumnBuilder}
 */
function createBaseColumn(tableBuilder, columnName, columnSpec) {
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
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyNullableConstraint(column, columnSpec) {
    if (isPropertyTrue(columnSpec, 'nullable')) {
        column.nullable();
    } else {
        column.nullable(false);
    }
}

/**
 * Applies primary key constraint to column
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyPrimaryKeyConstraint(column, columnSpec) {
    if (isPropertyTrue(columnSpec, 'primary')) {
        column.primary();
    }
}

/**
 * Applies unique constraint to column
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyUniqueConstraint(column, columnSpec) {
    if (isPropertyTruthy(columnSpec, 'unique')) {
        column.unique();
    }
}

/**
 * Applies unsigned constraint to column
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyUnsignedConstraint(column, columnSpec) {
    if (isPropertyTruthy(columnSpec, 'unsigned')) {
        column.unsigned();
    }
}

/**
 * Applies foreign key reference to column
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyForeignKeyReference(column, columnSpec) {
    if (hasProperty(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }
}

/**
 * Applies constraint name to column
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyConstraintName(column, columnSpec) {
    if (hasProperty(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * Applies delete cascade behavior to column
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyDeleteBehavior(column, columnSpec) {
    if (isPropertyTrue(columnSpec, 'cascadeDelete')) {
        column.onDelete('CASCADE');
        return;
    }
    if (isPropertyTrue(columnSpec, 'setNullDelete')) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies default value to column
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyDefaultValue(column, columnSpec) {
    if (hasProperty(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

/**
 * Applies index to column
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyIndex(column, columnSpec) {
    if (isPropertyTrue(columnSpec, 'index')) {
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
    applyPrimaryKeyConstraint(column, columnSpec);
    applyUniqueConstraint(column, columnSpec);
    applyUnsignedConstraint(column, columnSpec);
    applyForeignKeyReference(column, columnSpec);
    applyConstraintName(column, columnSpec);
    applyDeleteBehavior(column, columnSpec);
    applyDefaultValue(column, columnSpec);
    applyIndex(column, columnSpec);
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
 * Executes SQL queries for non-SQLite databases
 * @param {import('knex').Knex.Transaction} transaction
 * @param {Array} sqlQueries
 * @param {object} options
 */
async function executeSQLQueries(transaction, sqlQueries, options) {
    for (const sqlQuery of sqlQueries) {
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
    const addColumnBuilder = transaction.schema.table(tableName, function (table) {
        addTableColumn(tableName, table, column, columnSpec);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await addColumnBuilder;
        return;
    }

    await executeSQLQueries(transaction, addColumnBuilder.toSQL(), options);
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

    if (DatabaseInfo.isSQLite(transaction)) {
        await dropColumnBuilder;
        return;
    }

    await executeSQLQueries(transaction, dropColumnBuilder.toSQL(), options);
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
 * Checks if index error is ignorable
 * @param {Error} err
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
 * Checks if drop index error is ignorable
 * @param {Error} err
 * @returns {boolean}
 */
function isIndexDoesNotExistError(err) {
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
        if (isIndexDoesNotExistError(err)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if unique constraint error is ignorable
 * @param {Error} err
 * @returns {boolean}
 */
function isUniqueConstraintAlreadyExistsError(err) {
    return err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME';
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
        if (isUniqueConstraintAlreadyExistsError(err)) {
            logging.warn(`Constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if drop unique constraint error is ignorable
 * @param {Error} err
 * @returns {boolean}
 */
function isUniqueConstraintDoesNotExistError(err) {
    return err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY';
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
        if (isUniqueConstraintDoesNotExistError(err)) {
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

    return foreignKeys.some(foreignKey => foreignKey.table === toTable && foreignKey.from === fromColumn && foreignKey.to === toColumn);
}

/**
 * Checks if foreign key error is ignorable
 * @param {Error} err
 * @returns {boolean}
 */
function isForeignKeyAlreadyExistsError(err) {
    return err.code === 'ER_DUP_KEY' || err.code === 'ER_FK_DUP_KEY' || err.code === 'ER_FK_DUP_NAME';
}

/**
 * Manages SQLite foreign key pragma state
 * @param {import('knex').Knex} transaction
 * @param {string} state - 'ON' or 'OFF'
 */
async function setSQLiteForeignKeyState(transaction, state) {
    await db.knex.raw(`PRAGMA foreign_keys = ${state};`);
}

/**
 * Gets current SQLite foreign key pragma state
 * @param {import('knex').Knex} transaction
 * @returns {Promise<boolean>}
 */
async function getSQLiteForeignKeyState(transaction) {
    const result = await db.knex.raw('PRAGMA foreign_keys;');
    return result[0].foreign_keys;
}

/**
 * Builds foreign key constraint
 * @param {import('knex').knex.TableBuilder} table
 * @param {string} fromColumn
 * @param {string} toTable
 * @param {string} toColumn
 * @param {boolean} cascadeDelete
 * @param {boolean} setNullDelete
 * @param {string} constraintName
 */
function buildForeignKeyConstraint(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete, constraintName) {
    let fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);

    if (cascadeDelete) {
        fkBuilder = fkBuilder.onDelete('CASCADE');
    } else if (setNullDelete) {
        fkBuilder = fkBuilder.onDelete('SET NULL');
    }

    if (constraintName) {
        fkBuilder.withKeyName(constraintName);
    }
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
async function addForeign({fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete = false, setNullDelete = false, transaction = db.knex}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const foreignKeyExists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (foreignKeyExists) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
    }

    try {
        logging.info(`Adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        let foreignKeysEnabled = false;
        if (DatabaseInfo.isSQLite(transaction)) {
            foreignKeysEnabled = await getSQLiteForeignKeyState(transaction);
            if (foreignKeysEnabled) {
                await setSQLiteForeignKeyState(transaction, 'OFF');
            }
        }

        await transaction.schema.table(fromTable, function (table) {
            buildForeignKeyConstraint(table, fromColumn, toTable, toColumn, cascadeDelete, setNullDelete, constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction) && foreignKeysEnabled) {
            await setSQLiteForeignKeyState(transaction, 'ON');
        }
    } catch (err) {
        if (isForeignKeyAlreadyExistsError(err)) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if drop foreign key error is ignorable
 * @param {Error} err
 * @returns {boolean}
 */
function isForeignKeyDoesNotExistError(err) {
    return err.code === 'ER_CANT_DROP_FIELD_OR_KEY';
}

/**
 * Drops a foreign key from a table.
 *
 * @param {Object} configuration - contains all configuration for this function
 * @param {string} configuration.fromTable - name of the table to add the foreign key to
 * @param {string} configuration.fromColumn - column of the table to add the foreign key to
 * @param {string} configuration.toTable - name of the table to point the foreign key to
 * @param {string} configuration.toColumn - column of the table to point the foreign key to
 * @param {string} [configuration.constraintName] - name of the FK to delete
 * @param {import('knex').Knex} [configuration.transaction] - connection object containing knex reference
 */
async function dropForeign({fromTable, fromColumn, toTable, toColumn, constraintName, transaction = db.knex}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const foreignKeyExists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (!foreignKeyExists) {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
    }

    try {
        logging.info(`Dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        let foreignKeysEnabled = false;
        if (DatabaseInfo.isSQLite(transaction)) {
            foreignKeysEnabled = await getSQLiteForeignKeyState(transaction);
            if (foreignKeysEnabled) {
                await setSQLiteForeignKeyState(transaction, 'OFF');
            }
        }

        await transaction.schema.table(fromTable, function (table) {
            table.dropForeign(fromColumn, constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction) && foreignKeysEnabled) {
            await setSQLiteForeignKeyState(transaction, 'ON');
        }
    } catch (err) {
        if (isForeignKeyDoesNotExistError(err)) {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if primary key index exists in a table over the given columns.
 *
 * @param {string} tableName - name of the table to check primary key constraint on
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)){
        throw new errors.InternalServerError({
            message: tpl(messages.hasPrimaryKeySQLiteError)
        });
    }

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.find(c => c.origin === 'pk');
}

/**
 * Checks if primary key error is ignorable
 * @param {Error} err
 * @returns {boolean}
 */
function isPrimaryKeyAlreadyExistsError(err) {
    return err.code === 'ER_MULTIPLE_PRI_KEY';
}

/**
 * Adds an primary key index to a table over the given columns.
 *
 * @param {string} tableName - name of the table to add primaykey  constraint to
 * @param {string|string[]} columns - column(s) to form primary key constraint with
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function addPrimaryKey(tableName, columns, transaction = db.knex) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const primaryKeyExists = await hasPrimaryKeySQLite(tableName, transaction);
        if (primaryKeyExists) {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
    }

    try {
        logging.info(`Adding primary key constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, function (table) {
            table.primary(columns);
        });
    } catch (err) {
        if (isPrimaryKeyAlreadyExistsError(err)) {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Adds table indexes from spec
 * @param {object} tableSpec
 * @param {import('knex').knex.TableBuilder} t
 */
function addTableIndexes(tableSpec, t) {
    if (tableSpec['@@INDEXES@@']) {
        tableSpec['@@INDEXES@@'].forEach(index => t.index(index));
    }
}

/**
 * Adds table unique constraints from spec
 * @param {object} tableSpec
 * @param {import('knex').knex.TableBuilder} t
 */
function addTableUniqueConstraints(tableSpec, t) {
    if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
        tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(unique => t.unique(unique));
    }
}

/**
 * Adds a table according to the provided spec, or falls back to the current schema
 *
 * NOTE: this function does NOT check if the table already exists - use the migration
 * utils if you want that
 *
 * @param {String} table - name of the table to create
 * @param {import('knex').Knex} [transaction] - connection to the DB
 * @param {Object} [tableSpec] - table schema to generate table with
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, function (t) {
        Object.keys(tableSpec)
            .filter(column => !(column.startsWith('@@')))
            .forEach(column => addTableColumn(table, t, column, tableSpec[column]));

        addTableIndexes(tableSpec, t);
        addTableUniqueConstraints(tableSpec, t);
    });
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction] - connection to the DB
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
 * Gets tables for SQLite database
 * @param {import('knex').Knex} transaction
 * @returns {Promise<string[]>}
 */
async function getTablesSQLite(transaction) {
    const response = await transaction.raw('select * from sqlite_master where type = "table"');
    return _.reject(_.map(response, 'tbl_name'), name => name === 'sqlite_sequence');
}

/**
 * Gets tables for MySQL database
 * @param {import('knex').Knex} transaction
 * @returns {Promise<string[]>}
 */
async function getTablesMySQL(transaction) {
    const response = await transaction.raw('show tables');
    return _.flatten(_.map(response[0], entry => _.values(entry)));
}

/**
 * @param {import('knex').Knex} [transaction] - connection to the DB
 */
async function getTables(transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        return getTablesSQLite(transaction);
    }
    if (client === 'mysql2') {
        return getTablesMySQL(transaction);
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * Gets indexes for SQLite database
 * @param {string} table
 * @param {import('knex').Knex} transaction
 * @returns {Promise<string[]>}
 */
async function getIndexesSQLite(table, transaction) {
    const response = await transaction.raw(`pragma index_list("${table}")`);
    return _.flatten(_.map(response, 'name'));
}

/**
 * Gets indexes for MySQL database
 * @param {string} table
 * @param {import('knex').Knex} transaction
 * @returns {Promise<string[]>}
 */
async function getIndexesMySQL(table, transaction) {
    const response = await transaction.raw(`SHOW INDEXES from ${table}`);
    return _.flatten(_.map(response[0], 'Key_name'));
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction] - connection to the DB
 */
async function getIndexes(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        return getIndexesSQLite(table, transaction);
    }
    if (client === 'mysql2') {
        return getIndexesMySQL(table, transaction);
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * Gets columns for SQLite database
 * @param {string} table
 * @param {import('knex').Knex} transaction
 * @returns {Promise<string[]>}
 */
async function getColumnsSQLite(table, transaction) {
    const response = await transaction.raw(`pragma table_info("${table}")`);
    return _.flatten(_.map(response, 'name'));
}

/**
 * Gets columns for MySQL database
 * @param {string} table
 * @param {import('knex').Knex} transaction
 * @returns {Promise<string[]>}
 */
async function getColumnsMySQL(table, transaction) {
    const response = await transaction.raw(`SHOW COLUMNS from ${table}`);
    return _.flatten(_.map(response[0], 'Field'));
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction] - connection to the DB
 */
async function getColumns(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        return getColumnsSQLite(table, transaction);
    }
    if (client === 'mysql2') {
        return getColumnsMySQL(table, transaction);
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * Checks if database is in correct state for migration
 * @param {boolean} hasColumn
 * @param {Function} dbIsInCorrectState
 * @returns {boolean}
 */
function isInCorrectMigrationState(hasColumn, dbIsInCorrectState) {
    return dbIsInCorrectState(hasColumn);
}

/**
 * Runs a single column migration
 * @param {import('knex').Knex} conn
 * @param {object} migration
 */
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
    const isCorrect = isInCorrectMigrationState(hasColumn, dbIsInCorrectState);

    if (isCorrect) {
        logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
        return;
    }

    logging.info(`${operationVerb} ${table}.${column} column`);
    await operation(table, column, conn, columnDefinition, options);
}

function createColumnMigration(...migrations) {
    return async function columnMigration(conn) {
        for (const migration of migrations) {
            await runColumnMigration(conn, migration);
        }
    };
}

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
    // NOTE: below are exposed for testing purposes only
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};
```