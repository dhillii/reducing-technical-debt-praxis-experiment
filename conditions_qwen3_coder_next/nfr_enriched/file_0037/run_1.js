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
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = createColumnBuilder(tableBuilder, columnName, columnSpec);
    applyBindingModifiers(column, columnSpec);
    applyConstraintModifiers(column, columnSpec);
    apply onDeleteModifiers(column, columnSpec);
    applyDefaultModifier(column, columnSpec);
    applyIndexModifier(column, columnSpec);
}

/**
 * Creates the base column builder based on columnSpec type and properties
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').knex.ColumnBuilder}
 */
function createColumnBuilder(tableBuilder, columnName, columnSpec) {
    const {type, fieldtype, maxlength} = columnSpec;

    if (type === 'text' && fieldtype) {
        return tableBuilder[type](columnName, fieldtype);
    } else if (type === 'string') {
        return maxlength ? tableBuilder[type](columnName, maxlength) : tableBuilder[type](columnName, 191);
    } else {
        return tableBuilder[type](columnName);
    }
}

/**
 * Applies nullable and primary modifiers to column builder
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyBindingModifiers(column, columnSpec) {
    column.nullable(columnSpec.nullable !== false);
    if (columnSpec.primary) {
        column.primary();
    }
}

/**
 * Applies unique, unsigned, and references-related constraints
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyConstraintModifiers(column, columnSpec) {
    if (columnSpec.unique) {
        column.unique();
    }
    if (columnSpec.unsigned) {
        column.unsigned();
    }
    if (columnSpec.references) {
        column.references(columnSpec.references);
    }
    if (columnSpec.constraintName) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * Applies onDelete behavior for foreign keys
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function apply onDeleteModifiers(column, columnSpec) {
    if (columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies default value and index modifiers
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyDefaultModifier(column, columnSpec) {
    if (columnSpec.defaultTo) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

/**
 * Applies index if requested
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyIndexModifier(column, columnSpec) {
    if (columnSpec.index) {
        column.index();
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

/**
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

    await executeSqlStatements(addColumnBuilder.toSQL(), transaction, options);
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
    if (columnSpec.references) {
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

    await executeSqlStatements(dropColumnBuilder.toSQL(), transaction, options);
}

/**
 * Executes SQL queries generated by Knex builder for non-SQLite databases
 * @param {Array} sqlQueries
 * @param {import('knex').Knex} transaction
 * @param {object} [options]
 */
async function executeSqlStatements(sqlQueries, transaction, options = {}) {
    for (const sqlQuery of sqlQueries) {
        let sql = sqlQuery.sql.replace(/;\s*$/, '');

        if (DatabaseInfo.isMySQL(transaction) && options?.algorithm !== 'auto') {
            const algorithm = options?.algorithm || 'copy';
            sql += `, algorithm=${algorithm}`;
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
        handleIndexError(tableName, columns, err);
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
        handleIndexError(tableName, columns, err);
    }
}

/**
 * Handles index-related errors uniformly across all index operations
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {Error} err
 */
function handleIndexError(tableName, columns, err) {
    if (err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME') {
        logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
        return;
    }
    throw err;
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
        handleConstraintError(tableName, columns, err, 'constraint');
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
        handleConstraintError(tableName, columns, err, 'constraint');
    }
}

/**
 * Handles constraint-related errors uniformly across constraint operations
 * @param {string} tableName
 * @param {string|string[]} columns
 * @param {Error} err
 * @param {string} constraintType
 */
function handleConstraintError(tableName, columns, err, constraintType) {
    if (err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY' || err.code === 'ER_DUP_KEYNAME') {
        logging.warn(`${constraintType === 'constraint' ? 'Constraint' : 'Index'} for '${columns}' ${constraintType === 'constraint' ? 'already exists' : 'does not exist'} for table '${tableName}'`);
        return;
    }
    throw err;
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
    validateSQLiteTransaction(transaction);

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return foreignKeys.some(foreignKey => foreignKey.table === toTable && foreignKey.from === fromColumn && foreignKey.to === toColumn);
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
        await handleSQLiteFKOperations(fromTable, fromColumn, toTable, toColumn, transaction, async () => {
            logging.info(`Adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);
            addForeignKeyToTable(transaction, fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete, setNullDelete);
        });
    } else {
        logging.info(`Adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);
        addForeignKeyToTable(transaction, fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete, setNullDelete);
    }
}

/**
 * Adds foreign key constraint to table builder
 * @param {import('knex').Knex} transaction
 * @param {string} fromTable
 * @param {string} fromColumn
 * @param {string} toTable
 * @param {string} toColumn
 * @param {string} [constraintName]
 * @param {boolean} cascadeDelete
 * @param {boolean} setNullDelete
 */
function addForeignKeyToTable(transaction, fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete, setNullDelete) {
    transaction.schema.table(fromTable, function (table) {
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
 * Handles SQLite-specific FK operations
 * @param {string} fromTable
 * @param {string} fromColumn
 * @param {string} toTable
 * @param {string} toColumn
 * @param {import('knex').Knex} transaction
 * @param {Function} operation
 */
async function handleSQLiteFKOperations(fromTable, fromColumn, toTable, toColumn, transaction, operation) {
    if (await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction})) {
        logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
        return;
    }

    const {foreignKeyChecksEnabled} = await configureForeignKeyChecks(transaction);
    try {
        await operation();
    } finally {
        if (foreignKeyChecksEnabled) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
    }
}

/**
 * Disables foreign key checks on SQLite, returns current state
 * @param {import('knex').Knex} transaction
 * @returns {Promise<{foreignKeyChecksEnabled: boolean}>}
 */
async function configureForeignKeyChecks(transaction) {
    const foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
    if (foreignKeysEnabled[0]?.foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
        return {foreignKeyChecksEnabled: true};
    }
    return {foreignKeyChecksEnabled: false};
}

/**
 * Validates transaction is SQLite
 * @param {import('knex').Knex} transaction
 */
function validateSQLiteTransaction(transaction) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasForeignSQLite3)
        });
    }
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
        if (!(await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction}))) {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
    }

    logging.info(`Dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

    const {foreignKeyChecksEnabled} = await configureForeignKeyChecks(transaction);
    try {
        await transaction.schema.table(fromTable, function (table) {
            table.dropForeign(fromColumn, constraintName);
        });
    } finally {
        if (foreignKeyChecksEnabled) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
    }
}

/**
 * Checks if primary key index exists in a table over the given columns.
 *
 * @param {string} tableName - name of the table to check primary key constraint on
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    validateSQLiteTransaction(transaction);

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.find(c => c.origin === 'pk');
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
        if (await hasPrimaryKeySQLite(tableName, transaction)) {
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
        createTableColumns(table, t, tableSpec);
        applyTableConstraints(table, t, tableSpec);
    });
}

/**
 * Creates all column definitions in the table builder
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {object} tableSpec
 */
function createTableColumns(tableName, tableBuilder, tableSpec) {
    Object.keys(tableSpec)
        .filter(column => !(column.startsWith('@@')))
        .forEach(column => addTableColumn(tableName, tableBuilder, column, tableSpec[column]));
}

/**
 * Applies table-level constraints (indexes and unique constraints)
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {object} tableSpec
 */
function applyTableConstraints(tableName, tableBuilder, tableSpec) {
    if (tableSpec['@@INDEXES@@']) {
        tableSpec['@@INDEXES@@'].forEach(index => tableBuilder.index(index));
    }
    if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
        tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(unique => tableBuilder.unique(unique));
    }
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction] - connection to the DB
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
 * @param {import('knex').Knex} [transaction] - connection to the DB
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
 * @param {string} table
 * @param {import('knex').Knex} [transaction] - connection to the DB
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
 * @param {string} table
 * @param {import('knex').Knex} [transaction] - connection to the DB
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