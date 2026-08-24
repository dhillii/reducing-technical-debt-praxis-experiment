function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    let column;

    // creation distinguishes between text with fieldtype, string with maxlength and all others
    if (columnSpec.type === 'text' && columnSpec.fieldtype) {
        column = tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (columnSpec.type === 'string') {
        column = tableBuilder[columnSpec.type](columnName, columnSpec.maxlength || 191);
    } else {
        column = tableBuilder[columnSpec.type](columnName);
    }

    if (columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }

    if (columnSpec.primary === true) {
        column.primary();
    }
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

    if (columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (columnSpec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }

    if (columnSpec.defaultTo !== undefined) {
        column.defaultTo(columnSpec.defaultTo);
    }
    if (columnSpec.index === true) {
        column.index();
    }
}