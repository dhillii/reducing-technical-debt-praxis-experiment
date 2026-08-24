function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = buildColumn(tableBuilder, columnName, columnSpec);
    applyColumnModifiers(column, columnSpec);
}

function buildColumn(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && columnSpec.fieldtype) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        const maxlength = columnSpec.maxlength ?? 191;
        return tableBuilder[columnSpec.type](columnName, maxlength);
    }
    return tableBuilder[columnSpec.type](columnName);
}

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

function applyNullable(column, columnSpec) {
    if (columnSpec.nullable === true) {
        column.nullable();
    } else {
        column.nullable(false);
    }
}

function applyPrimary(column, columnSpec) {
    if (columnSpec.primary === true) {
        column.primary();
    }
}

function applyUnique(column, columnSpec) {
    if (columnSpec.unique) {
        column.unique();
    }
}

function applyUnsigned(column, columnSpec) {
    if (columnSpec.unsigned) {
        column.unsigned();
    }
}

function applyReferences(column, columnSpec) {
    if (columnSpec.references) {
        column.references(columnSpec.references);
    }
}

function applyKeyName(column, columnSpec) {
    if (columnSpec.constraintName) {
        column.withKeyName(columnSpec.constraintName);
    }
}

function applyOnDelete(column, columnSpec) {
    if (columnSpec.cascadeDelete === true) {
        column.onDelete('CASCADE');
    } else if (columnSpec.setNullDelete === true) {
        column.onDelete('SET NULL');
    }
}

function applyDefaultTo(column, columnSpec) {
    if (columnSpec.defaultTo !== undefined) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

function applyIndex(column, columnSpec) {
    if (columnSpec.index === true) {
        column.index();
    }
}