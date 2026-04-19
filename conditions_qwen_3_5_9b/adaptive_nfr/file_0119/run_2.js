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
 * Returns the SQL representation of this data type.
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
 * Validates a value against the data type constraints.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
ABSTRACT.prototype.validate = function validate(value) {
  return true;
};

/**
 * Sanitizes a value before storage.
 * @param {*} value - The value to sanitize
 * @param {Object} options - Optional configuration options
 * @returns {*} Sanitized value
 */
ABSTRACT.prototype._sanitize = function _sanitize(value, options) {
  return value;
};

/**
 * Checks if a value has changed from the original.
 * @param {*} value - The new value
 * @param {*} originalValue - The original value
 * @returns {boolean} True if changed
 */
ABSTRACT.prototype._isChanged = function _isChanged(value, originalValue) {
  return true;
};

/**
 * Applies timezone to a date value.
 * @param {Date} date - The date to apply timezone to
 * @param {Object} options - Optional configuration options
 * @returns {Date} Date with timezone applied
 */
ABSTRACT.prototype._applyTimezone = function _applyTimezone(date, options) {
  return date;
};

/**
 * Converts a value to SQL string representation.
 * @param {*} value - The value to stringify
 * @param {Object} options - Optional configuration options
 * @returns {string} SQL string representation
 */
ABSTRACT.prototype._stringify = function _stringify(value, options) {
  return value;
};

/**
 * Returns the hex representation of a buffer value.
 * @param {string} hex - The hex string
 * @returns {string} Hexified string
 */
ABSTRACT.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

/**
 * Creates a STRING data type instance.
 * @param {number|string} length - Maximum length of the string
 * @param {boolean} binary - Whether the string is binary
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
 * Returns the SQL representation for STRING type.
 * @returns {string} SQL representation
 */
STRING.prototype.toSql = function toSql() {
  const length = this._length;
  const binarySuffix = this._binary ? ' BINARY' : '';
  return 'VARCHAR(' + length + ')' + binarySuffix;
};

/**
 * Validates that the value is a string.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
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

/**
 * Enables binary mode for the STRING type.
 * @returns {STRING} This instance
 */
Object.defineProperty(STRING.prototype, 'BINARY', {
  get() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
});

/**
 * Creates a CHAR data type instance.
 * @param {number|string} length - Maximum length of the string
 * @param {boolean} binary - Whether the string is binary
 */
function CHAR(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof CHAR)) return new CHAR(options);
  STRING.apply(this, arguments);
}
inherits(CHAR, STRING);

CHAR.prototype.key = CHAR.key = 'CHAR';

/**
 * Returns the SQL representation for CHAR type.
 * @returns {string} SQL representation
 */
CHAR.prototype.toSql = function toSql() {
  const length = this._length;
  const binarySuffix = this._binary ? ' BINARY' : '';
  return 'CHAR(' + length + ')' + binarySuffix;
};

/**
 * Creates a TEXT data type instance.
 * @param {string} length - The text length type (tiny, medium, long, or empty)
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
 * Returns the SQL representation for TEXT type based on length.
 * @returns {string} SQL representation
 */
TEXT.prototype.toSql = function toSql() {
  const lengthMap = {
    tiny: 'TINYTEXT',
    medium: 'MEDIUMTEXT',
    long: 'LONGTEXT'
  };
  const lowerLength = this._length.toLowerCase();
  return lengthMap[lowerLength] || this.key;
};

/**
 * Validates that the value is a string.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
TEXT.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

/**
 * Creates a NUMBER data type instance.
 * @param {Object} options - Configuration options for the number type
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
 * Returns the SQL representation for NUMBER type.
 * @returns {string} SQL representation
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
 * Validates that the value is a valid number.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
NUMBER.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

/**
 * Stringifies a number value for SQL representation.
 * @param {*} number - The number to stringify
 * @returns {*} Stringified value
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

/**
 * Enables unsigned mode for the NUMBER type.
 * @returns {NUMBER} This instance
 */
Object.defineProperty(NUMBER.prototype, 'UNSIGNED', {
  get() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }
});

/**
 * Enables zerofill mode for the NUMBER type.
 * @returns {NUMBER} This instance
 */
Object.defineProperty(NUMBER.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

/**
 * Creates an INTEGER data type instance.
 * @param {number|string} length - The integer length
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
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
INTEGER.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

/**
 * Creates a TINYINT data type instance.
 * @param {number|string} length - The tinyint length
 */
function TINYINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TINYINT)) return new TINYINT(options);
  NUMBER.call(this, options);
}
inherits(TINYINT, INTEGER);

TINYINT.prototype.key = TINYINT.key = 'TINYINT';

/**
 * Creates a SMALLINT data type instance.
 * @param {number|string} length - The smallint length
 */
function SMALLINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SMALLINT)) return new SMALLINT(options);
  NUMBER.call(this, options);
}
inherits(SMALLINT, INTEGER);

SMALLINT.prototype.key = SMALLINT.key = 'SMALLINT';

/**
 * Creates a MEDIUMINT data type instance.
 * @param {number|string} length - The mediumint length
 */
function MEDIUMINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MEDIUMINT)) return new MEDIUMINT(options);
  NUMBER.call(this, options);
}
inherits(MEDIUMINT, INTEGER);

MEDIUMINT.prototype.key = MEDIUMINT.key = 'MEDIUMINT';

/**
 * Creates a BIGINT data type instance.
 * @param {number|string} length - The bigint length
 */
function BIGINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BIGINT)) return new BIGINT(options);
  NUMBER.call(this, options);
}
inherits(BIGINT, INTEGER);

BIGINT.prototype.key = BIGINT.key = 'BIGINT';

/**
 * Creates a FLOAT data type instance.
 * @param {number|string} length - The float length
 * @param {number|string} decimals - The float decimals
 */
function FLOAT(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof FLOAT)) return new FLOAT(options);
  NUMBER.call(this, options);
}
inherits(FLOAT, NUMBER);

FLOAT.prototype.key = FLOAT.key = 'FLOAT';

/**
 * Validates that the value is a valid float.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
FLOAT.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }
  return true;
};

/**
 * Creates a REAL data type instance.
 * @param {number|string} length - The real length
 * @param {number|string} decimals - The real decimals
 */
function REAL(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof REAL)) return new REAL(options);
  NUMBER.call(this, options);
}
inherits(REAL, NUMBER);

REAL.prototype.key = REAL.key = 'REAL';

/**
 * Creates a DOUBLE data type instance.
 * @param {number|string} length - The double length
 * @param {number|string} decimals - The double decimals
 */
function DOUBLE(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DOUBLE)) return new DOUBLE(options);
  NUMBER.call(this, options);
}
inherits(DOUBLE, NUMBER);

DOUBLE.prototype.key = DOUBLE.key = 'DOUBLE PRECISION';

/**
 * Creates a DECIMAL data type instance.
 * @param {number|string} precision - The decimal precision
 * @param {number|string} scale - The decimal scale
 */
function DECIMAL(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DECIMAL)) return new DECIMAL(options);
  NUMBER.call(this, options);
}
inherits(DECIMAL, NUMBER);

DECIMAL.prototype.key = DECIMAL.key = 'DECIMAL';

/**
 * Returns the SQL representation for DECIMAL type.
 * @returns {string} SQL representation
 */
DECIMAL.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    const parts = [this._precision, this._scale].filter(_.identity);
    return 'DECIMAL(' + parts.join(',') + ')';
  }
  return 'DECIMAL';
};

/**
 * Validates that the value is a valid decimal.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
DECIMAL.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
};

/**
 * Applies escape and stringify logic to floating point types.
 * @param {Function} DataType - The data type to configure
 */
function configureFloatingPoint(DataType) {
  DataType.prototype.escape = false;
  DataType.prototype._stringify = function _stringify(value) {
    if (isNaN(value)) {
      return "'NaN'";
    } else if (!isFinite(value)) {
      const sign = value < 0 ? '-' : '';
      return "'" + sign + "Infinity'";
    }
    return value;
  };
}

configureFloatingPoint(FLOAT);
configureFloatingPoint(DOUBLE);
configureFloatingPoint(REAL);

/**
 * Creates a BOOLEAN data type instance.
 */
function BOOLEAN() {
  if (!(this instanceof BOOLEAN)) return new BOOLEAN();
}
inherits(BOOLEAN, ABSTRACT);

BOOLEAN.prototype.key = BOOLEAN.key = 'BOOLEAN';

/**
 * Returns the SQL representation for BOOLEAN type.
 * @returns {string} SQL representation
 */
BOOLEAN.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

/**
 * Validates that the value is a valid boolean.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
BOOLEAN.prototype.validate = function validate(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }
  return true;
};

/**
 * Sanitizes a boolean value.
 * @param {*} value - The value to sanitize
 * @returns {*} Sanitized value
 */
BOOLEAN.prototype._sanitize = function _sanitize(value) {
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
};

BOOLEAN.parse = BOOLEAN.prototype._sanitize;

/**
 * Creates a TIME data type instance.
 */
function TIME() {
  if (!(this instanceof TIME)) return new TIME();
}
inherits(TIME, ABSTRACT);

TIME.prototype.key = TIME.key = 'TIME';

/**
 * Returns the SQL representation for TIME type.
 * @returns {string} SQL representation
 */
TIME.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * Creates a DATE data type instance.
 * @param {number|string} length - The date length
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
 * Returns the SQL representation for DATE type.
 * @returns {string} SQL representation
 */
DATE.prototype.toSql = function toSql() {
  return 'DATETIME';
};

/**
 * Validates that the value is a valid date.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
DATE.prototype.validate = function validate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }
  return true;
};

/**
 * Sanitizes a date value.
 * @param {*} value - The value to sanitize
 * @param {Object} options - Optional configuration options
 * @returns {*} Sanitized value
 */
DATE.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }
  return value;
};

/**
 * Checks if a date value has changed.
 * @param {*} value - The new value
 * @param {*} originalValue - The original value
 * @returns {boolean} True if changed
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
  if (!originalValue && !value && originalValue === value) {
    return false;
  }
  return true;
};

/**
 * Applies timezone to a date value.
 * @param {Date} date - The date to apply timezone to
 * @param {Object} options - Optional configuration options
 * @returns {Date} Date with timezone applied
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
 * Stringifies a date value for SQL representation.
 * @param {Date} date - The date to stringify
 * @param {Object} options - Optional configuration options
 * @returns {string} SQL string representation
 */
DATE.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

/**
 * Creates a DATEONLY data type instance.
 */
function DATEONLY() {
  if (!(this instanceof DATEONLY)) return new DATEONLY();
}
util.inherits(DATEONLY, ABSTRACT);

DATEONLY.prototype.key = DATEONLY.key = 'DATEONLY';

/**
 * Returns the SQL representation for DATEONLY type.
 * @returns {string} SQL representation
 */
DATEONLY.prototype.toSql = function() {
  return 'DATE';
};

/**
 * Stringifies a date value for SQL representation.
 * @param {Date} date - The date to stringify
 * @returns {string} SQL string representation
 */
DATEONLY.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};

/**
 * Sanitizes a date value.
 * @param {*} value - The value to sanitize
 * @param {Object} options - Optional configuration options
 * @returns {*} Sanitized value
 */
DATEONLY.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value;
};

/**
 * Checks if a date value has changed.
 * @param {*} value - The new value
 * @param {*} originalValue - The original value
 * @returns {boolean} True if changed
 */
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
 * Creates a HSTORE data type instance.
 */
function HSTORE() {
  if (!(this instanceof HSTORE)) return new HSTORE();
}
inherits(HSTORE, ABSTRACT);

HSTORE.prototype.key = HSTORE.key = 'HSTORE';

/**
 * Validates that the value is a valid hstore object.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
HSTORE.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
};

/**
 * Creates a JSON data type instance.
 */
function JSONTYPE() {
  if (!(this instanceof JSONTYPE)) return new JSONTYPE();
}
inherits(JSONTYPE, ABSTRACT);

JSONTYPE.prototype.key = JSONTYPE.key = 'JSON';

/**
 * Validates that the value is a valid JSON object.
 * @returns {boolean} True if valid
 */
JSONTYPE.prototype.validate = function validate() {
  return true;
};

/**
 * Stringifies a value as JSON.
 * @param {*} value - The value to stringify
 * @returns {string} JSON string representation
 */
JSONTYPE.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

/**
 * Creates a JSONB data type instance.
 */
function JSONB() {
  if (!(this instanceof JSONB)) return new JSONB();
  JSONTYPE.call(this);
}
inherits(JSONB, JSONTYPE);

JSONB.prototype.key = JSONB.key = 'JSONB';

/**
 * Creates a NOW data type instance.
 */
function NOW() {
  if (!(this instanceof NOW)) return new NOW();
}
inherits(NOW, ABSTRACT);

NOW.prototype.key = NOW.key = 'NOW';

/**
 * Creates a BLOB data type instance.
 * @param {number|string} length - The blob length
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
 * Returns the SQL representation for BLOB type based on length.
 * @returns {string} SQL representation
 */
BLOB.prototype.toSql = function toSql() {
  const lengthMap = {
    tiny: 'TINYBLOB',
    medium: 'MEDIUMBLOB',
    long: 'LONGBLOB'
  };
  const lowerLength = this._length.toLowerCase();
  return lengthMap[lowerLength] || this.key;
};

/**
 * Validates that the value is a valid blob.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
BLOB.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
};

BLOB.prototype.escape = false;

/**
 * Stringifies a blob value for SQL representation.
 * @param {*} value - The value to stringify
 * @returns {string} SQL string representation
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
 * Creates a RANGE data type instance.
 * @param {Object|string} subtype - The subtype of the range
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

RANGE.prototype.key = RANGE.key = 'RANGE';

/**
 * Returns the SQL representation for RANGE type.
 * @returns {string} SQL representation
 */
RANGE.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};

/**
 * Returns the cast type for RANGE type.
 * @returns {string} Cast type
 */
RANGE.prototype.toCastType = function toCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};

/**
 * Validates that the value is a valid range.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
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
 * Creates a UUID data type instance.
 */
function UUID() {
  if (!(this instanceof UUID)) return new UUID();
}
inherits(UUID, ABSTRACT);

UUID.prototype.key = UUID.key = 'UUID';

/**
 * Validates that the value is a valid UUID.
 * @param {*} value - The value to validate
 * @param {Object} options - Optional configuration options
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
UUID.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * Creates a UUIDV1 data type instance.
 */
function UUIDV1() {
  if (!(this instanceof UUIDV1)) return new UUIDV1();
}
inherits(UUIDV1, ABSTRACT);

UUIDV1.prototype.key = UUIDV1.key = 'UUIDV1';

/**
 * Validates that the value is a valid UUID.
 * @param {*} value - The value to validate
 * @param {Object} options - Optional configuration options
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
UUIDV1.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * Creates a UUIDV4 data type instance.
 */
function UUIDV4() {
  if (!(this instanceof UUIDV4)) return new UUIDV4();
}
inherits(UUIDV4, ABSTRACT);

UUIDV4.prototype.key = UUIDV4.key = 'UUIDV4';

/**
 * Validates that the value is a valid UUID v4.
 * @param {*} value - The value to validate
 * @param {Object} options - Optional configuration options
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
UUIDV4.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }
  return true;
};

/**
 * Creates a VIRTUAL data type instance.
 * @param {Function} ReturnType - The return type
 * @param {string[]} fields - The dependency fields
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
 * Creates an ENUM data type instance.
 * @param {string|string[]} value - The enum values
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
 * Validates that the value is a valid enum choice.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
ENUM.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }
  return true;
};

/**
 * Creates an ARRAY data type instance.
 * @param {Function|Object} type - The array element type
 */
function ARRAY(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ARRAY)) return new ARRAY(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}
inherits(ARRAY, ABSTRACT);

ARRAY.prototype.key = ARRAY.key = 'ARRAY';

/**
 * Returns the SQL representation for ARRAY type.
 * @returns {string} SQL representation
 */
ARRAY.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

/**
 * Validates that the value is a valid array.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
ARRAY.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }
  return true;
};

/**
 * Checks if an object is an ARRAY of a specific type.
 * @param {Object} obj - The object to check
 * @param {Function} type - The type to check against
 * @returns {boolean} True if it's an ARRAY of the specified type
 */
ARRAY.is = function is(obj, type) {
  return obj instanceof ARRAY && obj.type instanceof type;
};

/**
 * Helper object for type properties.
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
 * Creates a GEOMETRY data type instance.
 * @param {string} type - The geometry type
 * @param {string} srid - The spatial reference ID
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
 * Stringifies a geometry value for SQL representation.
 * @param {*} value - The value to stringify
 * @param {Object} options - Optional configuration options
 * @returns {string} SQL string representation
 */
GEOMETRY.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Creates a GEOGRAPHY data type instance.
 * @param {string} type - The geography type
 * @param {string} srid - The spatial reference ID
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
 * Stringifies a geography value for SQL representation.
 * @param {*} value - The value to stringify
 * @param {Object} options - Optional configuration options
 * @returns {string} SQL string representation
 */
GEOGRAPHY.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Creates a CIDR data type instance.
 */
function CIDR() {
  if (!(this instanceof CIDR)) return new CIDR();
}
inherits(CIDR, ABSTRACT);

CIDR.prototype.key = CIDR.key = 'CIDR';

/**
 * Validates that the value is a valid CIDR.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
CIDR.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }
  return true;
};

/**
 * Creates an INET data type instance.
 */
function INET() {
  if (!(this instanceof INET)) return new INET();
}
inherits(INET, ABSTRACT);

INET.prototype.key = INET.key = 'INET';

/**
 * Validates that the value is a valid INET.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
INET.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }
  return true;
};

/**
 * Creates a MACADDR data type instance.
 */
function MACADDR() {
  if (!(this instanceof MACADDR)) return new MACADDR();
}
inherits(MACADDR, ABSTRACT);

MACADDR.prototype.key = MACADDR.key = 'MACADDR';

/**
 * Validates that the value is a valid MAC address.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
MACADDR.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
};

/**
 * Applies helper properties to data types.
 * @param {string} helperName - The name of the helper property
 * @param {Array} DataTypes - The array of data types to apply the helper to
 */
function applyHelperProperties(helperName, DataTypes) {
  for (const DataType of DataTypes) {
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

for (const helper of Object.keys(helpers)) {
  applyHelperProperties(helper, helpers[helper]);
}

/**
 * A convenience class holding commonly used data types.
 * @typedef {Object} DataTypes
 * @property {Function} STRING - A variable length string
 * @property {Function} CHAR - A fixed length string
 * @property {Function} TEXT - An unlimited length text column
 * @property {Function} TINYINT - A 8 bit integer
 * @property {Function} SMALLINT - A 16 bit integer
 * @property {Function} MEDIUMINT - A 24 bit integer
 * @property {Function} INTEGER - A 32 bit integer
 * @property {Function} BIGINT - A 64 bit integer
 * @property {Function} FLOAT - Floating point number (4-byte precision)
 * @property {Function} DOUBLE - Floating point number (8-byte precision)
 * @property {Function} REAL - Floating point number (4-byte precision)
 * @property {Function} DECIMAL - Decimal number
 * @property {Function} BOOLEAN - A boolean / tinyint column
 * @property {Function} BLOB - Binary storage
 * @property {Function} ENUM - An enumeration
 * @property {Function} DATE - A datetime column
 * @property {Function} DATEONLY - A date only column
 * @property {Function} TIME - A time column
 * @property {Function} NOW - A default value of the current timestamp
 * @property {Function} UUID - A column storing a unique universal identifier
 * @property {Function} UUIDV1 - A default unique universal identifier (v1)
 * @property {Function} UUIDV4 - A default unique universal identifier (v4)
 * @property {Function} HSTORE - A key / value store column
 * @property {Function} JSON - A JSON string column
 * @property {Function} JSONB - A binary storage JSON column
 * @property {Function} ARRAY - An array of type
 * @property {Function} RANGE - Range types
 * @property {Function} GEOMETRY - A column storing Geometry information
 * @property {Function} GEOGRAPHY - A geography datatype
 * @property {Function} VIRTUAL - A virtual value not stored in the DB
 * @property {Function} CIDR - A CIDR column
 * @property {Function} INET - An INET column
 * @property {Function} MACADDR - A MACADDR column
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