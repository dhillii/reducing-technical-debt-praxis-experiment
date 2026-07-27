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
    if (isTextColumnWithFieldtype(columnSpec)) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    } else if (isStringColumnWithMaxlength(columnSpec)) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.maxlength);
    } else {
        return tableBuilder[columnSpec.type](columnName);
    }
}

/**
 * Checks if a column spec represents a text column with a fieldtype.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isTextColumnWithFieldtype(columnSpec) {
    return columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype');
}

/**
 * Checks if a column spec represents a string column with a maxlength.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isStringColumnWithMaxlength(columnSpec) {
    return columnSpec.type === 'string' && Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength');
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
 * Checks if a column spec has a nullable option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isNullable(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true;
}

/**
 * Checks if a column spec has a primary option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isPrimary(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true;
}

/**
 * Checks if a column spec has a unique option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnique(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique;
}

/**
 * Checks if a column spec has an unsigned option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnsigned(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned;
}

/**
 * Checks if a column spec has a references option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasReferences(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'references');
}

/**
 * Checks if a column spec has a constraintName option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasConstraintName(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName');
}

/**
 * Checks if a column spec has a cascadeDelete option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasCascadeDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true;
}

/**
 * Checks if a column spec has a setNullDelete option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasSetNullDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true;
}

/**
 * Checks if a column spec has a defaultTo option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasDefaultTo(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo');
}

/**
 * Checks if a column spec has an index option.
 *
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasIndex(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true;
}