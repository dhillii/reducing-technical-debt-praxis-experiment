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
 * Provides common functionality for type conversion and SQL generation.
 */
function ABSTRACT() {
  // Base implementation for all data types
}

ABSTRACT.prototype.dialectTypes = '';

ABSTRACT.prototype.toString = function toString(options) {
  return this.toSql(options);
};

ABSTRACT.prototype.toSql = function toSql() {
  return this.key;
};

ABSTRACT.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};

ABSTRACT.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};

/**
 * STRING data type - variable length string
 * @param {number|string|object} length - Maximum length or options object
 * @param {boolean} binary - Whether to use binary storage
 */
function STRING(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof STRING)) return new STRING(options);

  this.options = options;
  this._binary = options.binary;
  this._length = options.length || 255;
}

inherits(STRING, ABSTRACT);

STRING.prototype.key = STRING.key = 'STRING';

STRING.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

STRING.prototype.validate = function validate(value) {
  if (Object.prototype.toString.call(value) !== '[object String]') {
    if (this.options.binary && Buffer.isBuffer(value) || _.isNumber(value)) {
      return true;
    }
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

Object.defineProperty(STRING.prototype, 'BINARY', {
  get() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
});

/**
 * CHAR data type - fixed length string
 * @param {number|string|object} length - Fixed length or options object
 * @param {boolean} binary - Whether to use binary storage
 */
function CHAR(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof CHAR)) return new CHAR(options);
  STRING.apply(this, arguments);
}

inherits(CHAR, STRING);

CHAR.prototype.key = CHAR.key = 'CHAR';

CHAR.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * TEXT data type - unlimited length text
 * @param {number|string|object} length - Length specifier (tiny, medium, long) or options
 */
function TEXT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TEXT)) return new TEXT(options);
  this.options = options;
  this._length = options.length || '';
}

inherits(TEXT, ABSTRACT);

TEXT.prototype.key = TEXT.key = 'TEXT';

/**
 * Converts TEXT length specifier to SQL type
 * @returns {string} SQL type name
 */
function getTextSqlType(length) {
  const lengthMap = {
    tiny: 'TINYTEXT',
    medium: 'MEDIUMTEXT',
    long: 'LONGBLOB',
    default: 'TEXT'
  };
  return lengthMap[length.toLowerCase()] || lengthMap.default;
}

TEXT.prototype.toSql = function toSql() {
  return getTextSqlType(this._length);
};

TEXT.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

/**
 * NUMBER data type - numeric value with optional precision
 * @param {object} options - Configuration options
 */
function NUMBER(options) {
  this.options = options;
  this._length = options.length;
  this._zerofill = options.zerofill;
  this._decimals = options.decimals;
  this._precision = options.precision;
  this._scale = options.scale;
  this._unsigned = options.unsigned;
}

inherits(NUMBER, ABSTRACT);

NUMBER.prototype.key = NUMBER.key = 'NUMBER';

/**
 * Generates SQL representation for NUMBER type
 * @returns {string} SQL type definition
 */
function generateNumberSql() {
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

NUMBER.prototype.toSql = function toSql() {
  return generateNumberSql.call(this);
};

NUMBER.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

/**
 * Converts number value to string representation
 * @param {*} number - Value to stringify
 * @returns {string|number} Stringified or original value
 */
function _stringifyNumber(number) {
  if (typeof number === 'number' || typeof number === 'boolean' || number === null || number === undefined) {
    return number;
  }
  if (typeof number.toString === 'function') {
    return number.toString();
  }
  return number;
}

NUMBER.prototype._stringify = function _stringify(number) {
  return _stringifyNumber.call(this, number);
};

Object.defineProperty(NUMBER.prototype, 'UNSIGNED', {
  get() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }
});

Object.defineProperty(NUMBER.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

/**
 * INTEGER data type - 32 bit integer
 * @param {number|string|object} length - Length or options object
 */
function INTEGER(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof INTEGER)) return new INTEGER(options);
  NUMBER.call(this, options);
}

inherits(INTEGER, NUMBER);

INTEGER.prototype.key = INTEGER.key = 'INTEGER';

INTEGER.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

/**
 * TINYINT data type - 8 bit integer
 * @param {number|string|object} length - Length or options object
 */
function TINYINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TINYINT)) return new TINYINT(options);
  NUMBER.call(this, options);
}

inherits(TINYINT, INTEGER);

TINYINT.prototype.key = TINYINT.key = 'TINYINT';

/**
 * SMALLINT data type - 16 bit integer
 * @param {number|string|object} length - Length or options object
 */
function SMALLINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SMALLINT)) return new SMALLINT(options);
  NUMBER.call(this, options);
}

inherits(SMALLINT, INTEGER);

SMALLINT.prototype.key = SMALLINT.key = 'SMALLINT';

/**
 * MEDIUMINT data type - 24 bit integer
 * @param {number|string|object} length - Length or options object
 */
function MEDIUMINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MEDIUMINT)) return new MEDIUMINT(options);
  NUMBER.call(this, options);
}

inherits(MEDIUMINT, INTEGER);

MEDIUMINT.prototype.key = MEDIUMINT.key = 'MEDIUMINT';

/**
 * BIGINT data type - 64 bit integer
 * @param {number|string|object} length - Length or options object
 */
function BIGINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BIGINT)) return new BIGINT(options);
  NUMBER.call(this, options);
}

inherits(BIGINT, INTEGER);

BIGINT.prototype.key = BIGINT.key = 'BIGINT';

/**
 * FLOAT data type - 4-byte floating point
 * @param {number|string|object} length - Length or options object
 * @param {number} decimals - Decimal precision
 */
function FLOAT(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof FLOAT)) return new FLOAT(options);
  NUMBER.call(this, options);
}

inherits(FLOAT, NUMBER);

FLOAT.prototype.key = FLOAT.key = 'FLOAT';

FLOAT.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }
  return true;
};

/**
 * REAL data type - 4-byte floating point
 * @param {number|string|object} length - Length or options object
 * @param {number} decimals - Decimal precision
 */
function REAL(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof REAL)) return new REAL(options);
  NUMBER.call(this, options);
}

inherits(REAL, NUMBER);

REAL.prototype.key = REAL.key = 'REAL';

/**
 * DOUBLE data type - 8-byte floating point
 * @param {number|string|object} length - Length or options object
 * @param {number} decimals - Decimal precision
 */
function DOUBLE(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DOUBLE)) return new DOUBLE(options);
  NUMBER.call(this, options);
}

inherits(DOUBLE, NUMBER);

DOUBLE.prototype.key = DOUBLE.key = 'DOUBLE PRECISION';

/**
 * DECIMAL data type - arbitrary precision decimal
 * @param {number|string|object} precision - Precision or options object
 * @param {number} scale - Scale
 */
function DECIMAL(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DECIMAL)) return new DECIMAL(options);
  NUMBER.call(this, options);
}

inherits(DECIMAL, NUMBER);

DECIMAL.prototype.key = DECIMAL.key = 'DECIMAL';

/**
 * Generates SQL representation for DECIMAL type
 * @returns {string} SQL type definition
 */
function generateDecimalSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }
  return 'DECIMAL';
}

DECIMAL.prototype.toSql = function toSql() {
  return generateDecimalSql.call(this);
};

DECIMAL.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
};

/**
 * Sets escape flag for floating point types
 * @param {Function} dataType - Data type constructor
 */
function setFloatingPointEscape(dataType) {
  dataType.prototype.escape = false;
  dataType.prototype._stringify = function _stringify(value) {
    if (isNaN(value)) {
      return "'NaN'";
    } else if (!isFinite(value)) {
      const sign = value < 0 ? '-' : '';
      return "'" + sign + "Infinity'";
    }
    return value;
  };
}

for (const floating of [FLOAT, DOUBLE, REAL]) {
  setFloatingPointEscape(floating);
}

/**
 * BOOLEAN data type - boolean value
 */
function BOOLEAN() {
  if (!(this instanceof BOOLEAN)) return new BOOLEAN();
}

inherits(BOOLEAN, ABSTRACT);

BOOLEAN.prototype.key = BOOLEAN.key = 'BOOLEAN';

BOOLEAN.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

BOOLEAN.prototype.validate = function validate(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }
  return true;
};

/**
 * Sanitizes boolean value for storage
 * @param {*} value - Value to sanitize
 * @returns {*} Sanitized value
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

BOOLEAN.prototype._sanitize = function _sanitize(value) {
  return sanitizeBoolean.call(this, value);
};

BOOLEAN.parse = BOOLEAN.prototype._sanitize;

/**
 * TIME data type - time value
 */
function TIME() {
  if (!(this instanceof TIME)) return new TIME();
}

inherits(TIME, ABSTRACT);

TIME.prototype.key = TIME.key = 'TIME';

TIME.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * DATE data type - datetime value
 * @param {number|string|object} length - Length or options object
 */
function DATE(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DATE)) return new DATE(options);
  this.options = options;
  this._length = options.length || '';
}

inherits(DATE, ABSTRACT);

DATE.prototype.key = DATE.key = 'DATE';

DATE.prototype.toSql = function toSql() {
  return 'DATETIME';
};

DATE.prototype.validate = function validate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }
  return true;
};

/**
 * Applies timezone to date value
 * @param {Date} date - Date to apply timezone
 * @param {object} options - Options object
 * @returns {Date} Date with timezone applied
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
 * Stringifies date value for SQL
 * @param {Date} date - Date to stringify
 * @param {object} options - Options object
 * @returns {string} Formatted date string
 */
function stringifyDate(date, options) {
  date = applyTimezone.call(this, date, options);
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
}

DATE.prototype._applyTimezone = function _applyTimezone(date, options) {
  return applyTimezone.call(this, date, options);
};

DATE.prototype._stringify = function _stringify(date, options) {
  return stringifyDate.call(this, date, options);
};

/**
 * Checks if date value has changed
 * @param {*} value - New value
 * @param {*} originalValue - Original value
 * @returns {boolean} True if changed
 */
function isDateChanged(value, originalValue) {
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

DATE.prototype._isChanged = function _isChanged(value, originalValue) {
  return isDateChanged.call(this, value, originalValue);
};

/**
 * DATEONLY data type - date only (no time)
 */
function DATEONLY() {
  if (!(this instanceof DATEONLY)) return new DATEONLY();
}

util.inherits(DATEONLY, ABSTRACT);

DATEONLY.prototype.key = DATEONLY.key = 'DATEONLY';

DATEONLY.prototype.toSql = function() {
  return 'DATE';
};

/**
 * Stringifies date value for SQL
 * @param {Date} date - Date to stringify
 * @returns {string} Formatted date string
 */
function stringifyDateOnly(date) {
  return moment(date).format('YYYY-MM-DD');
}

DATEONLY.prototype._stringify = function _stringify(date) {
  return stringifyDateOnly.call(this, date);
};

/**
 * Sanitizes date value for storage
 * @param {*} value - Value to sanitize
 * @param {object} options - Options object
 * @returns {*} Sanitized value
 */
function sanitizeDateOnly(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value;
}

DATEONLY.prototype._sanitize = function _sanitize(value, options) {
  return sanitizeDateOnly.call(this, value, options);
};

DATEONLY.prototype._isChanged = function _isChanged(value, originalValue) {
  if (originalValue && !!value && originalValue === value) {
    return false;
  }
  if (!originalValue && !value && originalValue === value) {
    return false;
  }
  return true;
};

/**
 * HSTORE data type - key/value store
 */
function HSTORE() {
  if (!(this instanceof HSTORE)) return new HSTORE();
}

inherits(HSTORE, ABSTRACT);

HSTORE.prototype.key = HSTORE.key = 'HSTORE';

HSTORE.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
};

/**
 * JSON data type - JSON string
 */
function JSONTYPE() {
  if (!(this instanceof JSONTYPE)) return new JSONTYPE();
}

inherits(JSONTYPE, ABSTRACT);

JSONTYPE.prototype.key = JSONTYPE.key = 'JSON';

JSONTYPE.prototype.validate = function validate() {
  return true;
};

/**
 * Stringifies JSON value for SQL
 * @param {*} value - Value to stringify
 * @returns {string} JSON string
 */
function stringifyJson(value) {
  return JSON.stringify(value);
}

JSONTYPE.prototype._stringify = function _stringify(value) {
  return stringifyJson.call(this, value);
};

/**
 * JSONB data type - binary JSON
 */
function JSONB() {
  if (!(this instanceof JSONB)) return new JSONB();
  JSONTYPE.call(this);
}

inherits(JSONB, JSONTYPE);

JSONB.prototype.key = JSONB.key = 'JSONB';

/**
 * NOW data type - current timestamp
 */
function NOW() {
  if (!(this instanceof NOW)) return new NOW();
}

inherits(NOW, ABSTRACT);

NOW.prototype.key = NOW.key = 'NOW';

/**
 * BLOB data type - binary storage
 * @param {number|string|object} length - Length or options object
 */
function BLOB(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BLOB)) return new BLOB(options);
  this.options = options;
  this._length = options.length || '';
}

inherits(BLOB, ABSTRACT);

BLOB.prototype.key = BLOB.key = 'BLOB';

/**
 * Converts BLOB length specifier to SQL type
 * @returns {string} SQL type name
 */
function getBlobSqlType() {
  const lengthMap = {
    tiny: 'TINYBLOB',
    medium: 'MEDIUMBLOB',
    long: 'LONGBLOB',
    default: 'BLOB'
  };
  return lengthMap[this._length.toLowerCase()] || lengthMap.default;
}

BLOB.prototype.toSql = function toSql() {
  return getBlobSqlType.call(this);
};

BLOB.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
};

BLOB.prototype.escape = false;

/**
 * Stringifies BLOB value for SQL
 * @param {*} value - Value to stringify
 * @returns {string} Hex string
 */
function stringifyBlob(value) {
  if (!Buffer.isBuffer(value)) {
    if (Array.isArray(value)) {
      value = new Buffer(value);
    } else {
      value = new Buffer(value.toString());
    }
  }
  const hex = value.toString('hex');
  return this._hexify(hex);
}

/**
 * Converts hex string to SQL hex literal
 * @param {string} hex - Hex string
 * @returns {string} SQL hex literal
 */
function hexify(hex) {
  return "X'" + hex + "'";
}

BLOB.prototype._stringify = function _stringify(value) {
  return stringifyBlob.call(this, value);
};

BLOB.prototype._hexify = function _hexify(hex) {
  return hexify.call(this, hex);
};

/**
 * RANGE data type - range of values
 * @param {object|string} subtype - Subtype or options object
 */
function RANGE(subtype) {
  const options = _.isPlainObject(subtype) ? subtype : {subtype};

  if (!options.subtype) options.subtype = new INTEGER();

  if (_.isFunction(options.subtype)) {
    options.subtype = new options.subtype();
  }

  if (!(this instanceof RANGE)) return new RANGE(options);

  this._subtype = options.subtype.key;
  this.options = options;
}

inherits(RANGE, ABSTRACT);

const pgRangeSubtypes = {
  integer: 'int4range',
  bigint: 'int8range',
  decimal: 'numrange',
  dateonly: 'daterange',
  date: 'tstzrange',
  datenotz: 'tsrange'
};

const pgRangeCastTypes = {
  integer: 'integer',
  bigint: 'bigint',
  decimal: 'numeric',
  dateonly: 'date',
  date: 'timestamptz',
  datenotz: 'timestamp'
};

/**
 * Generates SQL type for range
 * @returns {string} SQL type name
 */
function getRangeSqlType() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
}

/**
 * Generates cast type for range
 * @returns {string} Cast type name
 */
function getRangeCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
}

RANGE.prototype.key = RANGE.key = 'RANGE';

RANGE.prototype.toSql = function toSql() {
  return getRangeSqlType.call(this);
};

RANGE.prototype.toCastType = function toCastType() {
  return getRangeCastType.call(this);
};

RANGE.prototype.validate = function validate(value) {
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
};

/**
 * UUID data type - unique identifier
 */
function UUID() {
  if (!(this instanceof UUID)) return new UUID();
}

inherits(UUID, ABSTRACT);

UUID.prototype.key = UUID.key = 'UUID';

UUID.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * UUIDV1 data type - UUID v1 default value
 */
function UUIDV1() {
  if (!(this instanceof UUIDV1)) return new UUIDV1();
}

inherits(UUIDV1, ABSTRACT);

UUIDV1.prototype.key = UUIDV1.key = 'UUIDV1';

UUIDV1.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * UUIDV4 data type - UUID v4 default value
 */
function UUIDV4() {
  if (!(this instanceof UUIDV4)) return new UUIDV4();
}

inherits(UUIDV4, ABSTRACT);

UUIDV4.prototype.key = UUIDV4.key = 'UUIDV4';

UUIDV4.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }
  return true;
};

/**
 * VIRTUAL data type - virtual column
 * @param {Function} ReturnType - Return type
 * @param {string[]} fields - Dependency fields
 */
function VIRTUAL(ReturnType, fields) {
  if (!(this instanceof VIRTUAL)) return new VIRTUAL(ReturnType, fields);
  if (typeof ReturnType === 'function') ReturnType = new ReturnType();

  this.returnType = ReturnType;
  this.fields = fields;
}

inherits(VIRTUAL, ABSTRACT);

VIRTUAL.prototype.key = VIRTUAL.key = 'VIRTUAL';

/**
 * ENUM data type - enumerated values
 * @param {string|string[]} value - Enum values
 */
function ENUM(value) {
  const options = typeof value === 'object' && !Array.isArray(value) && value || {
    values: Array.prototype.slice.call(arguments).reduce((result, element) => {
      return result.concat(Array.isArray(element) ? element : [element]);
    }, [])
  };
  if (!(this instanceof ENUM)) return new ENUM(options);
  this.values = options.values;
  this.options = options;
}

inherits(ENUM, ABSTRACT);

ENUM.prototype.key = ENUM.key = 'ENUM';

ENUM.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }
  return true;
};

/**
 * ARRAY data type - array of values
 * @param {Function|object} type - Element type or options object
 */
function ARRAY(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ARRAY)) return new ARRAY(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}

inherits(ARRAY, ABSTRACT);

ARRAY.prototype.key = ARRAY.key = 'ARRAY';

ARRAY.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

ARRAY.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }
  return true;
};

ARRAY.is = function is(obj, type) {
  return obj instanceof ARRAY && obj.type instanceof type;
};

/**
 * Helper types for property accessors
 */
const helpers = {
  BINARY: [STRING, CHAR],
  UNSIGNED: [NUMBER, TINYINT, SMALLINT, MEDIUMINT, INTEGER, BIGINT, FLOAT, DOUBLE, REAL, DECIMAL],
  ZEROFILL: [NUMBER, TINYINT, SMALLINT, MEDIUMINT, INTEGER, BIGINT, FLOAT, DOUBLE, REAL, DECIMAL],
  PRECISION: [DECIMAL],
  SCALE: [DECIMAL]
};

/**
 * Sets helper property accessor for data type
 * @param {string} helper - Helper name
 * @param {Function} dataType - Data type constructor
 */
function setHelperProperty(helper, dataType) {
  if (!DataType[helper]) {
    Object.defineProperty(DataType, helper, {
      get() {
        const dataType = new DataType();
        if (typeof dataType[helper] === 'object') {
          return dataType;
        }
        return dataType[helper].apply(dataType, arguments);
      }
    });
  }
}

for (const helper of Object.keys(helpers)) {
  for (const DataType of helpers[helper]) {
    setHelperProperty(helper, DataType);
  }
}

/**
 * GEOMETRY data type - spatial geometry
 * @param {string|object} type - Geometry type or options object
 * @param {string} srid - Spatial reference ID
 */
function GEOMETRY(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};

  if (!(this instanceof GEOMETRY)) return new GEOMETRY(options);

  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}

inherits(GEOMETRY, ABSTRACT);

GEOMETRY.prototype.key = GEOMETRY.key = 'GEOMETRY';

GEOMETRY.prototype.escape = false;

/**
 * Stringifies geometry value for SQL
 * @param {*} value - Value to stringify
 * @param {object} options - Options object
 * @returns {string} SQL geometry expression
 */
function stringifyGeometry(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
}

GEOMETRY.prototype._stringify = function _stringify(value, options) {
  return stringifyGeometry.call(this, value, options);
};

/**
 * GEOGRAPHY data type - spatial geography
 * @param {string|object} type - Geography type or options object
 * @param {string} srid - Spatial reference ID
 */
function GEOGRAPHY(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};

  if (!(this instanceof GEOGRAPHY)) return new GEOGRAPHY(options);

  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}

inherits(GEOGRAPHY, ABSTRACT);

GEOGRAPHY.prototype.key = GEOGRAPHY.key = 'GEOGRAPHY';

GEOGRAPHY.prototype.escape = false;

GEOGRAPHY.prototype._stringify = function _stringify(value, options) {
  return stringifyGeometry.call(this, value, options);
};

/**
 * CIDR data type - IP range
 */
function CIDR() {
  if (!(this instanceof CIDR)) return new CIDR();
}

inherits(CIDR, ABSTRACT);

CIDR.prototype.key = CIDR.key = 'CIDR';

CIDR.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }
  return true;
};

/**
 * INET data type - IP address
 */
function INET() {
  if (!(this instanceof INET)) return new INET();
}

inherits(INET, ABSTRACT);

INET.prototype.key = INET.key = 'INET';

INET.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }
  return true;
};

/**
 * MACADDR data type - MAC address
 */
function MACADDR() {
  if (!(this instanceof MACADDR)) return new MACADDR();
}

inherits(MACADDR, ABSTRACT);

MACADDR.prototype.key = MACADDR.key = 'MACADDR';

MACADDR.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
};

/**
 * A convenience class holding commonly used data types.
 * Used when defining a new model using `Sequelize.define`.
 *
 * @property {function(length=255: integer)} STRING A variable length string
 * @property {function(length=255: integer)} CHAR A fixed length string.
 * @property {function(length: string)} TEXT An unlimited length text column. Available lengths: `tiny`, `medium`, `long`
 * @property {function(length: integer)} TINYINT A 8 bit integer.
 * @property {function(length: integer)} SMALLINT A 16 bit integer.
 * @property {function(length: integer)} MEDIUMINT A 24 bit integer.
 * @property {function(length=255: integer)} INTEGER A 32 bit integer.
 * @property {function(length: integer)} BIGINT A 64 bit integer.
 * @property {function(length: integer, decimals: integer)} FLOAT Floating point number (4-byte precision).
 * @property {function(length: integer, decimals: integer)} DOUBLE Floating point number (8-byte precision).
 * @property {function(precision: integer, scale: integer)} DECIMAL Decimal number.
 * @property {function(length: integer, decimals: integer)} REAL Floating point number (4-byte precision).
 * @property {function} BOOLEAN A boolean / tinyint column, depending on dialect
 * @property {function(length: string)} BLOB Binary storage. Available lengths: `tiny`, `medium`, `long`
 * @property {function(values: string[])} ENUM An enumeration. `DataTypes.ENUM('value', 'another value')`.
 * @property {function(length: integer)} DATE A datetime column
 * @property {function} DATEONLY A date only column (no timestamp)
 * @property {function} TIME A time column
 * @property {function} NOW A default value of the current timestamp
 * @property {function} UUID A column storing a unique universal identifier. Use with `UUIDV1` or `UUIDV4` for default values.
 * @property {function} UUIDV1 A default unique universal identifier generated following the UUID v1 standard
 * @property {function} UUIDV4 A default unique universal identifier generated following the UUID v4 standard
 * @property {function} HSTORE A key / value store column. Only available in Postgres.
 * @property {function} JSON A JSON string column. Available in MySQL, Postgres and SQLite
 * @property {function} JSONB A binary storage JSON column. Only available in Postgres.
 * @property {function(type: DataTypes)} ARRAY An array of `type`, e.g. `DataTypes.ARRAY(DataTypes.DECIMAL)`. Only available in Postgres.
 * @property {function(type: DataTypes)} RANGE Range types are data types representing a range of values of some element type (called the range's subtype).
 * Only available in Postgres. See [the Postgres documentation](http://www.postgresql.org/docs/9.4/static/rangetypes.html) for more details
 * @property {function(type: string, srid: string)} GEOMETRY A column storing Geometry information. It is only available in PostgreSQL (with PostGIS) or MySQL.
 * @property {function(type: string, srid: string)} GEOGRAPHY A geography datatype represents two dimensional spacial objects in an elliptic coord system.
 * @property {function(returnType: DataTypes, fields: string[])} VIRTUAL A virtual value that is not stored in the DB.
 */
const DataTypes = module.exports = {
  ABSTRACT,
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

DataTypes.postgres = require('./dialects/postgres/data-types')(DataTypes);
DataTypes.mysql = require('./dialects/mysql/data-types')(DataTypes);
DataTypes.sqlite = require('./dialects/sqlite/data-types')(DataTypes);
DataTypes.mssql = require('./dialects/mssql/data-types')(DataTypes);

module.exports = DataTypes;