function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = buildColumn(tableName, tableBuilder, columnName, columnSpec);
    applyColumnModifiers(column, columnSpec);
}

/**
 * Builds and returns a column builder instance based on columnSpec type.
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {import('knex').knex.ColumnBuilder}
 */
function buildColumn(tableName, tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && columnSpec.fieldtype) {
        return tableBuilder.text(columnName, columnSpec.fieldtype);
    }
    if (columnSpec.type === 'string') {
        const maxlength = columnSpec.maxlength ?? 191;
        return tableBuilder.string(columnName, maxlength);
    }
    return tableBuilder[columnSpec.type](columnName);
}

/**
 * Applies non-base modifiers (nullable, primary, unique, etc.) to the column builder.
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
    applyDeleteAction(column, columnSpec);
    applyDefaultTo(column, columnSpec);
    applyIndex(column, columnSpec);
}

function applyNullable(column, columnSpec) {
    if (columnSpec.nullable) {
        column.nullable();
    } else {
        column.nullable(false);
    }
}

function applyPrimary(column, columnSpec) {
    if (columnSpec.primary) {
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

function applyDeleteAction(column, columnSpec) {
    if (columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
}

function applyDefaultTo(column, columnSpec) {
    if (columnSpec.defaultTo !== undefined) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

function applyIndex(column, columnSpec) {
    if (columnSpec.index) {
        column.index();
    }
}