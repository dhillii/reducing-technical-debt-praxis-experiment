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

    let column = createColumn(tableBuilder, columnName, columnSpec);
    column = applyNullability(column, columnSpec);
    column = applyPrimary(column, columnSpec);
    column = applyUnique(column, columnSpec);
    column = applyUnsigned(column, columnSpec);
    column = applyReferences(column, columnSpec);
    column = applyConstraintName(column, columnSpec);
    column = applyCascadeDelete(column, columnSpec);
    column = applySetNullDelete(column, columnSpec);
    column = applyDefaultTo(column, columnSpec);
    column = applyIndex(column, columnSpec);

    return column;
}

function createColumn(tableBuilder, columnName, columnSpec) {
    if (columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype')) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (columnSpec.type === 'string') {
        return tableBuilder[columnSpec.type](columnName, columnSpec.maxlength || 191);
    } else {
        return tableBuilder[columnSpec.type](columnName);
    }
}

function applyNullability(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true) {
        return column.nullable();
    } else {
        return column.nullable(false);
    }
}

function applyPrimary(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true) {
        return column.primary();
    }
    return column;
}

function applyUnique(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique) {
        return column.unique();
    }
    return column;
}

function applyUnsigned(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned) {
        return column.unsigned();
    }
    return column;
}

function applyReferences(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        return column.references(columnSpec.references);
    }
    return column;
}

function applyConstraintName(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName')) {
        return column.withKeyName(columnSpec.constraintName);
    }
    return column;
}

function applyCascadeDelete(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true) {
        return column.onDelete('CASCADE');
    } else if (Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true) {
        return column.onDelete('SET NULL');
    }
    return column;
}

function applySetNullDelete(column, columnSpec) {
    // handled in applyCascadeDelete
    return column;
}

function applyDefaultTo(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        return column.defaultTo(columnSpec.defaultTo);
    }
    return column;
}

function applyIndex(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true) {
        return column.index();
    }
    return column;
}