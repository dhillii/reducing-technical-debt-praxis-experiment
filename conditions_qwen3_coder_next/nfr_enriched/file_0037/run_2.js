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
 * Applies a single column specification to a table builder
 * - Handles type-specific options (fieldtype, maxlength)
 * - Applies modifiers (nullable, primary, unique, unsigned, references, etc.)
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = buildColumn(tableBuilder, columnName, columnSpec);
    applyColumnModifiers(column, columnSpec);
}

/**
 * Builds the base column definition using the column type and options
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').knex.ColumnBuilder} column builder instance
 */
function buildColumn(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && columnSpec.fieldtype) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string' && columnSpec.maxlength) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.maxlength);
    }
    if (columnSpec.type === 'string') {
        return tableBuilder[columnSpec.type](columnName, 191);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies optional modifiers to the column builder based on spec
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnModifiers(column, columnSpec) {
    applyNullable(column, columnSpec);
    applyPrimary(column, columnSpec);
    applyUnique(column, columnSpec);
    applyUnsigned(column, columnSpec);
    applyReferences(column, columnSpec);
    applyKeyName(column, columnSpec);
    applyOnDelete(column, columnSpec);
    applyDefaultTo(column, columnSpec);
    applyIndex(column, columnSpec);
}

/**
 * Sets nullability for the column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyNullable(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable')) {
        column.nullable(columnSpec.nullable);
    } else {
        column.nullable(false);
    }
}

/**
 * Applies primary key constraint
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyPrimary(column, columnSpec) {
    if (columnSpec.primary) {
        column.primary();
    }
}

/**
 * Applies unique constraint
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyUnique(column, columnSpec) {
    if (columnSpec.unique) {
        column.unique();
    }
}

/**
 * Applies unsigned modifier (for numeric types)
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyUnsigned(column, columnSpec) {
    if (columnSpec.unsigned) {
        column.unsigned();
    }
}

/**
 * Applies foreign key reference
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyReferences(column, columnSpec) {
    if (columnSpec.references) {
        column.references(columnSpec.references);
    }
}

/**
 * Applies custom constraint name
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyKeyName(column, columnSpec) {
    if (columnSpec.constraintName) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * Applies ON DELETE behavior
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyOnDelete(column, columnSpec) {
    if (columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies default value
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyDefaultTo(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

/**
 * Applies index hint
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyIndex(column, columnSpec) {
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

    await executeKnexSchemaSql(addColumnBuilder, transaction, options);
}

/**
 * @param {string} tableName
 * @param {string} column
 * @param {import('knex').Knex.Transaction} [transaction]
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

    await executeKnexSchemaSql(dropColumnBuilder, transaction, options);
}

/**
 * Executes SQL for database commands requiring raw execution on MySQL
 * @param {import('knex').knex.SchemaBuilder} builder
 * @param {import('knex').Knex} transaction
 * @param {object} [options]
 */
async function executeKnexSchemaSql(builder, transaction, options = {}) {
    for (const sqlQuery of builder.toSQL()) {
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
 * Adds a non-unique index to a table
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
 * Drops a non-unique index from a table
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
 * Adds a unique constraint to a table
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
 * Drops a unique constraint from a table
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
 * Checks if a foreign key exists on SQLite (using PRAGMA)
 * @param {Object} configuration
 * @param {string} configuration.fromTable
 * @param {string} configuration.fromColumn
 * @param {string} configuration.toTable
 * @param {string} configuration.toColumn
 * @param {import('knex').Knex} [configuration.transaction]
 * @returns {Promise<boolean>}
 */
async function hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction = db.knex}) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasForeignSQLite3)});
    }

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return foreignKeys.some(foreignKey => foreignKey.table === toTable && foreignKey.from === fromColumn && foreignKey.to === toColumn);
}

/**
 * Adds a foreign key constraint
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

        await toggleForeignKeysIfSQLite(transaction, false);

        await transaction.schema.table(fromTable, function (table) {
            const fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
            if (cascadeDelete) {
                fkBuilder.onDelete('CASCADE');
            } else if (setNullDelete) {
                fkBuilder.onDelete('SET NULL');
            }
            if (constraintName) {
                fkBuilder.withKeyName(constraintName);
            }
        });

        await toggleForeignKeysIfSQLite(transaction, true);
    } catch (err) {
        if (['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'].includes(err.code)) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
    }
}

/**
 * Drops a foreign key constraint
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

        await toggleForeignKeysIfSQLite(transaction, false);

        await transaction.schema.table(fromTable, function (table) {
            table.dropForeign(fromColumn, constraintName);
        });

        await toggleForeignKeysIfSQLite(transaction, true);
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

/**
 * Toggles SQLite foreign keys on/off, preserving previous state
 * @param {import('knex').Knex} transaction
 * @param {boolean} enable
 */
async function toggleForeignKeysIfSQLite(transaction, enable) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        return;
    }

    const foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
    if (!foreignKeysEnabled[0]?.foreign_keys) {
        return;
    }

    if (enable) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    } else {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }
}

/**
 * Checks if primary key exists for a table on SQLite
 * @param {string} tableName
 * @param {import('knex').Knex} [transaction]
 * @returns {Promise<boolean>}
 */
async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({message: tpl(messages.hasPrimaryKeySQLiteError)});
    }

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.some(c => c.origin === 'pk');
}

/**
 * Adds a primary key constraint to a table
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
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

/**
 * @param {import('knex').Knex} [transaction]
 */
async function getTables(transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const response = await transaction.raw('select * from sqlite_master where type = "table"');
        return _.reject(_.map(response, 'tbl_name'), name => name === 'sqlite_sequence');
    }
    if (client === 'mysql2') {
        const response = await transaction.raw('show tables');
        return _.flatten(_.map(response[0], entry => _.values(entry)));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getIndexes(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const response = await transaction.raw(`pragma index_list("${table}")`);
        return _.flatten(_.map(response, 'name'));
    }
    if (client === 'mysql2') {
        const response = await transaction.raw(`SHOW INDEXES from ${table}`);
        return _.flatten(_.map(response[0], 'Key_name'));
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction]
 */
async function getColumns(table, transaction = db.knex) {
    const client = transaction.client.config.client;

    if (client === 'sqlite3') {
        const response = await transaction.raw(`pragma table_info("${table}")`);
        return _.flatten(_.map(response, 'name'));
    }
    if (client === 'mysql2') {
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
    _hasForeignSQLite: hasForeignSQLite,
    _hasPrimaryKeySQLite: hasPrimaryKeySQLite
};