/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    let column;

    column = createColumn(tableBuilder, columnName, columnSpec);
    configureColumn(column, columnSpec);
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

function configureColumn(column, columnSpec) {
    configureNullability(column, columnSpec);
    configurePrimary(column, columnSpec);
    configureUnique(column, columnSpec);
    configureUnsigned(column, columnSpec);
    configureReferences(column, columnSpec);
    configureConstraintName(column, columnSpec);
    configureDeleteAction(column, columnSpec);
    configureDefault(column, columnSpec);
    configureIndex(column, columnSpec);
}

function configureNullability(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'nullable')) {
        column.nullable(columnSpec.nullable);
    } else {
        column.nullable(false);
    }
}

function configurePrimary(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary) {
        column.primary();
    }
}

function configureUnique(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique) {
        column.unique();
    }
}

function configureUnsigned(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned) {
        column.unsigned();
    }
}

function configureReferences(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'references')) {
        column.references(columnSpec.references);
    }
}

function configureConstraintName(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName')) {
        column.withKeyName(columnSpec.constraintName);
    }
}

function configureDeleteAction(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete) {
        column.onDelete('CASCADE');
    } else if (Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete) {
        column.onDelete('SET NULL');
    }
}

function configureDefault(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo')) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

function configureIndex(column, columnSpec) {
    if (Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index) {
        column.index();
    }
}