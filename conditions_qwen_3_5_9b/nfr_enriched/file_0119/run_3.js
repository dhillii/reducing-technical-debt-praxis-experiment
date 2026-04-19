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
 * Base class for all data types.
 * Provides common functionality for type validation and SQL generation.
 */
class AbstractDataType {
  constructor() {
    this.dialectTypes = '';
  }

  /**
   * Converts the type to SQL representation.
   * @param {Object} options - Optional configuration options.
   * @returns {string} SQL representation of the type.
   */
  toString(options) {
    return this.toSql(options);
  }

  /**
   * Generates SQL representation of the data type.
   * @returns {string} SQL representation.
   */
  toSql() {
    return this.key;
  }

  /**
   * Logs a warning message if not already shown.
   * @param {string} link - Link to documentation.
   * @param {string} text - Warning message text.
   */
  static warn(link, text) {
    if (!warnings[text]) {
      warnings[text] = true;
      Utils.warn(`${text}, '\n>> Check:', ${link}`);
    }
  }

  /**
   * Stringifies a value for database insertion.
   * @param {*} value - The value to stringify.
   * @param {Object} options - Optional configuration options.
   * @returns {*} Stringified value.
   */
  stringify(value, options) {
    if (this._stringify) {
      return this._stringify(value, options);
    }
    return value;
  }
}

/**
 * Creates a new instance of a data type with the given options.
 * @param {Object} options - Type configuration options.
 * @param {AbstractDataType} parentClass - Parent class to inherit from.
 * @returns {AbstractDataType} New type instance.
 */
function createDataType(options, parentClass) {
  if (!(this instanceof parentClass)) {
    return new parentClass(options);
  }
  return parentClass.call(this, options);
}

/**
 * Validates that a value is a string.
 * @param {*} value - Value to validate.
 * @param {Object} options - Type options.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid string.
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
 * Validates that a value is a string.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid string.
 */
function validateText(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
}

/**
 * Validates that a value is a number.
 * @param {*} value - Value to validate.
 * @param {string} typeKey - Type identifier for error message.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid number.
 */
function validateNumber(value, typeKey) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(typeKey), value));
  }
  return true;
}

/**
 * Validates that a value is an integer.
 * @param {*} value - Value to validate.
 * @param {string} typeKey - Type identifier for error message.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid integer.
 */
function validateInteger(value, typeKey) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(typeKey), value));
  }
  return true;
}

/**
 * Validates that a value is a float.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid float.
 */
function validateFloat(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }
  return true;
}

/**
 * Validates that a value is a decimal.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid decimal.
 */
function validateDecimal(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
}

/**
 * Validates that a value is a boolean.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid boolean.
 */
function validateBoolean(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }
  return true;
}

/**
 * Validates that a value is a date.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid date.
 */
function validateDate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }
  return true;
}

/**
 * Validates that a value is a plain object.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid plain object.
 */
function validatePlainObject(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
}

/**
 * Validates that a value is a plain object.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 */
function validatePlainObjectOrEmpty(value) {
  return true;
}

/**
 * Validates that a value is an array.
 * @param {*} value - Value to validate.
 * @param {string} typeKey - Type identifier for error message.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid array.
 */
function validateArray(value, typeKey) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + typeKey, value));
  }
  return true;
}

/**
 * Validates that a value is a UUID.
 * @param {*} value - Value to validate.
 * @param {Object} options - Validation options.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid UUID.
 */
function validateUUID(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
}

/**
 * Validates that a value is a UUID v4.
 * @param {*} value - Value to validate.
 * @param {Object} options - Validation options.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid UUID v4.
 */
function validateUUIDV4(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }
  return true;
}

/**
 * Validates that a value is a CIDR.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid CIDR.
 */
function validateCIDR(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }
  return true;
}

/**
 * Validates that a value is an INET.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid INET.
 */
function validateINET(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }
  return true;
}

/**
 * Validates that a value is a MAC address.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid MAC address.
 */
function validateMACADDR(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
}

/**
 * Validates that a value is an ENUM.
 * @param {*} value - Value to validate.
 * @param {Array} values - Allowed values.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid choice.
 */
function validateEnum(value, values) {
  if (!_.includes(values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, values));
  }
  return true;
}

/**
 * Validates that a value is a range.
 * @param {*} value - Value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If value is not a valid range.
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
 * Stringifies a number value.
 * @param {*} number - Number to stringify.
 * @returns {*} Stringified value.
 */
function stringifyNumber(number) {
  if (typeof number === 'number' || typeof number === 'boolean' || number === null || number === undefined) {
    return number;
  }

  if (typeof number.toString === 'function') {
    return number.toString();
  }

  return number;
}

/**
 * Stringifies a floating point value.
 * @param {*} value - Value to stringify.
 * @returns {string} Stringified value.
 */
function stringifyFloat(value) {
  if (isNaN(value)) {
    return "'NaN'";
  } else if (!isFinite(value)) {
    const sign = value < 0 ? '-' : '';
    return "'" + sign + "Infinity'";
  }

  return value;
}

/**
 * Applies timezone to a date.
 * @param {Date} date - Date to apply timezone to.
 * @param {Object} options - Timezone options.
 * @returns {Date} Date with timezone applied.
 */
function applyTimezone(date, options) {
  if (options.timezone) {
    if (momentTz.tz.zone(options.timezone)) {
      date = momentTz(date).tz(options.timezone);
    } else {
      date = moment(date).utcOffset(options.timezone);
    }
  } else {
    date = momentTz(date);
  }

  return date;
}

/**
 * Stringifies a date value.
 * @param {Date} date - Date to stringify.
 * @param {Object} options - Stringification options.
 * @returns {string} Stringified date.
 */
function stringifyDate(date, options) {
  date = applyTimezone(date, options);
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
}

/**
 * Stringifies a date-only value.
 * @param {Date} date - Date to stringify.
 * @returns {string} Stringified date.
 */
function stringifyDateOnly(date) {
  return moment(date).format('YYYY-MM-DD');
}

/**
 * Sanitizes a date value.
 * @param {*} value - Value to sanitize.
 * @param {Object} options - Sanitization options.
 * @returns {Date} Sanitized date.
 */
function sanitizeDate(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }
  return value;
}

/**
 * Sanitizes a date-only value.
 * @param {*} value - Value to sanitize.
 * @param {Object} options - Sanitization options.
 * @returns {Date} Sanitized date.
 */
function sanitizeDateOnly(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value;
}

/**
 * Checks if a value has changed.
 * @param {*} value - New value.
 * @param {*} originalValue - Original value.
 * @returns {boolean} True if changed.
 */
function isChanged(value, originalValue) {
  if (
    originalValue && !!value &&
    (
      value === originalValue ||
      value instanceof Date && originalValue instanceof Date && value.getTime() === originalValue.getTime()
    )
  ) {
    return false;
  }

  if (!originalValue && !value && originalValue === value) {
    return false;
  }

  return true;
}

/**
 * Sanitizes a boolean value.
 * @param {*} value - Value to sanitize.
 * @returns {*} Sanitized value.
 */
function sanitizeBoolean(value) {
  if (value !== null && value !== undefined) {
    if (Buffer.isBuffer(value) && value.length === 1) {
      value = value[0];
    }

    if (_.isString(value)) {
      value = value === 'true' ? true : value === 'false' ? false : value;
    } else if (_.isNumber(value)) {
      value = value === 1 ? true : value === 0 ? false : value;
    }
  }

  return value;
}

/**
 * Converts a value to hex format.
 * @param {string} hex - Hex string.
 * @returns {string} Hexified string.
 */
function hexify(hex) {
  return "X'" + hex + "'";
}

/**
 * Converts a value to buffer.
 * @param {*} value - Value to convert.
 * @returns {Buffer} Buffer instance.
 */
function toBuffer(value) {
  if (!Buffer.isBuffer(value)) {
    if (Array.isArray(value)) {
      value = new Buffer(value);
    } else {
      value = new Buffer(value.toString());
    }
  }
  return value;
}

/**
 * Creates a range subtype.
 * @param {*} subtype - Subtype specification.
 * @returns {Object} Subtype configuration.
 */
function createRangeSubtype(subtype) {
  const options = _.isPlainObject(subtype) ? subtype : {subtype};

  if (!options.subtype) {
    options.subtype = new INTEGER();
  }

  if (_.isFunction(options.subtype)) {
    options.subtype = new options.subtype();
  }

  return options;
}

/**
 * PostgreSQL range subtype mapping.
 * @type {Object}
 */
const pgRangeSubtypes = {
  integer: 'int4range',
  bigint: 'int8range',
  decimal: 'numrange',
  dateonly: 'daterange',
  date: 'tstzrange',
  datenotz: 'tsrange'
};

/**
 * PostgreSQL range cast type mapping.
 * @type {Object}
 */
const pgRangeCastTypes = {
  integer: 'integer',
  bigint: 'bigint',
  decimal: 'numeric',
  dateonly: 'date',
  date: 'timestamptz',
  datenotz: 'timestamp'
};

/**
 * Helper types for property accessors.
 * @type {Object}
 */
const helpers = {
  BINARY: [STRING, CHAR],
  UNSIGNED: [NUMBER, TINYINT, SMALLINT, MEDIUMINT, INTEGER, BIGINT, FLOAT, DOUBLE, REAL, DECIMAL],
  ZEROFILL: [NUMBER, TINYINT, SMALLINT, MEDIUMINT, INTEGER, BIGINT, FLOAT, DOUBLE, REAL, DECIMAL],
  PRECISION: [DECIMAL],
  SCALE: [DECIMAL]
};

/**
 * Adds property accessor to a data type.
 * @param {string} helperName - Name of the helper property.
 * @param {Array} dataTypeList - List of data types to add property to.
 */
function addPropertyAccessors(helperName, dataTypeList) {
  for (const DataType of dataTypeList) {
    if (!DataType[helperName]) {
      Object.defineProperty(DataType, helperName, {
        get() {
          const dataType = new DataType();
          if (typeof dataType[helperName] === 'object') {
            return dataType;
          }
          return dataType[helperName].apply(dataType, arguments);
        }
      });
    }
  }
}

/**
 * STRING data type - variable length string.
 */
class STRING extends AbstractDataType {
  constructor(length, binary) {
    super();
    const options = typeof length === 'object' && length || {length, binary};
    this.options = options;
    this._binary = options.binary;
    this._length = options.length || 255;
  }

  get key() {
    return 'STRING';
  }

  toSql() {
    return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
  }

  validate(value) {
    return validateString(value, this.options);
  }

  get BINARY() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
}

/**
 * CHAR data type - fixed length string.
 */
class CHAR extends STRING {
  constructor(length, binary) {
    super(length, binary);
  }

  get key() {
    return 'CHAR';
  }

  toSql() {
    return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
  }
}

/**
 * TEXT data type - unlimited length text.
 */
class TEXT extends AbstractDataType {
  constructor(length) {
    super();
    const options = typeof length === 'object' && length || {length};
    this.options = options;
    this._length = options.length || '';
  }

  get key() {
    return 'TEXT';
  }

  toSql() {
    switch (this._length.toLowerCase()) {
      case 'tiny':
        return 'TINYTEXT';
      case 'medium':
        return 'MEDIUMTEXT';
      case 'long':
        return 'LONGTEXT';
      default:
        return this.key;
    }
  }

  validate(value) {
    return validateText(value);
  }
}

/**
 * NUMBER data type - numeric value.
 */
class NUMBER extends AbstractDataType {
  constructor(options) {
    super();
    this.options = options;
    this._length = options.length;
    this._zerofill = options.zerofill;
    this._decimals = options.decimals;
    this._precision = options.precision;
    this._scale = options.scale;
    this._unsigned = options.unsigned;
  }

  get key() {
    return 'NUMBER';
  }

  toSql() {
    let result = this.key;
    if (this._length) {
      result += '(' + this._length;
      if (typeof this._decimals === 'number') {
        result += ',' + this._decimals;
      }
      result += ')';
    }
    if (this._unsigned) {
      result += ' UNSIGNED';
    }
    if (this._zerofill) {
      result += ' ZEROFILL';
    }
    return result;
  }

  validate(value) {
    return validateNumber(value, this.key);
  }

  _stringify(number) {
    return stringifyNumber(number);
  }

  get UNSIGNED() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }

  get ZEROFILL() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
}

/**
 * INTEGER data type - 32 bit integer.
 */
class INTEGER extends NUMBER {
  constructor(length) {
    super(typeof length === 'object' && length || {length});
  }

  get key() {
    return 'INTEGER';
  }

  validate(value) {
    return validateInteger(value, this.key);
  }
}

/**
 * TINYINT data type - 8 bit integer.
 */
class TINYINT extends INTEGER {
  constructor(length) {
    super(typeof length === 'object' && length || {length});
  }

  get key() {
    return 'TINYINT';
  }
}

/**
 * SMALLINT data type - 16 bit integer.
 */
class SMALLINT extends INTEGER {
  constructor(length) {
    super(typeof length === 'object' && length || {length});
  }

  get key() {
    return 'SMALLINT';
  }
}

/**
 * MEDIUMINT data type - 24 bit integer.
 */
class MEDIUMINT extends INTEGER {
  constructor(length) {
    super(typeof length === 'object' && length || {length});
  }

  get key() {
    return 'MEDIUMINT';
  }
}

/**
 * BIGINT data type - 64 bit integer.
 */
class BIGINT extends INTEGER {
  constructor(length) {
    super(typeof length === 'object' && length || {length});
  }

  get key() {
    return 'BIGINT';
  }
}

/**
 * FLOAT data type - 4-byte precision.
 */
class FLOAT extends NUMBER {
  constructor(length, decimals) {
    super(typeof length === 'object' && length || {length, decimals});
  }

  get key() {
    return 'FLOAT';
  }

  validate(value) {
    return validateFloat(value);
  }
}

/**
 * REAL data type - 4-byte precision.
 */
class REAL extends NUMBER {
  constructor(length, decimals) {
    super(typeof length === 'object' && length || {length, decimals});
  }

  get key() {
    return 'REAL';
  }
}

/**
 * DOUBLE data type - 8-byte precision.
 */
class DOUBLE extends NUMBER {
  constructor(length, decimals) {
    super(typeof length === 'object' && length || {length, decimals});
  }

  get key() {
    return 'DOUBLE PRECISION';
  }
}

/**
 * DECIMAL data type - decimal number.
 */
class DECIMAL extends NUMBER {
  constructor(precision, scale) {
    super(typeof precision === 'object' && precision || {precision, scale});
  }

  get key() {
    return 'DECIMAL';
  }

  toSql() {
    if (this._precision || this._scale) {
      return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
    }
    return 'DECIMAL';
  }

  validate(value) {
    return validateDecimal(value);
  }
}

/**
 * BOOLEAN data type - boolean value.
 */
class BOOLEAN extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'BOOLEAN';
  }

  toSql() {
    return 'TINYINT(1)';
  }

  validate(value) {
    return validateBoolean(value);
  }

  _sanitize(value) {
    return sanitizeBoolean(value);
  }

  static parse(value) {
    return this.prototype._sanitize(value);
  }
}

/**
 * TIME data type - time value.
 */
class TIME extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'TIME';
  }

  toSql() {
    return 'TIME';
  }
}

/**
 * DATE data type - datetime value.
 */
class DATE extends AbstractDataType {
  constructor(length) {
    super();
    const options = typeof length === 'object' && length || {length};
    this.options = options;
    this._length = options.length || '';
  }

  get key() {
    return 'DATE';
  }

  toSql() {
    return 'DATETIME';
  }

  validate(value) {
    return validateDate(value);
  }

  _sanitize(value, options) {
    return sanitizeDate(value, options);
  }

  _isChanged(value, originalValue) {
    return isChanged(value, originalValue);
  }

  _applyTimezone(date, options) {
    return applyTimezone(date, options);
  }

  _stringify(date, options) {
    return stringifyDate(date, options);
  }
}

/**
 * DATEONLY data type - date only value.
 */
class DATEONLY extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'DATEONLY';
  }

  toSql() {
    return 'DATE';
  }

  _stringify(date) {
    return stringifyDateOnly(date);
  }

  _sanitize(value, options) {
    return sanitizeDateOnly(value, options);
  }

  _isChanged(value, originalValue) {
    return isChanged(value, originalValue);
  }
}

/**
 * HSTORE data type - key/value store.
 */
class HSTORE extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'HSTORE';
  }

  validate(value) {
    return validatePlainObject(value);
  }
}

/**
 * JSON data type - JSON string.
 */
class JSONTYPE extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'JSON';
  }

  validate() {
    return validatePlainObjectOrEmpty();
  }

  _stringify(value) {
    return JSON.stringify(value);
  }
}

/**
 * JSONB data type - binary JSON.
 */
class JSONB extends JSONTYPE {
  constructor() {
    super();
  }

  get key() {
    return 'JSONB';
  }
}

/**
 * NOW data type - current timestamp.
 */
class NOW extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'NOW';
  }
}

/**
 * BLOB data type - binary storage.
 */
class BLOB extends AbstractDataType {
  constructor(length) {
    super();
    const options = typeof length === 'object' && length || {length};
    this.options = options;
    this._length = options.length || '';
  }

  get key() {
    return 'BLOB';
  }

  toSql() {
    switch (this._length.toLowerCase()) {
      case 'tiny':
        return 'TINYBLOB';
      case 'medium':
        return 'MEDIUMBLOB';
      case 'long':
        return 'LONGBLOB';
      default:
        return this.key;
    }
  }

  validate(value) {
    if (!_.isString(value) && !Buffer.isBuffer(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
    }
    return true;
  }

  escape = false;

  _stringify(value) {
    const buffer = toBuffer(value);
    const hex = buffer.toString('hex');
    return hexify(hex);
  }
}

/**
 * RANGE data type - range of values.
 */
class RANGE extends AbstractDataType {
  constructor(subtype) {
    super();
    const options = createRangeSubtype(subtype);
    this._subtype = options.subtype.key;
    this.options = options;
  }

  get key() {
    return 'RANGE';
  }

  toSql() {
    return pgRangeSubtypes[this._subtype.toLowerCase()];
  }

  toCastType() {
    return pgRangeCastTypes[this._subtype.toLowerCase()];
  }

  validate(value) {
    return validateRange(value);
  }
}

/**
 * UUID data type - unique identifier.
 */
class UUID extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'UUID';
  }

  validate(value, options) {
    return validateUUID(value, options);
  }
}

/**
 * UUIDV1 data type - UUID v1 default value.
 */
class UUIDV1 extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'UUIDV1';
  }

  validate(value, options) {
    return validateUUID(value, options);
  }
}

/**
 * UUIDV4 data type - UUID v4 default value.
 */
class UUIDV4 extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'UUIDV4';
  }

  validate(value, options) {
    return validateUUIDV4(value, options);
  }
}

/**
 * VIRTUAL data type - virtual value.
 */
class VIRTUAL extends AbstractDataType {
  constructor(returnType, fields) {
    super();
    if (typeof returnType === 'function') {
      returnType = new returnType();
    }
    this.returnType = returnType;
    this.fields = fields;
  }

  get key() {
    return 'VIRTUAL';
  }
}

/**
 * ENUM data type - enumeration.
 */
class ENUM extends AbstractDataType {
  constructor(value) {
    super();
    const options = typeof value === 'object' && !Array.isArray(value) && value || {
      values: Array.prototype.slice.call(arguments).reduce((result, element) => {
        return result.concat(Array.isArray(element) ? element : [element]);
      }, [])
    };
    this.values = options.values;
    this.options = options;
  }

  get key() {
    return 'ENUM';
  }

  validate(value) {
    return validateEnum(value, this.values);
  }
}

/**
 * ARRAY data type - array of values.
 */
class ARRAY extends AbstractDataType {
  constructor(type) {
    super();
    const options = _.isPlainObject(type) ? type : {type};
    this.type = typeof options.type === 'function' ? new options.type() : options.type;
  }

  get key() {
    return 'ARRAY';
  }

  toSql() {
    return this.type.toSql() + '[]';
  }

  validate(value) {
    return validateArray(value, this.key);
  }

  static is(obj, type) {
    return obj instanceof ARRAY && obj.type instanceof type;
  }
}

/**
 * GEOMETRY data type - geometry information.
 */
class GEOMETRY extends AbstractDataType {
  constructor(type, srid) {
    super();
    const options = _.isPlainObject(type) ? type : {type, srid};
    this.options = options;
    this.type = options.type;
    this.srid = options.srid;
  }

  get key() {
    return 'GEOMETRY';
  }

  escape = false;

  _stringify(value, options) {
    return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
  }
}

/**
 * GEOGRAPHY data type - geography information.
 */
class GEOGRAPHY extends AbstractDataType {
  constructor(type, srid) {
    super();
    const options = _.isPlainObject(type) ? type : {type, srid};
    this.options = options;
    this.type = options.type;
    this.srid = options.srid;
  }

  get key() {
    return 'GEOGRAPHY';
  }

  escape = false;

  _stringify(value, options) {
    return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
  }
}

/**
 * CIDR data type - IP range.
 */
class CIDR extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'CIDR';
  }

  validate(value) {
    return validateCIDR(value);
  }
}

/**
 * INET data type - IP address.
 */
class INET extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'INET';
  }

  validate(value) {
    return validateINET(value);
  }
}

/**
 * MACADDR data type - MAC address.
 */
class MACADDR extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'MACADDR';
  }

  validate(value) {
    return validateMACADDR(value);
  }
}

/**
 * Exports all data types.
 */
const DataTypes = module.exports = {
  ABSTRACT: AbstractDataType,
  STRING,
  CHAR,
  TEXT,
  NUMBER,
  TINYINT,
  SMALLINT,
  MEDIUMINT,
  INTEGER,
  BIGINT,
  FLOAT,
  TIME,
  DATE,
  DATEONLY,
  BOOLEAN,
  NOW,
  BLOB,
  DECIMAL,
  NUMERIC: DECIMAL,
  UUID,
  UUIDV1,
  UUIDV4,
  HSTORE,
  JSON: JSONTYPE,
  JSONB,
  VIRTUAL,
  ARRAY,
  NONE: VIRTUAL,
  ENUM,
  RANGE,
  REAL,
  DOUBLE,
  'DOUBLE PRECISION': DOUBLE,
  GEOMETRY,
  GEOGRAPHY,
  CIDR,
  INET,
  MACADDR
};

_.each(DataTypes, dataType => {
  dataType.types = {};
});

addPropertyAccessors('BINARY', helpers.BINARY);
addPropertyAccessors('UNSIGNED', helpers.UNSIGNED);
addPropertyAccessors('ZEROFILL', helpers.ZEROFILL);
addPropertyAccessors('PRECISION', helpers.PRECISION);
addPropertyAccessors('SCALE', helpers.SCALE);

DataTypes.postgres = require('./dialects/postgres/data-types')(DataTypes);
DataTypes.mysql = require('./dialects/mysql/data-types')(DataTypes);
DataTypes.sqlite = require('./dialects/sqlite/data-types')(DataTypes);
DataTypes.mssql = require('./dialects/mssql/data-types')(DataTypes);

module.exports = DataTypes;