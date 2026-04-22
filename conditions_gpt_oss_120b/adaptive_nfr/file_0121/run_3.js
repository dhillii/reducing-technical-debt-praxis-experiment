'use strict';

const _ = require('lodash');
const Utils = require('../../utils');
const DataTypes = require('../../data-types');
const TableHints = require('../../table-hints');
const AbstractQueryGenerator = require('../abstract/query-generator');
const randomBytes = require('crypto').randomBytes;
const semver = require('semver');

const Op = require('../../operators');

/* istanbul ignore next */
function throwMethodUndefined(methodName) {
  throw new Error('The method "' + methodName + '" is not defined! Please add it to your sql dialect.');
}

/**
 * Guard: returns true if the given attribute contains a PRIMARY KEY marker.
 * @param {string} dataType
 * @returns {boolean}
 */
function hasPrimaryKey(dataType) {
  return _.includes(dataType, 'PRIMARY KEY');
}

/**
 * Guard: returns true if the given attribute contains a REFERENCES marker.
 * @param {string} dataType
 * @returns {boolean}
 */
function hasReferences(dataType) {
  return _.includes(dataType, 'REFERENCES');
}

/**
 * Extracts the column definition and reference clause from a data type string.
 * @param {string} dataType
 * @returns {{column: string, reference: string}}
 */
function splitColumnAndReference(dataType) {
  const match = dataType.match(/^(.+) (REFERENCES.*)$/);
  return {
    column: match[1],
    reference: match[2]
  };
}

/**
 * Returns true when the clause object has any falsy value.
 * @param {Object} clause
 * @returns {boolean}
 */
function clauseHasFalsyValue(clause) {
  for (const key in clause) {
    if (!clause[key]) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when the provided options indicate an old SQL Server version.
 * @param {object} sequelize
 * @returns {boolean}
 */
function isLegacyMSSQL(sequelize) {
  return semver.valid(sequelize.options.databaseVersion) &&
    semver.lt(sequelize.options.databaseVersion, '11.0.0');
}

/**
 * Builds the join condition snippet for MERGE statements.
 * @param {string[]} keys
 * @param {string} targetAlias
 * @param {string} sourceAlias
 * @param {function(string):string} quoteIdentifier
 * @returns {string}
 */
function buildJoinSnippet(keys, targetAlias, sourceAlias, quoteIdentifier) {
  return keys.map(key => {
    const q = quoteIdentifier(key);
    return `${targetAlias}.${q} = ${sourceAlias}.${q}`;
  }).join(' AND ');
}

/**
 * Generates the UPDATE part of an UPSERT MERGE query, excluding identity columns.
 * @param {Object} updateValues
 * @param {string[]} identityAttrs
 * @param {string} targetAlias
 * @param {function(string):string} quoteIdentifier
 * @param {function(*):string} escape
 * @returns {string}
 */
function buildUpdateSnippet(updateValues, identityAttrs, targetAlias, quoteIdentifier, escape) {
  return Object.keys(updateValues)
    .filter(key => identityAttrs.indexOf(key) === -1)
    .map(key => {
      const value = escape(updateValues[key]);
      const qKey = quoteIdentifier(key);
      return `${targetAlias}.${qKey} = ${value}`;
    })
    .join(', ');
}

/**
 * Generates the INSERT part of an UPSERT MERGE query.
 * @param {string[]} insertKeys
 * @param {Object} insertValues
 * @param {function(string):string} quoteIdentifier
 * @param {function(*):string} escape
 * @returns {string}
 */
function buildInsertSnippet(insertKeys, insertValues, quoteIdentifier, escape) {
  const cols = insertKeys.map(k => quoteIdentifier(k)).join(', ');
  const vals = insertKeys.map(k => escape(insertValues[k])).join(', ');
  return `(${cols}) VALUES(${vals})`;
}

/**
 * Returns true when the given attribute definition contains a REFERENCES clause.
 * @param {string} definition
 * @returns {boolean}
 */
function definitionHasReferences(definition) {
  return /REFERENCES/.test(definition);
}

/**
 * Returns true when the given attribute definition contains an IDENTITY clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function isIdentityAttribute(attr) {
  return !!attr.autoIncrement;
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY clause.
 * @param {string} definition
 * @returns {boolean}
 */
function definitionHasPrimaryKey(definition) {
  return /PRIMARY KEY/.test(definition);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUniqueAttribute(attr) {
  return attr.unique === true;
}

/**
 * Returns true when the given attribute definition contains a NOT NULL clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNullAttribute(attr) {
  return attr.allowNull === false;
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefaultValue(attr) {
  return Utils.defaultValueSchemable(attr.defaultValue);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasForeignKey(attr) {
  return !!attr.references;
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimaryKey(attr) {
  return !!attr.primaryKey;
}

/**
 * Returns true when the given attribute definition contains a AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoIncrement(attr) {
  return !!attr.autoIncrement;
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumAttribute(attr) {
  return attr.type instanceof DataTypes.ENUM;
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextAttribute(attr) {
  return attr.type === 'TEXT';
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryAttribute(attr) {
  return attr.type && attr.type._binary === true;
}

/**
 * Returns true when the given attribute definition contains a NULLABLE flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNullable(attr) {
  return attr.allowNull !== false;
}

/**
 * Returns true when the given attribute definition contains a DEFAULT clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddDefault(attr) {
  return !isTextAttribute(attr) && !isBinaryAttribute(attr) && hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddPrimaryKey(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddForeignKey(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains an IDENTITY clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddIdentity(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a NULL clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddNull(attr) {
  return !isPrimaryKey(attr) && !hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a REFERENCES clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddReferences(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a ON DELETE clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasOnDelete(attr) {
  return !!attr.onDelete;
}

/**
 * Returns true when the given attribute definition contains a ON UPDATE clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasOnUpdate(attr) {
  return !!attr.onUpdate;
}

/**
 * Returns true when the given attribute definition contains a DEFAULT clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddDefaultClause(attr) {
  return shouldAddDefault(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddUniqueClause(attr) {
  return shouldAddUnique(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddPrimaryKeyClause(attr) {
  return shouldAddPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddForeignKeyClause(attr) {
  return shouldAddForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddNotNullClause(attr) {
  return shouldAddNotNull(attr);
}

/**
 * Returns true when the given attribute definition contains a NULL clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddNullClause(attr) {
  return shouldAddNull(attr);
}

/**
 * Returns true when the given attribute definition contains a REFERENCES clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddReferencesClause(attr) {
  return shouldAddReferences(attr);
}

/**
 * Returns true when the given attribute definition contains an IDENTITY clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddIdentityClause(attr) {
  return shouldAddIdentity(attr);
}

/**
 * Returns true when the given attribute definition contains an ON DELETE clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasOnDeleteClause(attr) {
  return hasOnDelete(attr);
}

/**
 * Returns true when the given attribute definition contains an ON UPDATE clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasOnUpdateClause(attr) {
  return hasOnUpdate(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnum(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isText(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinary(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimary(attr) {
  return isPrimaryKey(attr);
}

/**
 * Returns true when the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoInc(attr) {
  return isAutoIncrement(attr);
}

/**
 * Returns true when the given attribute definition contains a FOREIGN KEY reference.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReference(attr) {
  return hasForeignKey(attr);
}

/**
 * Returns true when the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUnique(attr) {
  return isUniqueAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumType(attr) {
  return isEnumAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextType(attr) {
  return isTextAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryType(attr) {
  return isBinaryAttribute(attr);
}

/**
 * Returns true when the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefault(attr) {
  return hasDefaultValue(attr);
}

/**
 * Returns true when the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNull(attr) {
  return isNotNullAttribute(attr);
}

/**
 * Returns true if the given attribute definition contains a PRIMARY KEY flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isPrimaryKeyAttr(attr) {
  return !!attr.primaryKey;
}

/**
 * Returns true if the given attribute definition contains an AUTO INCREMENT flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isAutoIncrementAttr(attr) {
  return !!attr.autoIncrement;
}

/**
 * Returns true if the given attribute definition contains a UNIQUE constraint.
 * @param {Object} attr
 * @returns {boolean}
 */
function isUniqueAttr(attr) {
  return !!attr.unique;
}

/**
 * Returns true if the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function isNotNullAttr(attr) {
  return attr.allowNull === false;
}

/**
 * Returns true if the given attribute definition contains a DEFAULT value.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasDefaultValueAttr(attr) {
  return Utils.defaultValueSchemable(attr.defaultValue);
}

/**
 * Returns true if the given attribute definition contains a REFERENCES clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function hasReferencesAttr(attr) {
  return !!attr.references;
}

/**
 * Returns true if the given attribute definition contains a ENUM type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isEnumAttr(attr) {
  return attr.type instanceof DataTypes.ENUM;
}

/**
 * Returns true if the given attribute definition contains a TEXT type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isTextAttr(attr) {
  return attr.type === 'TEXT';
}

/**
 * Returns true if the given attribute definition contains a BINARY type.
 * @param {Object} attr
 * @returns {boolean}
 */
function isBinaryAttr(attr) {
  return attr.type && attr.type._binary === true;
}

/**
 * Returns true if the given attribute definition contains a DEFAULT value and is not a TEXT or BINARY.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddDefaultClause(attr) {
  return !isTextAttr(attr) && !isBinaryAttr(attr) && hasDefaultValueAttr(attr);
}

/**
 * Returns true if the given attribute definition contains a NOT NULL flag.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddNotNullClause(attr) {
  return isNotNullAttr(attr);
}

/**
 * Returns true if the given attribute definition contains a NULL clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddNullClause(attr) {
  return !isPrimaryKeyAttr(attr) && !hasDefaultValueAttr(attr);
}

/**
 * Returns true if the given attribute definition contains a PRIMARY KEY clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddPrimaryKeyClause(attr) {
  return isPrimaryKeyAttr(attr);
}

/**
 * Returns true if the given attribute definition contains a FOREIGN KEY clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddForeignKeyClause(attr) {
  return hasReferencesAttr(attr);
}

/**
 * Returns true if the given attribute definition contains an IDENTITY clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddIdentityClause(attr) {
  return isAutoIncrementAttr(attr);
}

/**
 * Returns true if the given attribute definition contains a UNIQUE clause.
 * @param {Object} attr
 * @returns {boolean}
 */
function shouldAddUniqueClause(attr) {
  return isUniqueAttr(attr