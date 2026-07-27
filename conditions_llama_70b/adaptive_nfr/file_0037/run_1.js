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

    const column = createColumn(tableBuilder, columnName, columnSpec);
    applyColumnOptions(column, columnSpec);
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
    if (isTextColumn(columnSpec)) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (isStringColumn(columnSpec)) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.maxlength || 191);
    } else {
        return tableBuilder[columnSpec.type](columnName);
    }
}

/**
 * Checks if a column spec represents a text column.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isTextColumn(columnSpec) {
    return columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype');
}

/**
 * Checks if a column spec represents a string column.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isStringColumn(columnSpec) {
    return columnSpec.type === 'string';
}

/**
 * Applies column options based on the provided spec.
 *
 * @param {import('knex').knex.ColumnBuilder} column
 * @param {object} columnSpec
 */
function applyColumnOptions(column, columnSpec) {
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

    if (hasReferences(columnSpec)) {
        column.references(columnSpec.references);
    }

    if (hasConstraintName(columnSpec)) {
        column.withKeyName(columnSpec.constraintName);
    }

    if (hasCascadeDelete(columnSpec)) {
        column.onDelete('CASCADE');
    } else if (hasSetNullDelete(columnSpec)) {
        column.onDelete('SET NULL');
    }

    if (hasDefaultTo(columnSpec)) {
        column.defaultTo(columnSpec.defaultTo);
    }

    if (hasIndex(columnSpec)) {
        column.index();
    }
}

/**
 * Checks if a column spec has nullable option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isNullable(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true;
}

/**
 * Checks if a column spec has primary option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isPrimary(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true;
}

/**
 * Checks if a column spec has unique option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnique(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique;
}

/**
 * Checks if a column spec has unsigned option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnsigned(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned;
}

/**
 * Checks if a column spec has references option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasReferences(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'references');
}

/**
 * Checks if a column spec has constraint name option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasConstraintName(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName');
}

/**
 * Checks if a column spec has cascade delete option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasCascadeDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true;
}

/**
 * Checks if a column spec has set null delete option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasSetNullDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true;
}

/**
 * Checks if a column spec has default to option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasDefaultTo(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo');
}

/**
 * Checks if a column spec has index option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasIndex(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true;
}