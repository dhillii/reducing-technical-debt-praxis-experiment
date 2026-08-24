function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = buildColumn(tableName, tableBuilder, columnName, columnSpec);
    configureColumn(column, columnSpec);
}

/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').knex.ColumnBuilder}
 */
function buildColumn(tableName, tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        if (Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength')) {
            return tableBuilder[columnSpec.type](columnName, columnSpec.maxlength);
        }
        return tableBuilder[columnSpec.type](columnName, 191);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function configureColumn(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable')) {
        column.nullable(columnSpec.nullable);
    } else {
        column.nullable(false);
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary) {
        column.primary();
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique) {
        column.unique();
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned) {
        column.unsigned();
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }

    if (Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index) {
        column.index();
    }
}