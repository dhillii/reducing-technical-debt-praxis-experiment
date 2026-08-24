function addTableColumn(tableName, tableBuilder, columnName, columnSpec = schema[tableName][columnName]) {
    const column = createColumn(tableBuilder, columnName, columnSpec);

    applyCommonColumnProperties(column, columnSpec);
}

/**
 * @param {import('knex').knex.TableBuilder} tableBuilder
 * @param {string} columnName
 * @param {object} columnSpec
 * @returns {object} The column builder instance
 */
function createColumn(tableBuilder, columnName, columnSpec) {
    if (isTextWithFieldtype(columnSpec)) {
        return tableBuilder[columnSpec.type](columnName, columnSpec.fieldtype);
    }

    if (isStringType(columnSpec)) {
        if (hasMaxlength(columnSpec)) {
            return tableBuilder[columnSpec.type](columnName, columnSpec.maxlength);
        }
        return tableBuilder[columnSpec.type](columnName, 191);
    }

    return tableBuilder[columnSpec.type](columnName);
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isTextWithFieldtype(columnSpec) {
    return columnSpec.type === 'text' && Object.prototype.hasOwnProperty.call(columnSpec, 'fieldtype');
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function isStringType(columnSpec) {
    return columnSpec.type === 'string';
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasMaxlength(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'maxlength');
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyCommonColumnProperties(column, columnSpec) {
    applyNullableProperty(column, columnSpec);
    applyPrimaryKeyProperty(column, columnSpec);
    applyUniqueProperty(column, columnSpec);
    applyUnsignedProperty(column, columnSpec);
    applyReferencesProperty(column, columnSpec);
    applyConstraintNameProperty(column, columnSpec);
    applyCascadeDeleteProperty(column, columnSpec);
    applyDefaultToProperty(column, columnSpec);
    applyIndexProperty(column, columnSpec);
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyNullableProperty(column, columnSpec) {
    if (hasNullableTrue(columnSpec)) {
        column.nullable();
        return;
    }
    column.nullable(false);
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasNullableTrue(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'nullable') && columnSpec.nullable === true;
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyPrimaryKeyProperty(column, columnSpec) {
    if (hasPrimaryTrue(columnSpec)) {
        column.primary();
    }
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasPrimaryTrue(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'primary') && columnSpec.primary === true;
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyUniqueProperty(column, columnSpec) {
    if (hasUnique(columnSpec)) {
        column.unique();
    }
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasUnique(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unique') && columnSpec.unique;
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyUnsignedProperty(column, columnSpec) {
    if (hasUnsigned(columnSpec)) {
        column.unsigned();
    }
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasUnsigned(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'unsigned') && columnSpec.unsigned;
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyReferencesProperty(column, columnSpec) {
    if (hasReferences(columnSpec)) {
        column.references(columnSpec.references);
    }
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasReferences(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'references');
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyConstraintNameProperty(column, columnSpec) {
    if (hasConstraintName(columnSpec)) {
        column.withKeyName(columnSpec.constraintName);
    }
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasConstraintName(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'constraintName');
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyCascadeDeleteProperty(column, columnSpec) {
    if (hasCascadeDelete(columnSpec)) {
        column.onDelete('CASCADE');
        return;
    }
    if (hasSetNullDelete(columnSpec)) {
        column.onDelete('SET NULL');
    }
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasCascadeDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'cascadeDelete') && columnSpec.cascadeDelete === true;
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasSetNullDelete(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'setNullDelete') && columnSpec.setNullDelete === true;
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyDefaultToProperty(column, columnSpec) {
    if (hasDefaultTo(columnSpec)) {
        column.defaultTo(columnSpec.defaultTo);
    }
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasDefaultTo(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'defaultTo');
}

/**
 * @param {object} column
 * @param {object} columnSpec
 */
function applyIndexProperty(column, columnSpec) {
    if (hasIndex(columnSpec)) {
        column.index();
    }
}

/**
 * @param {object} columnSpec
 * @returns {boolean}
 */
function hasIndex(columnSpec) {
    return Object.prototype.hasOwnProperty.call(columnSpec, 'index') && columnSpec.index === true;
}