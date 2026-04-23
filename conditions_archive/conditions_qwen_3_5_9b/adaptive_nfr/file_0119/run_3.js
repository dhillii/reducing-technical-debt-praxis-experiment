'use strict';

const util = require('util');
const inherits = require('./utils/inherits');
const _ = require('lodash');
const Wkt = require('terraformer-wkt-parser');
const sequelizeErrors = require('./errors');
const warnings = {};
const Validator = require('./utils/validator-extras').validator;
const momentTz = require('moment-timezone');
const moment = require('moment');
const Utils = require('./utils');

/**
 * Abstract base class for all data types.
 * Provides common functionality for type validation and SQL generation.
 */
function ABSTRACT() {}

ABSTRACT.prototype.dialectTypes = '';

/**
 * Converts the data type to SQL representation.
 * @param {Object} options - Optional configuration options
 * @returns {string} SQL representation of the data type
 */
ABSTRACT.prototype.toString = function toString(options) {
  return this.toSql(options);
};

/**
 * Generates the SQL representation of this data type.
 * @returns {string} SQL representation
 */
ABSTRACT.prototype.toSql = function toSql() {
  return this.key;
};

/**
 * Issues a warning if the text hasn't been seen before.
 * @param {string} link - Link to documentation
 * @param {string} text - Warning message
 */
ABSTRACT.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};

/**
 * Stringifies a value for SQL representation.
 * @param {*} value - The value to stringify
 * @param {Object} options - Optional configuration options
 * @returns {*} Stringified value
 */
ABSTRACT.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};

/**
 * Validates that a value is a valid string.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid string
 */
function validateString(value, options) {
  if (Object.prototype.toString.call(value) !== '[object String]') {
    if (options && options.binary && Buffer.isBuffer(value) || _.isNumber(value)) {
      return true;
    }
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
}

/**
 * Validates that a value is a valid date.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid date
 */
function validateDate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }
  return true;
}

/**
 * Validates that a value is a valid boolean.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid boolean
 */
function validateBoolean(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }
  return true;
}

/**
 * Validates that a value is a valid integer.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid integer
 */
function validateInteger(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower('integer'), value));
  }
  return true;
}

/**
 * Validates that a value is a valid float.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid float
 */
function validateFloat(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower('float'), value));
  }
  return true;
}

/**
 * Validates that a value is a valid decimal.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid decimal
 */
function validateDecimal(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
}

/**
 * Validates that a value is a valid UUID.
 * @param {*} value - The value to validate
 * @param {Object} options - Validation options
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid UUID
 */
function validateUUID(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
}

/**
 * Validates that a value is a valid UUID v4.
 * @param {*} value - The value to validate
 * @param {Object} options - Validation options
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid UUID v4
 */
function validateUUIDV4(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }
  return true;
}

/**
 * Validates that a value is a valid hstore.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid hstore
 */
function validateHstore(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
}

/**
 * Validates that a value is a valid blob.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid blob
 */
function validateBlob(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
}

/**
 * Validates that a value is a valid array.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid array
 */
function validateArray(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }
  return true;
}

/**
 * Validates that a value is a valid CIDR.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid CIDR
 */
function validateCIDR(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }
  return true;
}

/**
 * Validates that a value is a valid INET.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid INET
 */
function validateINET(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }
  return true;
}

/**
 * Validates that a value is a valid MACADDR.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid MACADDR
 */
function validateMACADDR(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid range.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid range
 */
function validateRange(value) {
  if (_.isPlainObject(value) && value.inclusive) {
    value = value.inclusive;
  }

  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid range', value));
  }

  if (value.length !== 2) {
    throw new sequelizeErrors.ValidationError('A range must be an array with two elements');
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean} True if valid
 * @throws {ValidationError} If value is not a valid choice
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a valid ENUM.
 * @param {*} value - The value to validate
 * @param {Array} values - Array of valid values
 * @returns {boolean}