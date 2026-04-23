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
 * Provides common functionality like toString, toSql, and stringify.
 */
function ABSTRACT() {}

ABSTRACT.prototype.dialectTypes = '';

/**
 * Returns the SQL representation of the data type.
 * @param {Object} options - Optional configuration options.
 * @returns {string} SQL representation.
 */
ABSTRACT.prototype.toString = function toString(options) {
  return this.toSql(options);
};

/**
 * Returns the SQL representation of the data type.
 * @returns {string} SQL representation.
 */
ABSTRACT.prototype.toSql = function toSql() {
  return this.key;
};

/**
 * Logs a warning message if it hasn't been logged before.
 * @param {string} link - The link to check.
 * @param {string} text - The warning text.
 */
ABSTRACT.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};

/**
 * Stringifies a value based on the data type's specific stringify method.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration options.
 * @returns {*} Stringified value.
 */
ABSTRACT.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};

/**
 * STRING data type for variable length strings.
 * @param {Object|string} length - Length or options object.
 * @param {boolean} binary - Whether the string is binary.
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

/**
 * Returns the SQL representation for STRING.
 * @returns {string} SQL representation.
 */
STRING.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Validates that the value is a string.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid string.
 */
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
 * CHAR data type for fixed length strings.
 * @param {Object|string} length - Length or options object.
 * @param {boolean} binary - Whether the string is binary.
 */
function CHAR(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof CHAR)) return new CHAR(options);
  STRING.apply(this, arguments);
}
inherits(CHAR, STRING);

CHAR.prototype.key = CHAR.key = 'CHAR';

/**
 * Returns the SQL representation for CHAR.
 * @returns {string} SQL representation.
 */
CHAR.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * TEXT data type for unlimited length text.
 * @param {Object|string} length - Length or options object.
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
 * Returns the SQL representation for TEXT based on length.
 * @returns {string} SQL representation.
 */
TEXT.prototype.toSql = function toSql() {
  const length = this._length.toLowerCase();
  if (length === 'tiny') return 'TINYTEXT';
  if (length === 'medium') return 'MEDIUMTEXT';
  if (length === 'long') return 'LONGTEXT';
  return this.key;
};

/**
 * Validates that the value is a string.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid string.
 */
TEXT.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }

  return true;
};

/**
 * NUMBER data type for numeric values.
 * @param {Object} options - Options object.
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
 * Returns the SQL representation for NUMBER.
 * @returns {string} SQL representation.
 */
NUMBER.prototype.toSql = function toSql() {
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
};

/**
 * Validates that the value is a float.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid float.
 */
NUMBER.prototype.validate = function(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};

/**
 * Stringifies a number value.
 * @param {*} number - The number to stringify.
 * @returns {*} Stringified number.
 */
NUMBER.prototype._stringify = function _stringify(number) {
  if (typeof number === 'number' || typeof number === 'boolean' || number === null || number === undefined) {
    return number;
  }

  if (typeof number.toString === 'function') {
    return number.toString();
  }

  return number;
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
 * INTEGER data type for 32-bit integers.
 * @param {Object|string} length - Length or options object.
 */
function INTEGER(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof INTEGER)) return new INTEGER(options);
  NUMBER.call(this, options);
}
inherits(INTEGER, NUMBER);

INTEGER.prototype.key = INTEGER.key = 'INTEGER';

/**
 * Validates that the value is an integer.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid integer.
 */
INTEGER.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};

/**
 * TINYINT data type for 8-bit integers.
 * @param {Object|string} length - Length or options object.
 */
function TINYINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TINYINT)) return new TINYINT(options);
  NUMBER.call(this, options);
}
inherits(TINYINT, INTEGER);

TINYINT.prototype.key = TINYINT.key = 'TINYINT';

/**
 * SMALLINT data type for 16-bit integers.
 * @param {Object|string} length - Length or options object.
 */
function SMALLINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SMALLINT)) return new SMALLINT(options);
  NUMBER.call(this, options);
}
inherits(SMALLINT, INTEGER);

SMALLINT.prototype.key = SMALLINT.key = 'SMALLINT';

/**
 * MEDIUMINT data type for 24-bit integers.
 * @param {Object|string} length - Length or options object.
 */
function MEDIUMINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MEDIUMINT)) return new MEDIUMINT(options);
  NUMBER.call(this, options);
}
inherits(MEDIUMINT, INTEGER);

MEDIUMINT.prototype.key = MEDIUMINT.key = 'MEDIUMINT';

/**
 * BIGINT data type for 64-bit integers.
 * @param {Object|string} length - Length or options object.
 */
function BIGINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BIGINT)) return new BIGINT(options);
  NUMBER.call(this, options);
}
inherits(BIGINT, INTEGER);

BIGINT.prototype.key = BIGINT.key = 'BIGINT';

/**
 * FLOAT data type for 4-byte precision floating point numbers.
 * @param {Object|string} length - Length or options object.
 * @param {number} decimals - Number of decimals.
 */
function FLOAT(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof FLOAT)) return new FLOAT(options);
  NUMBER.call(this, options);
}
inherits(FLOAT, NUMBER);

FLOAT.prototype.key = FLOAT.key = 'FLOAT';

/**
 * Validates that the value is a float.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid float.
 */
FLOAT.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }

  return true;
};

/**
 * REAL data type for 4-byte precision floating point numbers.
 * @param {Object|string} length - Length or options object.
 * @param {number} decimals - Number of decimals.
 */
function REAL(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof REAL)) return new REAL(options);
  NUMBER.call(this, options);
}
inherits(REAL, NUMBER);

REAL.prototype.key = REAL.key = 'REAL';

/**
 * DOUBLE data type for 8-byte precision floating point numbers.
 * @param {Object|string} length - Length or options object.
 * @param {number} decimals - Number of decimals.
 */
function DOUBLE(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DOUBLE)) return new DOUBLE(options);
  NUMBER.call(this, options);
}
inherits(DOUBLE, NUMBER);

DOUBLE.prototype.key = DOUBLE.key = 'DOUBLE PRECISION';

/**
 * DECIMAL data type for decimal numbers.
 * @param {Object} precision - Precision and scale options.
 */
function DECIMAL(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DECIMAL)) return new DECIMAL(options);
  NUMBER.call(this, options);
}
inherits(DECIMAL, NUMBER);

DECIMAL.prototype.key = DECIMAL.key = 'DECIMAL';

/**
 * Returns the SQL representation for DECIMAL.
 * @returns {string} SQL representation.
 */
DECIMAL.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }
  return 'DECIMAL';
};

/**
 * Validates that the value is a decimal.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid decimal.
 */
DECIMAL.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }

  return true;
};

// Apply escape and stringify to floating point types
for (const floating of [FLOAT, DOUBLE, REAL]) {
  floating.prototype.escape = false;
  floating.prototype._stringify = function _stringify(value) {
    if (isNaN(value)) {
      return "'NaN'";
    } else if (!isFinite(value)) {
      const sign = value < 0 ? '-' : '';
      return "'" + sign + "Infinity'";
    }

    return value;
  };
}

/**
 * BOOLEAN data type for boolean values.
 */
function BOOLEAN() {
  if (!(this instanceof BOOLEAN)) return new BOOLEAN();
}
inherits(BOOLEAN, ABSTRACT);

BOOLEAN.prototype.key = BOOLEAN.key = 'BOOLEAN';

/**
 * Returns the SQL representation for BOOLEAN.
 * @returns {string} SQL representation.
 */
BOOLEAN.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

/**
 * Validates that the value is a boolean.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid boolean.
 */
BOOLEAN.prototype.validate = function validate(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }

  return true;
};

/**
 * Sanitizes a boolean value.
 * @param {*} value - The value to sanitize.
 * @returns {*} Sanitized boolean value.
 */
BOOLEAN.prototype._sanitize = function _sanitize(value) {
  if (value !== null && value !== undefined) {
    if (Buffer.isBuffer(value) && value.length === 1) {
      // Bit fields are returned as buffers
      value = value[0];
    }

    if (_.isString(value)) {
      // Only take action on valid boolean strings.
      value = value === 'true' ? true : value === 'false' ? false : value;

    } else if (_.isNumber(value)) {
      // Only take action on valid boolean integers.
      value = value === 1 ? true : value === 0 ? false : value;
    }
  }

  return value;
};
BOOLEAN.parse = BOOLEAN.prototype._sanitize;

/**
 * TIME data type for time values.
 */
function TIME() {
  if (!(this instanceof TIME)) return new TIME();
}
inherits(TIME, ABSTRACT);

TIME.prototype.key = TIME.key = 'TIME';

/**
 * Returns the SQL representation for TIME.
 * @returns {string} SQL representation.
 */
TIME.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * DATE data type for datetime values.
 * @param {Object|string} length - Length or options object.
 */
function DATE(length) {
  const options = typeof length === 'object' && length || {length};

  if (!(this instanceof DATE)) return new DATE(options);

  this.options = options;
  this._length = options.length || '';
}
inherits(DATE, ABSTRACT);

DATE.prototype.key = DATE.key = 'DATE';

/**
 * Returns the SQL representation for DATE.
 * @returns {string} SQL representation.
 */
DATE.prototype.toSql = function toSql() {
  return 'DATETIME';
};

/**
 * Validates that the value is a date.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid date.
 */
DATE.prototype.validate = function validate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }

  return true;
};

/**
 * Sanitizes a date value.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration options.
 * @returns {*} Sanitized date value.
 */
DATE.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }

  return value;
};

/**
 * Checks if a date value has changed.
 * @param {*} value - The new value.
 * @param {*} originalValue - The original value.
 * @returns {boolean} True if changed.
 */
DATE.prototype._isChanged = function _isChanged(value, originalValue) {
  if (
    originalValue && !!value &&
    (
      value === originalValue ||
      value instanceof Date && originalValue instanceof Date && value.getTime() === originalValue.getTime()
    )
  ) {
    return false;
  }

  // not changed when set to same empty value
  if (!originalValue && !value && originalValue === value) {
    return false;
  }

  return true;
};

/**
 * Applies timezone to a date value.
 * @param {Date} date - The date to apply timezone to.
 * @param {Object} options - Optional configuration options.
 * @returns {Date} Date with timezone applied.
 */
DATE.prototype._applyTimezone = function _applyTimezone(date, options) {
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
};

/**
 * Stringifies a date value.
 * @param {Date} date - The date to stringify.
 * @param {Object} options - Optional configuration options.
 * @returns {string} Stringified date.
 */
DATE.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);

  // Z here means current timezone, _not_ UTC
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

/**
 * DATEONLY data type for date-only values.
 */
function DATEONLY() {
  if (!(this instanceof DATEONLY)) return new DATEONLY();
}
util.inherits(DATEONLY, ABSTRACT);

DATEONLY.prototype.key = DATEONLY.key = 'DATEONLY';

/**
 * Returns the SQL representation for DATEONLY.
 * @returns {string} SQL representation.
 */
DATEONLY.prototype.toSql = function() {
  return 'DATE';
};

/**
 * Stringifies a date-only value.
 * @param {Date} date - The date to stringify.
 * @returns {string} Stringified date.
 */
DATEONLY.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};

/**
 * Sanitizes a date-only value.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration options.
 * @returns {*} Sanitized date value.
 */
DATEONLY.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }

  return value;
};

/**
 * Checks if a date-only value has changed.
 * @param {*} value - The new value.
 * @param {*} originalValue - The original value.
 * @returns {boolean} True if changed.
 */
DATEONLY.prototype._isChanged = function _isChanged(value, originalValue) {
  if (originalValue && !!value && originalValue === value) {
    return false;
  }

  // not changed when set to same empty value
  if (!originalValue && !value && originalValue === value) {
    return false;
  }

  return true;
};

/**
 * HSTORE data type for key-value stores.
 */
function HSTORE() {
  if (!(this instanceof HSTORE)) return new HSTORE();
}
inherits(HSTORE, ABSTRACT);

HSTORE.prototype.key = HSTORE.key = 'HSTORE';

/**
 * Validates that the value is a plain object.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid hstore.
 */
HSTORE.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }

  return true;
};

/**
 * JSON data type for JSON strings.
 */
function JSONTYPE() {
  if (!(this instanceof JSONTYPE)) return new JSONTYPE();
}
inherits(JSONTYPE, ABSTRACT);

JSONTYPE.prototype.key = JSONTYPE.key = 'JSON';

/**
 * Validates that the value is valid JSON.
 * @returns {boolean} True if valid.
 */
JSONTYPE.prototype.validate = function validate() {
  return true;
};

/**
 * Stringifies a value as JSON.
 * @param {*} value - The value to stringify.
 * @returns {string} Stringified JSON.
 */
JSONTYPE.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

/**
 * JSONB data type for binary JSON storage.
 */
function JSONB() {
  if (!(this instanceof JSONB)) return new JSONB();
  JSONTYPE.call(this);
}
inherits(JSONB, JSONTYPE);

JSONB.prototype.key = JSONB.key = 'JSONB';

/**
 * NOW data type for current timestamp.
 */
function NOW() {
  if (!(this instanceof NOW)) return new NOW();
}
inherits(NOW, ABSTRACT);

NOW.prototype.key = NOW.key = 'NOW';

/**
 * BLOB data type for binary storage.
 * @param {Object|string} length - Length or options object.
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
 * Returns the SQL representation for BLOB based on length.
 * @returns {string} SQL representation.
 */
BLOB.prototype.toSql = function toSql() {
  const length = this._length.toLowerCase();
  if (length === 'tiny') return 'TINYBLOB';
  if (length === 'medium') return 'MEDIUMBLOB';
  if (length === 'long') return 'LONGBLOB';
  return this.key;
};

/**
 * Validates that the value is a string or buffer.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid blob.
 */
BLOB.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }

  return true;
};

BLOB.prototype.escape = false;

/**
 * Stringifies a blob value.
 * @param {*} value - The value to stringify.
 * @returns {string} Stringified blob.
 */
BLOB.prototype._stringify = function _stringify(value) {
  if (!Buffer.isBuffer(value)) {
    if (Array.isArray(value)) {
      value = new Buffer(value);
    } else {
      value = new Buffer(value.toString());
    }
  }
  const hex = value.toString('hex');

  return this._hexify(hex);
};

/**
 * Converts a hex string to SQL hex format.
 * @param {string} hex - The hex string.
 * @returns {string} SQL hex format.
 */
BLOB.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

/**
 * RANGE data type for range values.
 * @param {Object|string} subtype - Subtype or options object.
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

RANGE.prototype.key = RANGE.key = 'RANGE';

/**
 * Returns the SQL representation for RANGE.
 * @returns {string} SQL representation.
 */
RANGE.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};

/**
 * Returns the cast type for RANGE.
 * @returns {string} Cast type.
 */
RANGE.prototype.toCastType = function toCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};

/**
 * Validates that the value is a valid range.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid range.
 */
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
 * UUID data type for unique universal identifiers.
 */
function UUID() {
  if (!(this instanceof UUID)) return new UUID();
}
inherits(UUID, ABSTRACT);

UUID.prototype.key = UUID.key = 'UUID';

/**
 * Validates that the value is a valid UUID.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration options.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid uuid.
 */
UUID.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

/**
 * UUIDV1 data type for UUID v1 default values.
 */
function UUIDV1() {
  if (!(this instanceof UUIDV1)) return new UUIDV1();
}
inherits(UUIDV1, ABSTRACT);

UUIDV1.prototype.key = UUIDV1.key = 'UUIDV1';

/**
 * Validates that the value is a valid UUID.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration options.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid uuid.
 */
UUIDV1.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

/**
 * UUIDV4 data type for UUID v4 default values.
 */
function UUIDV4() {
  if (!(this instanceof UUIDV4)) return new UUIDV4();
}
inherits(UUIDV4, ABSTRACT);

UUIDV4.prototype.key = UUIDV4.key = 'UUIDV4';

/**
 * Validates that the value is a valid UUID v4.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration options.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid uuidv4.
 */
UUIDV4.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }

  return true;
};

/**
 * VIRTUAL data type for virtual values.
 * @param {function} ReturnType - The return type.
 * @param {string[]} fields - The dependency fields.
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
 * ENUM data type for enumerated values.
 * @param {string|Array} value - The value or values.
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

/**
 * Validates that the value is a valid choice in the enum.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid choice.
 */
ENUM.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }

  return true;
};

/**
 * ARRAY data type for array values.
 * @param {Object} type - The type or options object.
 */
function ARRAY(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ARRAY)) return new ARRAY(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}
inherits(ARRAY, ABSTRACT);

ARRAY.prototype.key = ARRAY.key = 'ARRAY';

/**
 * Returns the SQL representation for ARRAY.
 * @returns {string} SQL representation.
 */
ARRAY.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

/**
 * Validates that the value is an array.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid array.
 */
ARRAY.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }

  return true;
};

/**
 * Checks if an object is an array of a specific type.
 * @param {Object} obj - The object to check.
 * @param {function} type - The type to check against.
 * @returns {boolean} True if the object is an array of the specified type.
 */
ARRAY.is = function is(obj, type) {
  return obj instanceof ARRAY && obj.type instanceof type;
};

const helpers = {
  BINARY: [STRING, CHAR],
  UNSIGNED: [NUMBER, TINYINT, SMALLINT, MEDIUMINT, INTEGER, BIGINT, FLOAT, DOUBLE, REAL, DECIMAL],
  ZEROFILL: [NUMBER, TINYINT, SMALLINT, MEDIUMINT, INTEGER, BIGINT, FLOAT, DOUBLE, REAL, DECIMAL],
  PRECISION: [DECIMAL],
  SCALE: [DECIMAL]
};

/**
 * GEOMETRY data type for geometry information.
 * @param {Object|string} type - The type or options object.
 * @param {string} srid - The SRID.
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
 * Stringifies a geometry value.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration options.
 * @returns {string} Stringified geometry.
 */
GEOMETRY.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * GEOGRAPHY data type for geography information.
 * @param {Object|string} type - The type or options object.
 * @param {string} srid - The SRID.
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

/**
 * Stringifies a geography value.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration options.
 * @returns {string} Stringified geography.
 */
GEOGRAPHY.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * CIDR data type for IP ranges.
 */
function CIDR() {
  if (!(this instanceof CIDR)) return new CIDR();
}
inherits(CIDR, ABSTRACT);

CIDR.prototype.key = CIDR.key = 'CIDR';

/**
 * Validates that the value is a valid CIDR.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid CIDR.
 */
CIDR.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }

  return true;
};

/**
 * INET data type for IP addresses.
 */
function INET() {
  if (!(this instanceof INET)) return new INET();
}
inherits(INET, ABSTRACT);

INET.prototype.key = INET.key = 'INET';

/**
 * Validates that the value is a valid IP address.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid INET.
 */
INET.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }

  return true;
};

/**
 * MACADDR data type for MAC addresses.
 */
function MACADDR() {
  if (!(this instanceof MACADDR)) return new MACADDR();
}
inherits(MACADDR, ABSTRACT);

MACADDR.prototype.key = MACADDR.key = 'MACADDR';

/**
 * Validates that the value is a valid MAC address.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid MACADDR.
 */
MACADDR.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }

  return true;
};

// Apply helper properties to data types
for (const helper of Object.keys(helpers)) {
  for (const DataType of helpers[helper]) {
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
}

/**
 * A convenience class holding commonly used data types.
 * The datatypes are used when defining a new model using `Sequelize.define`.
 *
 * To provide a length for the data type, you can invoke it like a function: `INTEGER(2)`
 *
 * Some data types have special properties that can be accessed in order to change the data type.
 * For example, to get an unsigned integer with zerofill you can do `DataTypes.INTEGER.UNSIGNED.ZEROFILL`.
 *
 * Three of the values provided here (`NOW`, `UUIDV1` and `UUIDV4`) are special default values, that should not be used to define types.
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
 * @property {function(type: string, srid: string)} GEOMETRY A column storing Geometry information.
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