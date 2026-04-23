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
 * Checks if columnSpec has text type with fieldtype property
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isTextWithFieldtype(columnSpec) {
    return columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype');
}

/**
 * Checks if columnSpec is string type
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isStringType(columnSpec) {
    return columnSpec.type === 'string';
}

/**
 * Checks if columnSpec has maxlength property
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasMaxlength(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength');
}

/**
 * Checks if columnSpec should be nullable
 * @param {object} columnSpec
 * @returns {boolean}
 */
function shouldBeNullable(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true;
}

/**
 * Checks if columnSpec has primary key
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasPrimaryKeySpec(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true;
}

/**
 * Checks if columnSpec has unique constraint
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasUniqueSpec(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique;
}

/**
 * Checks if columnSpec has unsigned constraint
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasUnsignedSpec(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned;
}

/**
 * Checks if columnSpec has references
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasReferencesSpec(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'references');
}

/**
 * Checks if columnSpec has constraint name
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasConstraintNameSpec(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName');
}

/**
 * Checks if columnSpec has cascade delete
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasCascadeDeleteSpec(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true;
}

/**
 * Checks if columnSpec has set null delete
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasSetNullDeleteSpec(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true;
}

/**
 * Checks if columnSpec has default value
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasDefaultToSpec(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo');
}

/**
 * Checks if columnSpec has index
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasIndexSpec(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true;
}

/**
 * Creates column with appropriate type
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').knex.ColumnBuilder}
 */
function createColumnWithType(tableBuilder, columnName, columnSpec) {
    if (isTextWithFieldtype(columnSpec)) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (isStringType(columnSpec)) {
        const maxlength = hasMaxlength(columnSpec) ? columnSpec.maxlength : 191;
        return tableBuilder[columnSpec.type](columnName, maxlength);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies nullable constraint to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyNullableConstraint(column, columnSpec) {
    if (shouldBeNullable(columnSpec)) {
        column.nullable();
    } else {
        column.nullable(false);
    }
}

/**
 * Applies primary key constraint to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyPrimaryKeyConstraint(column, columnSpec) {
    if (hasPrimaryKeySpec(columnSpec)) {
        column.primary();
    }
}

/**
 * Applies unique constraint to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyUniqueConstraint(column, columnSpec) {
    if (hasUniqueSpec(columnSpec)) {
        column.unique();
    }
}

/**
 * Applies unsigned constraint to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyUnsignedConstraint(column, columnSpec) {
    if (hasUnsignedSpec(columnSpec)) {
        column.unsigned();
    }
}

/**
 * Applies references constraint to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyReferencesConstraint(column, columnSpec) {
    if (hasReferencesSpec(columnSpec)) {
        column.references(columnSpec.references);
    }
}

/**
 * Applies constraint name to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyConstraintName(column, columnSpec) {
    if (hasConstraintNameSpec(columnSpec)) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * Applies delete behavior to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyDeleteBehavior(column, columnSpec) {
    if (hasCascadeDeleteSpec(columnSpec)) {
        column.onDelete('CASCADE');
        return;
    }
    if (hasSetNullDeleteSpec(columnSpec)) {
        column.onDelete('SET NULL');
    }
}

/**
 * Applies default value to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyDefaultValue(column, columnSpec) {
    if (hasDefaultToSpec(columnSpec)) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

/**
 * Applies index to column
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyIndex(column, columnSpec) {
    if (hasIndexSpec(columnSpec)) {
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
    const column = createColumnWithType(tableBuilder, columnName, columnSpec);

    applyNullableConstraint(column, columnSpec);
    applyPrimaryKeyConstraint(column, columnSpec);
    applyUniqueConstraint(column, columnSpec);
    applyUnsignedConstraint(column, columnSpec);
    applyReferencesConstraint(column, columnSpec);
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
 * Checks if transaction is SQLite
 * @param {import('knex').Knex.Transaction} transaction
 * @returns {boolean}
 */
function isSQLiteTransaction(transaction) {
    return DatabaseInfo.isSQLite(transaction);
}

/**
 * Checks if transaction is MySQL
 * @param {import('knex').Knex.Transaction} transaction
 * @returns {boolean}
 */
function isMySQLTransaction(transaction) {
    return DatabaseInfo.isMySQL(transaction);
}

/**
 * Processes SQL query for MySQL with algorithm option
 * @param {string} sql
 * @param {object} options
 * @returns {string}
 */
function processMySQLQuery(sql, options = {}) {
    let processedSql = sql.replace(/;\s*$/, '');
    if (options?.algorithm !== 'auto') {
        const algorithm = options?.algorithm || 'copy';
        processedSql += `, algorithm=${algorithm}`;
    }
    return processedSql;
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

    if (isSQLiteTransaction(transaction)) {
        await addColumnBuilder;
        return;
    }

    for (const sqlQuery of addColumnBuilder.toSQL()) {
        let sql = sqlQuery.sql;

        if (isMySQLTransaction(transaction)) {
            sql = processMySQLQuery(sql, options);
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
    if (hasReferencesSpec(columnSpec)) {
        const [toTable, toColumn] = columnSpec.references.split('.');
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }

    const dropColumnBuilder = transaction.schema.table(tableName, function (table) {
        table.dropColumn(column);
    });

    if (isSQLiteTransaction(transaction)) {
        await dropColumnBuilder;
        return;
    }

    for (const sqlQuery of dropColumnBuilder.toSQL()) {
        let sql = sqlQuery.sql;

        if (isMySQLTransaction(transaction)) {
            sql = processMySQLQuery(sql, options);
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

    if (isMySQLTransaction(transaction)) {
        return await transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return await transaction.schema.table(tableName, function (table) {
        table.renameColumn(from, to);
    });
}

/**
 * Checks if error code indicates index already exists
 * @param {string} errorCode
 * @returns {boolean}
 */
function isIndexAlreadyExistsError(errorCode) {
    return errorCode === 'SQLITE_ERROR' || errorCode === 'ER_DUP_KEYNAME';
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
        if (isIndexAlreadyExistsError(err.code)) {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if error code indicates constraint does not exist
 * @param {string} errorCode
 * @returns {boolean}
 */
function isConstraintDoesNotExistError(errorCode) {
    return errorCode === 'SQLITE_ERROR' || errorCode === 'ER_CANT_DROP_FIELD_OR_KEY';
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
        if (isConstraintDoesNotExistError(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if error code indicates unique constraint already exists
 * @param {string} errorCode
 * @returns {boolean}
 */
function isUniqueConstraintAlreadyExistsError(errorCode) {
    return errorCode === 'SQLITE_ERROR' || errorCode === 'ER_DUP_KEYNAME';
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
        if (isUniqueConstraintAlreadyExistsError(err.code)) {
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

        return await transaction.schema.table(tableName, function (table) {
            table.dropUnique(columns);
        });
    } catch (err) {
        if (isConstraintDoesNotExistError(err.code)) {
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
    if (!isSQLiteTransaction(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasForeignSQLite3)
        });
    }

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);

    const hasForeignKey = foreignKeys.some(foreignKey => foreignKey.table === toTable && foreignKey.from === fromColumn && foreignKey.to === toColumn);

    return hasForeignKey;
}

/**
 * Checks if error code indicates foreign key already exists
 * @param {string} errorCode
 * @returns {boolean}
 */
function isForeignKeyAlreadyExistsError(errorCode) {
    return errorCode === 'ER_DUP_KEY' || errorCode === 'ER_FK_DUP_KEY' || errorCode === 'ER_FK_DUP_NAME';
}

/**
 * Builds foreign key with delete behavior
 * @param {import('knex').knex.TableBuilder} table
 * @param {string} fromColumn
 * @param {string} toTableColumn
 * @param {boolean} cascadeDelete
 * @param {boolean} setNullDelete
 * @returns {import('knex').knex.ForeignKeyBuilder}
 */
function buildForeignKeyWithDeleteBehavior(table, fromColumn, toTableColumn, cascadeDelete, setNullDelete) {
    if (cascadeDelete) {
        return table.foreign(fromColumn).references(toTableColumn).onDelete('CASCADE');
    }
    if (setNullDelete) {
        return table.foreign(fromColumn).references(toTableColumn).onDelete('SET NULL');
    }
    return table.foreign(fromColumn).references(toTableColumn);
}

/**
 * Applies constraint name to foreign key
 * @param {import('knex').knex.ForeignKeyBuilder} fkBuilder
 * @param {string} constraintName
 */
function applyForeignKeyConstraintName(fkBuilder, constraintName) {
    if (constraintName) {
        fkBuilder.withKeyName(constraintName);
    }
}

/**
 * Disables foreign key checks on SQLite
 * @param {import('knex').Knex} transaction
 * @returns {Promise<boolean>}
 */
async function disableSQLiteForeignKeyChecks(transaction) {
    const foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
    if (foreignKeysEnabled[0].foreign_keys) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
        return true;
    }
    return false;
}

/**
 * Re-enables foreign key checks on SQLite
 * @param {boolean} shouldEnable
 */
async function enableSQLiteForeignKeyChecks(shouldEnable) {
    if (shouldEnable) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
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
    if (isSQLiteTransaction(transaction)) {
        const foreignKeyExists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (foreignKeyExists) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
    }

    try {
        logging.info(`Adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        let shouldReenableForeignKeys = false;
        if (isSQLiteTransaction(transaction)) {
            shouldReenableForeignKeys = await disableSQLiteForeignKeyChecks(transaction);
        }

        await transaction.schema.table(fromTable, function (table) {
            const fkBuilder = buildForeignKeyWithDeleteBehavior(table, fromColumn, `${toTable}.${toColumn}`, cascadeDelete, setNullDelete);
            applyForeignKeyConstraintName(fkBuilder, constraintName);
        });

        if (isSQLiteTransaction(transaction)) {
            await enableSQLiteForeignKeyChecks(shouldReenableForeignKeys);
        }
    } catch (err) {
        if (isForeignKeyAlreadyExistsError(err.code)) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
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
    if (isSQLiteTransaction(transaction)) {
        const foreignKeyExists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (!foreignKeyExists) {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
    }

    try {
        logging.info(`Dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        let shouldReenableForeignKeys = false;
        if (isSQLiteTransaction(transaction)) {
            shouldReenableForeignKeys = await disableSQLiteForeignKeyChecks(transaction);
        }

        await transaction.schema.table(fromTable, function (table) {
            table.dropForeign(fromColumn, constraintName);
        });

        if (isSQLiteTransaction(transaction)) {
            await enableSQLiteForeignKeyChecks(shouldReenableForeignKeys);
        }
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
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
    if (!isSQLiteTransaction(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasPrimaryKeySQLiteError)
        });
    }

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    const tablePrimaryKey = rawConstraints.find(c => c.origin === 'pk');

    return tablePrimaryKey;
}

/**
 * Checks if error code indicates primary key already exists
 * @param {string} errorCode
 * @returns {boolean}
 */
function isPrimaryKeyAlreadyExistsError(errorCode) {
    return errorCode === 'ER_MULTIPLE_PRI_KEY';
}

/**
 * Adds an primary key index to a table over the given columns.
 *
 * @param {string} tableName - name of the table to add primaykey  constraint to
 * @param {string|string[]} columns - column(s) to form primary key constraint with
 * @param {import('knex').Knex} [transaction] - connection object containing knex reference
 */
async function addPrimaryKey(tableName, columns, transaction = db.knex) {
    if (isSQLiteTransaction(transaction)) {
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
        if (isPrimaryKeyAlreadyExistsError(err.code)) {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

/**
 * Checks if table spec has indexes
 * @param {object} tableSpec
 * @returns {boolean}
 */
function hasIndexesSpec(tableSpec) {
    return tableSpec['@@INDEXES@@'];
}

/**
 * Checks if table spec has unique constraints
 * @param {object} tableSpec
 * @returns {boolean}
 */
function hasUniqueConstraintsSpec(tableSpec) {
    return tableSpec['@@UNIQUE_CONSTRAINTS@@'];
}

/**
 * Checks if column name is a special metadata key
 * @param {string} column
 * @returns {boolean}
 */
function isSpecialMetadataKey(column) {
    return column.startsWith('@@');
}

/**
 * Adds indexes to table
 * @param {import('knex').knex.TableBuilder} t
 * @param {object} tableSpec
 */
function addIndexesToTable(t, tableSpec) {
    if (hasIndexesSpec(tableSpec)) {
        tableSpec['@@INDEXES@@'].forEach(index => t.index(index));
    }
}

/**
 * Adds unique constraints to table
 * @param {import('knex').knex.TableBuilder} t
 * @param {object} tableSpec
 */
function addUniqueConstraintsToTable(t, tableSpec) {
    if (hasUniqueConstraintsSpec(tableSpec)) {
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
            .filter(column => !isSpecialMetadataKey(column))
            .forEach(column => addTableColumn(table, t, column, tableSpec[column]));

        addIndexesToTable(t, tableSpec);
        addUniqueConstraintsToTable(t, tableSpec);
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
 * Gets client type from transaction
 * @param {import('knex').Knex} transaction
 * @returns {string}
 */
function getClientType(transaction) {
    return transaction.client.config.client;
}

/**
 * Processes SQLite table list response
 * @param {Array} response
 * @returns {Array}
 */
function processSQLiteTableList(response) {
    return _.reject(_.map(response, 'tbl_name'), name => name === 'sqlite_sequence');
}

/**
 * Processes MySQL table list response
 * @param {Array} response
 * @returns {Array}
 */
function processMySQLTableList(response) {
    return _.flatten(_.map(response[0], entry => _.values(entry)));
}

/**
 * @param {import('knex').Knex} [transaction] - connection to the DB
 */
async function getTables(transaction = db.knex) {
    const client = getClientType(transaction);

    if (client === 'sqlite3') {
        const response = await transaction.raw('select * from sqlite_master where type = "table"');
        return processSQLiteTableList(response);
    }

    if (client === 'mysql2') {
        const response = await transaction.raw('show tables');
        return processMySQLTableList(response);
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * Processes SQLite index list response
 * @param {Array} response
 * @returns {Array}
 */
function processSQLiteIndexList(response) {
    return _.flatten(_.map(response, 'name'));
}

/**
 * Processes MySQL index list response
 * @param {Array} response
 * @returns {Array}
 */
function processMySQLIndexList(response) {
    return _.flatten(_.map(response[0], 'Key_name'));
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction] - connection to the DB
 */
async function getIndexes(table, transaction = db.knex) {
    const client = getClientType(transaction);

    if (client === 'sqlite3') {
        const response = await transaction.raw(`pragma index_list("${table}")`);
        return processSQLiteIndexList(response);
    }

    if (client === 'mysql2') {
        const response = await transaction.raw(`SHOW INDEXES from ${table}`);
        return processMySQLIndexList(response);
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * Processes SQLite column list response
 * @param {Array} response
 * @returns {Array}
 */
function processSQLiteColumnList(response) {
    return _.flatten(_.map(response, 'name'));
}

/**
 * Processes MySQL column list response
 * @param {Array} response
 * @returns {Array}
 */
function processMySQLColumnList(response) {
    return _.flatten(_.map(response[0], 'Field'));
}

/**
 * @param {string} table
 * @param {import('knex').Knex} [transaction] - connection to the DB
 */
async function getColumns(table, transaction = db.knex) {
    const client = getClientType(transaction);

    if (client === 'sqlite3') {
        const response = await transaction.raw(`pragma table_info("${table}")`);
        return processSQLiteColumnList(response);
    }

    if (client === 'mysql2') {
        const response = await transaction.raw(`SHOW COLUMNS from ${table}`);
        return processMySQLColumnList(response);
    }

    return Promise.reject(tpl(messages.noSupportForDatabase, {client: client}));
}

/**
 * Checks if database is in correct state
 * @param {boolean} hasColumn
 * @param {Function} dbIsInCorrectState
 * @returns {boolean}
 */
function isInCorrectState(hasColumn, dbIsInCorrectState) {
    return dbIsInCorrectState(hasColumn);
}

/**
 * Logs operation status
 * @param {boolean} isCorrect
 * @param {string} operationVerb
 * @param {string} table
 * @param {string} column
 */
function logOperationStatus(isCorrect, operationVerb, table, column) {
    if (isCorrect) {
        logging.warn(`${operationVerb} ${table}.${column} column - skipping as table is correct`);
    } else {
        logging.info(`${operationVerb} ${table}.${column} column`);
    }
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
        const correct = isInCorrectState(hasColumn, dbIsInCorrectState);

        logOperationStatus(correct, operationVerb, table, column);

        if (!correct) {
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