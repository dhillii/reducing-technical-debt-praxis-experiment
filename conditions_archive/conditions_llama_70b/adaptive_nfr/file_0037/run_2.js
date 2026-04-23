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
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    if (!columnSpec) {
        throw new Error(`Column spec not found for ${tableName}.${columnName}`);
    }

    const isTextWithFieldtype = isColumnTextWithFieldtype(columnSpec);
    const isStringWithMaxlength = isColumnStringWithMaxlength(columnSpec);

    let column;
    if (isTextWithFieldtype) {
        column = tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (isStringWithMaxlength) {
        column = tableBuilder[columnSpec.type](columnName, columnSpec.maxlength);
    } else {
        column = tableBuilder[columnSpec.type](columnName);
    }

    applyColumnModifiers(column, columnSpec);
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isColumnTextWithFieldtype(columnSpec) {
    return columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype');
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isColumnStringWithMaxlength(columnSpec) {
    return columnSpec.type === 'string' && Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength');
}

/**
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnModifiers(column, columnSpec) {
    if (isColumnNullable(columnSpec)) {
        column.nullable();
    } else {
        column.nullable(false);
    }

    if (isColumnPrimary(columnSpec)) {
        column.primary();
    }

    if (isColumnUnique(columnSpec)) {
        column.unique();
    }

    if (isColumnUnsigned(columnSpec)) {
        column.unsigned();
    }

    if (hasReferences(columnSpec)) {
        column.references(columnSpec.references);
    }

    if (hasConstraintName(columnSpec)) {
        column.withKeyName(columnSpec.constraintName);
    }

    if (hasCascadeDelete(columnSpec)) {
        column.onDelete('CASCADE');
    } else if (hasSetNullDelete(columnSpec)) {
        column.onDelete('SET NULL');
    }

    if (hasDefaultTo(columnSpec)) {
        column.defaultTo(columnSpec.defaultTo);
    }

    if (hasIndex(columnSpec)) {
        column.index();
    }
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isColumnNullable(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true;
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isColumnPrimary(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true;
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isColumnUnique(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique;
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isColumnUnsigned(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned;
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasReferences(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'references');
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasConstraintName(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName');
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasCascadeDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true;
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasSetNullDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true;
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasDefaultTo(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo');
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasIndex(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true;
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
    if (DatabaseInfo.isSQLite(transaction)) {
        await transaction.schema.table(tableName, function (table) {
            addTableColumn(tableName, table, column, columnSpec);
        });
        return;
    }

    const addColumnBuilder = transaction.schema.table(tableName, function (table) {
        addTableColumn(tableName, table, column, columnSpec);
    });

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
    if (hasReferences(columnSpec)) {
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
    if (DatabaseInfo.isMySQL(transaction)) {
        return await transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return await transaction.schema.table(tableName, function (table) {
        table.renameColumn(from, to);
    });
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
 * @param {Error} err
 * @returns {boolean}
 */
function isIndexAlreadyExistsError(err) {
    return err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME';
}

/**
 * Drops a non-unique index from a table.
 *
 * @param {string} tableName - name of the table to remove indexes from
 * @param {string|string[]} columns - column(s) to remove indexes for
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function dropIndex(tableName, columns, transaction = db.knex) {
    try {
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
 * @param {Error} err
 * @returns {boolean}
 */
function isIndexDoesNotExistError(err) {
    return err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY';
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
 * @param {Error} err
 * @returns {boolean}
 */
function isUniqueConstraintAlreadyExistsError(err) {
    return err.code === 'SQLITE_ERROR' || err.code === 'ER_DUP_KEYNAME';
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
 * @param {Error} err
 * @returns {boolean}
 */
function isUniqueConstraintDoesNotExistError(err) {
    return err.code === 'SQLITE_ERROR' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY';
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
    } catch (err) {
        if (isForeignKeyAlreadyExistsError(err)) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${fromTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
    }
}

/**
 * @param {Error} err
 * @returns {boolean}
 */
function isForeignKeyAlreadyExistsError(err) {
    return err.code === 'ER_DUP_KEY' || err.code === 'ER_FK_DUP_KEY' || err.code === 'ER_FK_DUP_NAME';
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
    } catch (err) {
        if (isForeignKeyDoesNotExistError(err)) {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

/**
 * @param {Error} err
 * @returns {boolean}
 */
function isForeignKeyDoesNotExistError(err) {
    return err.code === 'ER_CANT_DROP_FIELD_OR_KEY';
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
 * @param {Error} err
 * @returns {boolean}
 */
function isPrimaryKeyAlreadyExistsError(err) {
    return err.code === 'ER_MULTIPLE_PRI_KEY';
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
```