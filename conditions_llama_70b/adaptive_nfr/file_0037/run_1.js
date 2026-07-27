/**
 * @param {string} tableName
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} [columnSpec]
 */
function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    let column;

    if (!isTextWithFieldtype(columnSpec)) {
        if (!isStringWithMaxLength(columnSpec)) {
            column = tableBuilder[columnSpec.type](columnName);
        } else {
            column = tableBuilder[columnSpec.type](columnName, columnSpec.maxlength);
        }
    } else {
        column = tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }

    applyColumnModifiers(tableBuilder, column, columnSpec);
}

/**
 * Checks if a column spec is for a text type with a fieldtype.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isTextWithFieldtype(columnSpec) {
    return columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype');
}

/**
 * Checks if a column spec is for a string type with a maxlength.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isStringWithMaxLength(columnSpec) {
    return columnSpec.type === 'string' && Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength');
}

/**
 * Applies column modifiers to a column.
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {object} column
 * @param {object} columnSpec
 */
function applyColumnModifiers(tableBuilder, column, columnSpec) {
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
 * Checks if a column spec has a nullable property set to true.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isNullable(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true;
}

/**
 * Checks if a column spec has a primary property set to true.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isPrimary(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true;
}

/**
 * Checks if a column spec has a unique property set to true.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnique(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique;
}

/**
 * Checks if a column spec has an unsigned property set to true.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isUnsigned(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned;
}

/**
 * Checks if a column spec has a references property.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasReferences(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'references');
}

/**
 * Checks if a column spec has a constraintName property.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasConstraintName(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName');
}

/**
 * Checks if a column spec has a cascadeDelete property set to true.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasCascadeDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true;
}

/**
 * Checks if a column spec has a setNullDelete property set to true.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasSetNullDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true;
}

/**
 * Checks if a column spec has a defaultTo property.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasDefaultTo(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo');
}

/**
 * Checks if a column spec has an index property set to true.
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasIndex(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true;
}