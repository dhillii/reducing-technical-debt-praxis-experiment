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

// Column specification helpers
const columnSpecHelpers = {
    hasProperty: (spec, prop) => Object.prototype.hasOwnProperty.call(spec, prop),
    
    getColumnType(spec, columnName) {
        if (spec.type === 'text' && this.hasProperty(spec, 'fieldtype')) {
            return {type: spec.type, args: [columnName, spec.fieldtype]};
        }
        if (spec.type === 'string') {
            const maxlength = this.hasProperty(spec, 'maxlength') ? spec.maxlength : 191;
            return {type: spec.type, args: [columnName, maxlength]};
        }
        return {type: spec.type, args: [columnName]};
    },

    applyColumnModifiers(column, spec) {
        const modifiers = [
            {check: 'nullable', apply: (col, val) => val === true ? col.nullable() : col.nullable(false)},
            {check: 'primary', apply: (col) => col.primary()},
            {check: 'unique', apply: (col) => col.unique()},
            {check: 'unsigned', apply: (col) => col.unsigned()},
            {check: 'references', apply: (col, val) => col.references(val)},
            {check: 'constraintName', apply: (col, val) => col.withKeyName(val)},
            {check: 'index', apply: (col) => col.index()}
        ];

        modifiers.forEach(({check, apply}) => {
            if (this.hasProperty(spec, check)) {
                apply(column, spec[check]);
            }
        });

        if (this.hasProperty(spec, 'cascadeDelete') && spec.cascadeDelete === true) {
            column.onDelete('CASCADE');
        } else if (this.hasProperty(spec, 'setNullDelete') && spec.setNullDelete === true) {
            column.onDelete('SET NULL');
        }

        if (this.hasProperty(spec, 'defaultTo')) {
            column.defaultTo(spec.defaultTo);
        }
    }
};

function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const {type, args} = columnSpecHelpers.getColumnType(columnSpec, columnName);
    const column = tableBuilder[type](...args);
    columnSpecHelpers.applyColumnModifiers(column, columnSpec);
}

function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, (table) => {
        table.setNullable(column);
    });
}

function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, (table) => {
        table.dropNullable(column);
    });
}

async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const addColumnBuilder = transaction.schema.table(tableName, (table) => {
        addTableColumn(tableName, table, column, columnSpec);
    });

    if (DatabaseInfo.isSQLite(transaction)) {
        await addColumnBuilder;
        return;
    }

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

async function dropColumn(tableName, column, transaction = db.knex, columnSpec = {}, options = {}) {
    if (columnSpecHelpers.hasProperty(columnSpec, 'references')) {
        const [toTable, toColumn] = columnSpec.references.split('.');
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }

    const dropColumnBuilder = transaction.schema.table(tableName, (table) => {
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

async function renameColumn(tableName, from, to, transaction = db.knex) {
    logging.info(`Renaming column '${from}' to '${to}' in table '${tableName}'`);

    if (DatabaseInfo.isMySQL(transaction)) {
        return await transaction.raw(`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${from}\` TO \`${to}\`;`);
    }

    return await transaction.schema.table(tableName, (table) => {
        table.renameColumn(from, to);
    });
}

async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, (table) => {
            table.index(columns);
        });
    } catch (err) {
        if (CONSTRAINT_ERROR_CODES.EXISTS.includes(err.code)) {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

async function dropIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, (table) => {
            table.dropIndex(columns);
        });
    } catch (err) {
        if (CONSTRAINT_ERROR_CODES.NOT_EXISTS.includes(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, (table) => {
            table.unique(columns);
        });
    } catch (err) {
        if (CONSTRAINT_ERROR_CODES.EXISTS.includes(err.code)) {
            logging.warn(`Constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

async function dropUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, (table) => {
            table.dropUnique(columns);
        });
    } catch (err) {
        if (CONSTRAINT_ERROR_CODES.NOT_EXISTS.includes(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

async function hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction = db.knex}) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasForeignSQLite3)
        });
    }

    const foreignKeys = await transaction.raw(`PRAGMA foreign_key_list('${fromTable}');`);
    return foreignKeys.some(fk => fk.table === toTable && fk.from === fromColumn && fk.to === toColumn);
}

async function manageSQLiteForeignKeys(transaction, enable) {
    const result = await db.knex.raw('PRAGMA foreign_keys;');
    const isEnabled = result[0].foreign_keys;
    
    if (enable && !isEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = ON;');
    } else if (!enable && isEnabled) {
        await db.knex.raw('PRAGMA foreign_keys = OFF;');
    }
    
    return isEnabled;
}

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

        let foreignKeysWereEnabled;
        if (DatabaseInfo.isSQLite(transaction)) {
            foreignKeysWereEnabled = await manageSQLiteForeignKeys(transaction, false);
        }

        await transaction.schema.table(fromTable, (table) => {
            let fkBuilder = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);

            if (cascadeDelete) {
                fkBuilder.onDelete('CASCADE');
            } else if (setNullDelete) {
                fkBuilder.onDelete('SET NULL');
            }

            if (constraintName) {
                fkBuilder.withKeyName(constraintName);
            }
        });

        if (DatabaseInfo.isSQLite(transaction) && foreignKeysWereEnabled) {
            await manageSQLiteForeignKeys(transaction, true);
        }
    } catch (err) {
        if (CONSTRAINT_ERROR_CODES.FK_EXISTS.includes(err.code)) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
    }
}

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

        let foreignKeysWereEnabled;
        if (DatabaseInfo.isSQLite(transaction)) {
            foreignKeysWereEnabled = await manageSQLiteForeignKeys(transaction, false);
        }

        await transaction.schema.table(fromTable, (table) => {
            table.dropForeign(fromColumn, constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction) && foreignKeysWereEnabled) {
            await manageSQLiteForeignKeys(transaction, true);
        }
    } catch (err) {
        if (err.code === ERROR_CODES.ER_CANT_DROP_FIELD_OR_KEY) {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
        throw err;
    }
}

async function hasPrimaryKeySQLite(tableName, transaction = db.knex) {
    if (!DatabaseInfo.isSQLite(transaction)) {
        throw new errors.InternalServerError({
            message: tpl(messages.hasPrimaryKeySQLiteError)
        });
    }

    const rawConstraints = await transaction.raw(`PRAGMA index_list('${tableName}');`);
    return rawConstraints.find(c => c.origin === 'pk');
}

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
        return await transaction.schema.table(tableName, (table) => {
            table.primary(columns);
        });
    } catch (err) {
        if (err.code === ERROR_CODES.ER_MULTIPLE_PRI_KEY) {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, (t) => {
        Object.keys(tableSpec)
            .filter(column => !column.startsWith('@@'))
            .forEach(column => addTableColumn(table, t, column, tableSpec[column]));

        if (tableSpec['@@INDEXES@@']) {
            tableSpec['@@INDEXES@@'].forEach(index => t.index(index));
        }
        if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
            tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(unique => t.unique(unique));
        }
    });
}

function deleteTable(table, transaction = db.knex) {
    return