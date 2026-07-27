/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = createColumn(tableBuilder, columnName, columnSpec);
    configureColumnOptions(column, columnSpec);
}

/**
 * Creates a column based on the provided column spec.
 * 
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').ColumnBuilder}
 */
function createColumn(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (columnSpec.type === 'string') {
        return createStringColumn(tableBuilder, columnName, columnSpec);
    } else {
        return tableBuilder[columnSpec.type](columnName);
    }
}

/**
 * Creates a string column with the specified length.
 * 
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').ColumnBuilder}
 */
function createStringColumn(tableBuilder, columnName, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.maxlength);
    } else {
        return tableBuilder[columnSpec.type](columnName, 191);
    }
}

/**
 * Configures the column options based on the provided column spec.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureColumnOptions(column, columnSpec) {
    configureNullability(column, columnSpec);
    configurePrimaryKey(column, columnSpec);
    configureUnique(column, columnSpec);
    configureUnsigned(column, columnSpec);
    configureReferences(column, columnSpec);
    configureConstraintName(column, columnSpec);
    configureDeleteOptions(column, columnSpec);
    configureDefault(column, columnSpec);
    configureIndex(column, columnSpec);
}

/**
 * Configures the nullability of the column.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureNullability(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }
}

/**
 * Configures the primary key of the column.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configurePrimaryKey(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true) {
        column.primary();
    }
}

/**
 * Configures the unique constraint of the column.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureUnique(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique) {
        column.unique();
    }
}

/**
 * Configures the unsigned option of the column.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureUnsigned(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned) {
        column.unsigned();
    }
}

/**
 * Configures the references of the column.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureReferences(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }
}

/**
 * Configures the constraint name of the column.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureConstraintName(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * Configures the delete options of the column.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureDeleteOptions(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }
}

/**
 * Configures the default value of the column.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureDefault(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

/**
 * Configures the index of the column.
 * 
 * @param {import('knex').ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureIndex(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true) {
        column.index();
    }
}