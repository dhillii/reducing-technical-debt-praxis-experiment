/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = createColumn(tableBuilder, columnName, columnSpec);
    configureColumnNullability(column, columnSpec);
    configureColumnConstraints(column, columnSpec);
    configureColumnReferences(column, columnSpec);
    configureColumnDeletionBehavior(column, columnSpec);
    configureColumnDefault(column, columnSpec);
    configureColumnIndex(column, columnSpec);
}

/**
 * Creates a column based on the provided column specification.
 *
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').knex.ColumnBuilder}
 */
function createColumn(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (columnSpec.type === 'string') {
        return columnSpec.maxlength ? tableBuilder[columnSpec.type](columnName, columnSpec.maxlength) : tableBuilder[columnSpec.type](columnName, 191);
    } else {
        return tableBuilder[columnSpec.type](columnName);
    }
}

/**
 * Configures the nullability of a column.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureColumnNullability(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable')) {
        column.nullable(columnSpec.nullable);
    } else {
        column.nullable(false);
    }
}

/**
 * Configures the constraints of a column.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureColumnConstraints(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary) {
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
 * Configures the references of a column.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureColumnReferences(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * Configures the deletion behavior of a column.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureColumnDeletionBehavior(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
}

/**
 * Configures the default value of a column.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureColumnDefault(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

/**
 * Configures the index of a column.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureColumnIndex(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index) {
        column.index();
    }
}