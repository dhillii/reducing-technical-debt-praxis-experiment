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
 * Builds the base column definition based on type and field specifications.
 *
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').knex.ColumnBuilder}
 */
function buildColumnBuilder(tableBuilder, columnName, columnSpec) {
    let column;

    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        column = tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (columnSpec.type === 'string') {
        if (Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength')) {
            column = tableBuilder[columnSpec.type](columnName, columnSpec.maxlength);
        } else {
            column = tableBuilder[columnSpec.type](columnName, 191);
        }
    } else {
        column = tableBuilder[columnSpec.type](columnName);
    }

    return column;
}

/**
 * Applies column modifiers like nullable, primary, unique, and unsigned.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnModifiers(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }

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
 * Applies foreign key related modifiers to a column.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyForeignKeyModifiers(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies default value and index settings to a column.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnDefaults(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true) {
        column.index();
    }
}

/**
 * Adds a column to a table according to the provided specification.
 *
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = buildColumnBuilder(tableBuilder, columnName, columnSpec);
    applyColumnModifiers(column, columnSpec);
    applyForeignKeyModifiers(column, columnSpec);
    applyColumnDefaults(column, columnSpec);
}

/**
 * Sets a column to nullable in a table.
 *
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
 * Drops nullable constraint from a column in a table.
 *
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
 * Adds a column to a table with database-specific handling.
 *
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex} [transaction]
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

    await executeColumnAlteration(addColumnBuilder, transaction, options);
}

/**
 * Executes column alteration for non-SQLite databases.
 *
 * @param {import('knex').knex.TableBuilder} addColumnBuilder
 * @param {import('knex').Knex} transaction
 * @param {object} [options]
 */
async function executeColumnAlteration(addColumnBuilder, transaction, options = {}) {
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
 * Drops a column from a table with database-specific handling.
 *
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

    await executeColumnAlteration(dropColumnBuilder, transaction, options);
}

/**
 * Renames a column in a table.
 *
 * @param {string} tableName
 * @param {string} from
 * @param {string} to
 * @param {import('knex').Knex} [transaction]
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
 * Adds a non-unique index to a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);

        return await transaction.schema.table(tableName, function (table) {
            table.index(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME') {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Drops a non-unique index from a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping index for '${columns}' in table '${tableName}'`);

        return await transaction.schema.table(tableName, function (table) {
            table.dropIndex(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Adds a unique index to a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
 */
async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);

        return await transaction.schema.table(tableName, function (table) {
            table.unique(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME') {
            logging.warn(`Constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Drops a unique key constraint from a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} transaction
 */
async function dropUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);

        return await transaction.schema.table(tableName, function (table) {
            table.dropUnique(columns);
        });
    } catch (err) {
        if (err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if a foreign key exists in a table.
 *
 * @param {Object} configuration
 * @param {string} configuration.fromTable
 * @param {string} configuration.fromColumn
 * @param {string} configuration.toTable
 * @param {string} configuration.toColumn
 * @param {import('knex').Knex} [configuration.transaction]
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
 * Adds a foreign key to a table.
 *
 * @param {Object} configuration
 * @param {string} configuration.fromTable
 * @param {string} configuration.fromColumn
 * @param {string} configuration.toTable
 * @param {string} configuration.toColumn
 * @param {string} [configuration.constraintName]
 * @param {Boolean} [configuration.cascadeDelete]
 * @param {Boolean} [configuration.setNullDelete]
 * @param {import('knex').Knex} [configuration.transaction]
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

        await executeForeignKeyAddition({fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete, setNullDelete, transaction});
    } catch (err) {
        if (err.code === 'ER_DUP_KEY' || err.code === 'ER_FK_DUP_KEY' || err.code === 'ER_FK_DUP_NAME') {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
    }
}

/**
 * Executes the foreign key addition logic.
 *
 * @param {Object} configuration
 * @param {string} configuration.fromTable
 * @param {string} configuration.fromColumn
 * @param {string} configuration.toTable
 * @param {string} configuration.toColumn
 * @param {string} [configuration.constraintName]
 * @param {Boolean} [configuration.cascadeDelete]
 * @param {Boolean} [configuration.setNullDelete]
 * @param {import('knex').Knex} [configuration.transaction]
 */
async function executeForeignKeyAddition({fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete, setNullDelete, transaction}) {
    let foreignKeysEnabled;

    if (DatabaseInfo.isSQLite(transaction)) {
        foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
        if (foreignKeysEnabled[0].foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = OFF;');
        }
    }

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

    if (DatabaseInfo.isSQLite(transaction)) {
        if (foreignKeysEnabled[0].foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
    }
}

/**
 * Drops a foreign key from a table.
 *
 * @param {Object} configuration
 * @param {string} configuration.fromTable
 * @param {string} configuration.fromColumn
 * @param {string} configuration.toTable
 * @param {string} configuration.toColumn
 * @param {string} [configuration.constraintName]
 * @param {import('knex').Knex} [configuration.transaction]
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

        await executeForeignKeyRemoval({fromTable, fromColumn, toTable, toColumn, constraintName, transaction});
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

/**
 * Executes the foreign key removal logic.
 *
 * @param {Object} configuration
 * @param {string} configuration.fromTable
 * @param {string} configuration.fromColumn
 * @param {string} configuration.toTable
 * @param {string} configuration.toColumn
 * @param {string} [configuration.constraintName]
 * @param {import('knex').Knex} [configuration.transaction]
 */
async function executeForeignKeyRemoval({fromTable, fromColumn, toTable, toColumn, constraintName, transaction}) {
    let foreignKeysEnabled;

    if (DatabaseInfo.isSQLite(transaction)) {
        foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
        if (foreignKeysEnabled[0].foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = OFF;');
        }
    }

    await transaction.schema.table(fromTable, function (table) {
        table.dropForeign(fromColumn, constraintName);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        if (foreignKeysEnabled[0].foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
    }
}

/**
 * Checks if primary key index exists in a table.
 *
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasPrimaryKeySQLiteError)
        });
    }

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.find(c => c.origin === 'pk');
}

/**
 * Adds a primary key index to a table.
 *
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {import('knex').Knex} [transaction]
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
        if (err.code === 'ER_MULTIPLE_PRI_KEY') {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Creates a table according to the provided specification.
 *
 * @param {String} table
 * @param {import('knex').Knex} [transaction]
 * @param {Object} [tableSpec]
 */
function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, function (t) {
        Object.keys(tableSpec)
            .filter(column => !(column.startsWith('@@')))
            .forEach(column => addTableColumn(table, t, column, tableSpec[column]));

        if (tableSpec['@@INDEXES@@']) {
            tableSpec['@@INDEXES@@'].forEach(index => t.index(index));
        }
        if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
            tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(unique => t.unique(unique));
        }
    });
}

/**
 * Deletes a table from the database.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
 * Retrieves all tables from the database.
 *
 * @param {import('knex').Knex} [transaction]
 */
async function getTables(transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const response = await transaction.raw('select * from sqlite_master where type = "table"');
        return _.reject(_.map(response, 'tbl_name'), name => name === 'sqlite_sequence');
    } else if (client === 'mysql2') {
        const response = await transaction.raw('show tables');
        return _.flatten(_.map(response[0], entry => _.values(entry)));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * Retrieves all indexes for a table.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getIndexes(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const response = await transaction.raw(`pragma index_list("${table}")`);
        return _.flatten(_.map(response, 'name'));
    } else if (client === 'mysql2') {
        const response = await transaction.raw(`SHOW INDEXES from ${table}`);
        return _.flatten(_.map(response[0], 'Key_name'));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * Retrieves all columns for a table.
 *
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getColumns(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const response = await transaction.raw(`pragma table_info("${table}")`);
        return _.flatten(_.map(response, 'name'));
    } else if (client === 'mysql2') {
        const response = await transaction.raw(`SHOW COLUMNS from ${table}`);
        return _.flatten(_.map(response[0], 'Field'));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * Creates a column migration that checks if the column exists and applies the operation if needed.
 *
 * @param {...Object} migrations
 */
function createColumnMigration(...migrations) {
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
        const isInCorrectState = dbIsInCorrectState(hasColumn);

        if (isInCorrectState) {
            logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
        } else {
            logging.info(`${operationVerb} ${table}.${column} column`);
            await operation(table, column, conn, columnDefinition, options);
        }
    }

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