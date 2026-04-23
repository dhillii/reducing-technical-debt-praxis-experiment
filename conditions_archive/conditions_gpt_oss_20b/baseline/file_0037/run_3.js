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

function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const { type, fieldtype, maxlength } = columnSpec;
    let column;

    if (type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        column = tableBuilder[type](columnName, fieldtype);
    } else if (type === 'string') {
        const length = Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength') ? maxlength : 191;
        column = tableBuilder[type](columnName, length);
    } else {
        column = tableBuilder[type](columnName);
    }

    const actions = {
        nullable: (col, val) => (val ? col.nullable() : col.nullable(false)),
        primary: col => col.primary(),
        unique: col => col.unique(),
        unsigned: col => col.unsigned(),
        references: (col, val) => col.references(val),
        constraintName: (col, val) => col.withKeyName(val),
        cascadeDelete: col => col.onDelete('CASCADE'),
        setNullDelete: col => col.onDelete('SET NULL'),
        defaultTo: (col, val) => col.defaultTo(val),
        index: col => col.index()
    };

    Object.entries(columnSpec).forEach(([key, value]) => {
        if (actions[key]) {
            actions[key](column, value);
        }
    });
}

function setNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, table => {
        table.setNullable(column);
    });
}

function dropNullable(tableName, column, transaction = db.knex) {
    return transaction.schema.table(tableName, table => {
        table.dropNullable(column);
    });
}

async function addColumn(tableName, column, transaction = db.knex, columnSpec, options = {}) {
    const addColumnBuilder = transaction.schema.table(tableName, table => {
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
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        const [toTable, toColumn] = columnSpec.references.split('.');
        await dropForeign({fromTable: tableName, fromColumn: column, toTable, toColumn, constraintName: columnSpec.constraintName, transaction});
    }

    const dropColumnBuilder = transaction.schema.table(tableName, table => {
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

    return await transaction.schema.table(tableName, table => {
        table.renameColumn(from, to);
    });
}

async function addIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.index(columns);
        });
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_DUP_KEYNAME'].includes(err.code)) {
            logging.warn(`Index for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

async function dropIndex(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping index for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.dropIndex(columns);
        });
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'].includes(err.code)) {
            logging.warn(`Constraint for '${columns}' does not exist for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

async function addUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Adding unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.unique(columns);
        });
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_DUP_KEYNAME'].includes(err.code)) {
            logging.warn(`Constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
        throw err;
    }
}

async function dropUnique(tableName, columns, transaction = db.knex) {
    try {
        logging.info(`Dropping unique constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
            table.dropUnique(columns);
        });
    } catch (err) {
        if (['SQLITE_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY'].includes(err.code)) {
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

async function addForeign({fromTable, fromColumn, toTable, toColumn, constraintName, cascadeDelete = false, setNullDelete = false, transaction = db.knex}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (exists) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
    }

    try {
        logging.info(`Adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        let foreignKeysEnabled;
        if (DatabaseInfo.isSQLite(transaction)) {
            foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
            if (foreignKeysEnabled[0].foreign_keys) {
                await db.knex.raw('PRAGMA foreign_keys = OFF;');
            }
        }

        await transaction.schema.table(fromTable, table => {
            let fk = table.foreign(fromColumn).references(`${toTable}.${toColumn}`);
            if (cascadeDelete) fk.onDelete('CASCADE');
            else if (setNullDelete) fk.onDelete('SET NULL');
            if (constraintName) fk.withKeyName(constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction) && foreignKeysEnabled[0].foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
    } catch (err) {
        if (['ER_DUP_KEY', 'ER_FK_DUP_KEY', 'ER_FK_DUP_NAME'].includes(err.code)) {
            logging.warn(`Skipped adding foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - already exists`);
            return;
        }
        throw err;
    }
}

async function dropForeign({fromTable, fromColumn, toTable, toColumn, constraintName, transaction = db.knex}) {
    if (DatabaseInfo.isSQLite(transaction)) {
        const exists = await hasForeignSQLite({fromTable, fromColumn, toTable, toColumn, transaction});
        if (!exists) {
            logging.warn(`Skipped dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn} - does not exist`);
            return;
        }
    }

    try {
        logging.info(`Dropping foreign key from ${fromTable}.${fromColumn} to ${toTable}.${toColumn}`);

        let foreignKeysEnabled;
        if (DatabaseInfo.isSQLite(transaction)) {
            foreignKeysEnabled = await db.knex.raw('PRAGMA foreign_keys;');
            if (foreignKeysEnabled[0].foreign_keys) {
                await db.knex.raw('PRAGMA foreign_keys = OFF;');
            }
        }

        await transaction.schema.table(fromTable, table => {
            table.dropForeign(fromColumn, constraintName);
        });

        if (DatabaseInfo.isSQLite(transaction) && foreignKeysEnabled[0].foreign_keys) {
            await db.knex.raw('PRAGMA foreign_keys = ON;');
        }
    } catch (err) {
        if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
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
        const exists = await hasPrimaryKeySQLite(tableName, transaction);
        if (exists) {
            logging.warn(`Primary key constraint for '${columns}' already exists for table '${tableName}'`);
            return;
        }
    }

    try {
        logging.info(`Adding primary key constraint for '${columns}' in table '${tableName}'`);
        return await transaction.schema.table(tableName, table => {
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

function createTable(table, transaction = db.knex, tableSpec = schema[table]) {
    return transaction.schema.createTable(table, t => {
        Object.keys(tableSpec)
            .filter(col => !col.startsWith('@@'))
            .forEach(col => addTableColumn(table, t, col, tableSpec[col]));

        if (tableSpec['@@INDEXES@@']) {
            tableSpec['@@INDEXES@@'].forEach(idx => t.index(idx));
        }
        if (tableSpec['@@UNIQUE_CONSTRAINTS@@']) {
            tableSpec['@@UNIQUE_CONSTRAINTS@@'].forEach(uniq => t.unique(uniq));
        }
    });
}

function deleteTable(table, transaction = db.knex) {
    return transaction.schema.dropTableIfExists(table);
}

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

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

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

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
}

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

    return Promise.reject(tpl(messages.noSupportForDatabase, {client}));
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