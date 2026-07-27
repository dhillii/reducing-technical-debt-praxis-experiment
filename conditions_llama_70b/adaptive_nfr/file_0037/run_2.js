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
    applyColumnModifiers(column, columnSpec);
    applyColumnConstraints(column, columnSpec);
    applyColumnReferences(column, columnSpec);
    applyColumnDefaults(column, columnSpec);
    applyColumnIndexes(column, columnSpec);
}

/**
 * Creates a column based on the provided spec.
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
        return tableBuilder[columnSpec.type](columnName, columnSpec.maxlength || 191);
    } else {
        return tableBuilder[columnSpec.type](columnName);
    }
}

/**
 * Applies column modifiers.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnModifiers(column, columnSpec) {
    if (isNullable(columnSpec)) {
        column.nullable();
    } else {
        column.nullable(false);
    }

    if (isPrimary(columnSpec)) {
        column.primary();
    }

    if (isUnique(columnSpec)) {
        column.unique();
    }

    if (isUnsigned(columnSpec)) {
        column.unsigned();
    }
}

/**
 * Checks if a column is nullable.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isNullable(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true;
}

/**
 * Checks if a column is primary.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isPrimary(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true;
}

/**
 * Checks if a column is unique.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnique(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique;
}

/**
 * Checks if a column is unsigned.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnsigned(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned;
}

/**
 * Applies column constraints.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnConstraints(column, columnSpec) {
    if (hasReferences(columnSpec)) {
        column.references(columnSpec.references);
    }

    if (hasConstraintName(columnSpec)) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * Checks if a column has references.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasReferences(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'references');
}

/**
 * Checks if a column has a constraint name.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasConstraintName(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName');
}

/**
 * Applies column references.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnReferences(column, columnSpec) {
    if (hasCascadeDelete(columnSpec)) {
        column.onDelete('CASCADE');
    } else if (hasSetNullDelete(columnSpec)) {
        column.onDelete('SET NULL');
    }
}

/**
 * Checks if a column has cascade delete.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasCascadeDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true;
}

/**
 * Checks if a column has set null delete.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasSetNullDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true;
}

/**
 * Applies column defaults.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnDefaults(column, columnSpec) {
    if (hasDefaultTo(columnSpec)) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

/**
 * Checks if a column has a default value.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasDefaultTo(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo');
}

/**
 * Applies column indexes.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnIndexes(column, columnSpec) {
    if (hasIndex(columnSpec)) {
        column.index();
    }
}

/**
 * Checks if a column has an index.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasIndex(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true;
}