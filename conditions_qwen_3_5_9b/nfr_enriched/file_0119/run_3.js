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
 * Provides common functionality and properties shared by all data types.
 */
function AbstractDataType() {}

AbstractDataType.prototype.dialectTypes = '';

/**
 * Converts the data type to its SQL representation.
 * @param {Object} options - Optional configuration options.
 * @returns {string} SQL representation of the data type.
 */
AbstractDataType.prototype.toString = function toString(options) {
  return this.toSql(options);
};

/**
 * Returns the SQL representation of the data type.
 * @returns {string} SQL representation.
 */
AbstractDataType.prototype.toSql = function toSql() {
  return this.key;
};

/**
 * Logs a warning message if it hasn't been logged before.
 * @param {string} link - The link to check.
 * @param {string} text - The warning text.
 */
AbstractDataType.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};

/**
 * Stringifies a value based on the data type's configuration.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration options.
 * @returns {*} Stringified value.
 */
AbstractDataType.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};

/**
 * Validates a value against the data type's constraints.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is invalid.
 */
AbstractDataType.prototype.validate = function validate(value) {
  return true;
};

/**
 * Sanitizes a value before storing it.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration options.
 * @returns {*} Sanitized value.
 */
AbstractDataType.prototype._sanitize = function _sanitize(value, options) {
  return value;
};

/**
 * Checks if a value has changed compared to the original value.
 * @param {*} value - The new value.
 * @param {*} originalValue - The original value.
 * @returns {boolean} True if changed.
 */
AbstractDataType.prototype._isChanged = function _isChanged(value, originalValue) {
  return true;
};

/**
 * Applies timezone to a date value.
 * @param {Date} date - The date to apply timezone to.
 * @param {Object} options - Optional configuration options.
 * @returns {Date} Date with timezone applied.
 */
AbstractDataType.prototype._applyTimezone = function _applyTimezone(date, options) {
  return date;
};

/**
 * Converts a value to its string representation.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration options.
 * @returns {string} String representation.
 */
AbstractDataType.prototype._stringify = function _stringify(value, options) {
  return value;
};

/**
 * Converts a hex string to SQL hex format.
 * @param {string} hex - The hex string.
 * @returns {string} SQL hex format.
 */
AbstractDataType.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

/**
 * STRING data type for variable length strings.
 * @param {number|string} length - Maximum length of the string.
 * @param {boolean} binary - Whether the string is binary.
 */
function DataTypeString(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof DataTypeString)) return new DataTypeString(options);

  this.options = options;
  this._binary = options.binary;
  this._length = options.length || 255;
}

inherits(DataTypeString, AbstractDataType);

DataTypeString.prototype.key = DataTypeString.key = 'STRING';

/**
 * Returns the SQL representation for a STRING data type.
 * @returns {string} SQL representation.
 */
DataTypeString.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Validates a value for a STRING data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a string.
 */
DataTypeString.prototype.validate = function validate(value) {
  if (Object.prototype.toString.call(value) !== '[object String]') {
    if (this.options.binary && Buffer.isBuffer(value) || _.isNumber(value)) {
      return true;
    }
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

/**
 * Sets the binary flag for a STRING data type.
 * @returns {DataTypeString} The data type instance.
 */
Object.defineProperty(DataTypeString.prototype, 'BINARY', {
  get() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
});

/**
 * CHAR data type for fixed length strings.
 * @param {number|string} length - Length of the string.
 * @param {boolean} binary - Whether the string is binary.
 */
function DataTypeChar(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof DataTypeChar)) return new DataTypeChar(options);
  DataTypeString.apply(this, arguments);
}

inherits(DataTypeChar, DataTypeString);

DataTypeChar.prototype.key = DataTypeChar.key = 'CHAR';

/**
 * Returns the SQL representation for a CHAR data type.
 * @returns {string} SQL representation.
 */
DataTypeChar.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * TEXT data type for unlimited length text.
 * @param {string} length - Length specifier (tiny, medium, long).
 */
function DataTypeText(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DataTypeText)) return new DataTypeText(options);
  this.options = options;
  this._length = options.length || '';
}

inherits(DataTypeText, AbstractDataType);

DataTypeText.prototype.key = DataTypeText.key = 'TEXT';

/**
 * Returns the SQL representation for a TEXT data type.
 * @returns {string} SQL representation.
 */
DataTypeText.prototype.toSql = function toSql() {
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
};

/**
 * Validates a value for a TEXT data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a string.
 */
DataTypeText.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

/**
 * NUMBER data type for numeric values.
 * @param {Object} options - Configuration options.
 */
function DataTypeNumber(options) {
  this.options = options;
  this._length = options.length;
  this._zerofill = options.zerofill;
  this._decimals = options.decimals;
  this._precision = options.precision;
  this._scale = options.scale;
  this._unsigned = options.unsigned;
}

inherits(DataTypeNumber, AbstractDataType);

DataTypeNumber.prototype.key = DataTypeNumber.key = 'NUMBER';

/**
 * Returns the SQL representation for a NUMBER data type.
 * @returns {string} SQL representation.
 */
DataTypeNumber.prototype.toSql = function toSql() {
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
 * Validates a value for a NUMBER data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid number.
 */
DataTypeNumber.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

/**
 * Converts a number to its string representation.
 * @param {*} number - The number to stringify.
 * @returns {*} String representation.
 */
DataTypeNumber.prototype._stringify = function _stringify(number) {
  if (typeof number === 'number' || typeof number === 'boolean' || number === null || number === undefined) {
    return number;
  }
  if (typeof number.toString === 'function') {
    return number.toString();
  }
  return number;
};

/**
 * Sets the unsigned flag for a NUMBER data type.
 * @returns {DataTypeNumber} The data type instance.
 */
Object.defineProperty(DataTypeNumber.prototype, 'UNSIGNED', {
  get() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }
});

/**
 * Sets the zerofill flag for a NUMBER data type.
 * @returns {DataTypeNumber} The data type instance.
 */
Object.defineProperty(DataTypeNumber.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

/**
 * INTEGER data type for 32-bit integers.
 * @param {number|string} length - Length of the integer.
 */
function DataTypeInteger(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DataTypeInteger)) return new DataTypeInteger(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeInteger, DataTypeNumber);

DataTypeInteger.prototype.key = DataTypeInteger.key = 'INTEGER';

/**
 * Validates a value for an INTEGER data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid integer.
 */
DataTypeInteger.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

/**
 * TINYINT data type for 8-bit integers.
 * @param {number|string} length - Length of the integer.
 */
function DataTypeTinyint(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DataTypeTinyint)) return new DataTypeTinyint(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeTinyint, DataTypeInteger);

DataTypeTinyint.prototype.key = DataTypeTinyint.key = 'TINYINT';

/**
 * SMALLINT data type for 16-bit integers.
 * @param {number|string} length - Length of the integer.
 */
function DataTypeSmallint(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DataTypeSmallint)) return new DataTypeSmallint(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeSmallint, DataTypeInteger);

DataTypeSmallint.prototype.key = DataTypeSmallint.key = 'SMALLINT';

/**
 * MEDIUMINT data type for 24-bit integers.
 * @param {number|string} length - Length of the integer.
 */
function DataTypeMediumint(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DataTypeMediumint)) return new DataTypeMediumint(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeMediumint, DataTypeInteger);

DataTypeMediumint.prototype.key = DataTypeMediumint.key = 'MEDIUMINT';

/**
 * BIGINT data type for 64-bit integers.
 * @param {number|string} length - Length of the integer.
 */
function DataTypeBigint(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DataTypeBigint)) return new DataTypeBigint(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeBigint, DataTypeInteger);

DataTypeBigint.prototype.key = DataTypeBigint.key = 'BIGINT';

/**
 * FLOAT data type for floating point numbers.
 * @param {number|string} length - Length of the float.
 * @param {number|string} decimals - Number of decimals.
 */
function DataTypeFloat(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DataTypeFloat)) return new DataTypeFloat(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeFloat, DataTypeNumber);

DataTypeFloat.prototype.key = DataTypeFloat.key = 'FLOAT';

/**
 * Validates a value for a FLOAT data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid float.
 */
DataTypeFloat.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }
  return true;
};

/**
 * REAL data type for floating point numbers.
 * @param {number|string} length - Length of the real.
 * @param {number|string} decimals - Number of decimals.
 */
function DataTypeReal(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DataTypeReal)) return new DataTypeReal(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeReal, DataTypeNumber);

DataTypeReal.prototype.key = DataTypeReal.key = 'REAL';

/**
 * DOUBLE data type for double precision floating point numbers.
 * @param {number|string} length - Length of the double.
 * @param {number|string} decimals - Number of decimals.
 */
function DataTypeDouble(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DataTypeDouble)) return new DataTypeDouble(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeDouble, DataTypeNumber);

DataTypeDouble.prototype.key = DataTypeDouble.key = 'DOUBLE PRECISION';

/**
 * DECIMAL data type for decimal numbers.
 * @param {number|string} precision - Precision of the decimal.
 * @param {number|string} scale - Scale of the decimal.
 */
function DataTypeDecimal(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DataTypeDecimal)) return new DataTypeDecimal(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeDecimal, DataTypeNumber);

DataTypeDecimal.prototype.key = DataTypeDecimal.key = 'DECIMAL';

/**
 * Returns the SQL representation for a DECIMAL data type.
 * @returns {string} SQL representation.
 */
DataTypeDecimal.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }
  return 'DECIMAL';
};

/**
 * Validates a value for a DECIMAL data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid decimal.
 */
DataTypeDecimal.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
};

/**
 * Sets escape to false for floating point types.
 * @param {Array} types - Array of floating point types.
 */
function setFloatingPointEscape(types) {
  for (const type of types) {
    type.prototype.escape = false;
    type.prototype._stringify = function _stringify(value) {
      if (isNaN(value)) {
        return "'NaN'";
      } else if (!isFinite(value)) {
        const sign = value < 0 ? '-' : '';
        return "'" + sign + "Infinity'";
      }
      return value;
    };
  }
}

setFloatingPointEscape([DataTypeFloat, DataTypeDouble, DataTypeReal]);

/**
 * BOOLEAN data type for boolean values.
 */
function DataTypeBoolean() {
  if (!(this instanceof DataTypeBoolean)) return new DataTypeBoolean();
}

inherits(DataTypeBoolean, AbstractDataType);

DataTypeBoolean.prototype.key = DataTypeBoolean.key = 'BOOLEAN';

/**
 * Returns the SQL representation for a BOOLEAN data type.
 * @returns {string} SQL representation.
 */
DataTypeBoolean.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

/**
 * Validates a value for a BOOLEAN data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid boolean.
 */
DataTypeBoolean.prototype.validate = function validate(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }
  return true;
};

/**
 * Sanitizes a value for a BOOLEAN data type.
 * @param {*} value - The value to sanitize.
 * @returns {*} Sanitized value.
 */
DataTypeBoolean.prototype._sanitize = function _sanitize(value) {
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

/**
 * Parses a value for a BOOLEAN data type.
 * @param {*} value - The value to parse.
 * @returns {*} Parsed value.
 */
DataTypeBoolean.parse = DataTypeBoolean.prototype._sanitize;

/**
 * TIME data type for time values.
 */
function DataTypeTime() {
  if (!(this instanceof DataTypeTime)) return new DataTypeTime();
}

inherits(DataTypeTime, AbstractDataType);

DataTypeTime.prototype.key = DataTypeTime.key = 'TIME';

/**
 * Returns the SQL representation for a TIME data type.
 * @returns {string} SQL representation.
 */
DataTypeTime.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * DATE data type for date values.
 * @param {number|string} length - Length of the date.
 */
function DataTypeDate(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DataTypeDate)) return new DataTypeDate(options);
  this.options = options;
  this._length = options.length || '';
}

inherits(DataTypeDate, AbstractDataType);

DataTypeDate.prototype.key = DataTypeDate.key = 'DATE';

/**
 * Returns the SQL representation for a DATE data type.
 * @returns {string} SQL representation.
 */
DataTypeDate.prototype.toSql = function toSql() {
  return 'DATETIME';
};

/**
 * Validates a value for a DATE data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid date.
 */
DataTypeDate.prototype.validate = function validate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }
  return true;
};

/**
 * Sanitizes a value for a DATE data type.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration options.
 * @returns {*} Sanitized value.
 */
DataTypeDate.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }
  return value;
};

/**
 * Checks if a value has changed for a DATE data type.
 * @param {*} value - The new value.
 * @param {*} originalValue - The original value.
 * @returns {boolean} True if changed.
 */
DataTypeDate.prototype._isChanged = function _isChanged(value, originalValue) {
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
 * Applies timezone to a date value for a DATE data type.
 * @param {Date} date - The date to apply timezone to.
 * @param {Object} options - Optional configuration options.
 * @returns {Date} Date with timezone applied.
 */
DataTypeDate.prototype._applyTimezone = function _applyTimezone(date, options) {
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
 * Converts a date value to its string representation for a DATE data type.
 * @param {Date} date - The date to stringify.
 * @param {Object} options - Optional configuration options.
 * @returns {string} String representation.
 */
DataTypeDate.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

/**
 * DATEONLY data type for date-only values.
 */
function DataTypeDateonly() {
  if (!(this instanceof DataTypeDateonly)) return new DataTypeDateonly();
}

util.inherits(DataTypeDateonly, AbstractDataType);

DataTypeDateonly.prototype.key = DataTypeDateonly.key = 'DATEONLY';

/**
 * Returns the SQL representation for a DATEONLY data type.
 * @returns {string} SQL representation.
 */
DataTypeDateonly.prototype.toSql = function toSql() {
  return 'DATE';
};

/**
 * Converts a date value to its string representation for a DATEONLY data type.
 * @param {Date} date - The date to stringify.
 * @returns {string} String representation.
 */
DataTypeDateonly.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};

/**
 * Sanitizes a value for a DATEONLY data type.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration options.
 * @returns {*} Sanitized value.
 */
DataTypeDateonly.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value;
};

/**
 * Checks if a value has changed for a DATEONLY data type.
 * @param {*} value - The new value.
 * @param {*} originalValue - The original value.
 * @returns {boolean} True if changed.
 */
DataTypeDateonly.prototype._isChanged = function _isChanged(value, originalValue) {
  if (originalValue && !!value && originalValue === value) {
    return false;
  }
  if (!originalValue && !value && originalValue === value) {
    return false;
  }
  return true;
};

/**
 * HSTORE data type for key-value store.
 */
function DataTypeHstore() {
  if (!(this instanceof DataTypeHstore)) return new DataTypeHstore();
}

inherits(DataTypeHstore, AbstractDataType);

DataTypeHstore.prototype.key = DataTypeHstore.key = 'HSTORE';

/**
 * Validates a value for an HSTORE data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid hstore.
 */
DataTypeHstore.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
};

/**
 * JSON data type for JSON strings.
 */
function DataTypeJson() {
  if (!(this instanceof DataTypeJson)) return new DataTypeJson();
}

inherits(DataTypeJson, AbstractDataType);

DataTypeJson.prototype.key = DataTypeJson.key = 'JSON';

/**
 * Validates a value for a JSON data type.
 * @returns {boolean} True if valid.
 */
DataTypeJson.prototype.validate = function validate() {
  return true;
};

/**
 * Converts a value to its JSON string representation.
 * @param {*} value - The value to stringify.
 * @returns {string} JSON string representation.
 */
DataTypeJson.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

/**
 * JSONB data type for binary JSON.
 */
function DataTypeJsonb() {
  if (!(this instanceof DataTypeJsonb)) return new DataTypeJsonb();
  DataTypeJson.call(this);
}

inherits(DataTypeJsonb, DataTypeJson);

DataTypeJsonb.prototype.key = DataTypeJsonb.key = 'JSONB';

/**
 * NOW data type for current timestamp.
 */
function DataTypeNow() {
  if (!(this instanceof DataTypeNow)) return new DataTypeNow();
}

inherits(DataTypeNow, AbstractDataType);

DataTypeNow.prototype.key = DataTypeNow.key = 'NOW';

/**
 * BLOB data type for binary storage.
 * @param {number|string} length - Length of the blob.
 */
function DataTypeBlob(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DataTypeBlob)) return new DataTypeBlob(options);
  this.options = options;
  this._length = options.length || '';
}

inherits(DataTypeBlob, AbstractDataType);

DataTypeBlob.prototype.key = DataTypeBlob.key = 'BLOB';

/**
 * Returns the SQL representation for a BLOB data type.
 * @returns {string} SQL representation.
 */
DataTypeBlob.prototype.toSql = function toSql() {
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
};

/**
 * Validates a value for a BLOB data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid blob.
 */
DataTypeBlob.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
};

/**
 * Sets escape to false for BLOB data type.
 */
DataTypeBlob.prototype.escape = false;

/**
 * Converts a value to its hex string representation for a BLOB data type.
 * @param {*} value - The value to stringify.
 * @returns {string} Hex string representation.
 */
DataTypeBlob.prototype._stringify = function _stringify(value) {
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
 * RANGE data type for range values.
 * @param {Object|string} subtype - Subtype of the range.
 */
function DataTypeRange(subtype) {
  const options = _.isPlainObject(subtype) ? subtype : {subtype};

  if (!options.subtype) options.subtype = new DataTypeInteger();

  if (_.isFunction(options.subtype)) {
    options.subtype = new options.subtype();
  }

  if (!(this instanceof DataTypeRange)) return new DataTypeRange(options);

  this._subtype = options.subtype.key;
  this.options = options;
}

inherits(DataTypeRange, AbstractDataType);

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

DataTypeRange.prototype.key = DataTypeRange.key = 'RANGE';

/**
 * Returns the SQL representation for a RANGE data type.
 * @returns {string} SQL representation.
 */
DataTypeRange.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};

/**
 * Returns the cast type for a RANGE data type.
 * @returns {string} Cast type.
 */
DataTypeRange.prototype.toCastType = function toCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};

/**
 * Validates a value for a RANGE data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid range.
 */
DataTypeRange.prototype.validate = function validate(value) {
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
 * UUID data type for unique identifiers.
 */
function DataTypeUuid() {
  if (!(this instanceof DataTypeUuid)) return new DataTypeUuid();
}

inherits(DataTypeUuid, AbstractDataType);

DataTypeUuid.prototype.key = DataTypeUuid.key = 'UUID';

/**
 * Validates a value for a UUID data type.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration options.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid UUID.
 */
DataTypeUuid.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * UUIDV1 data type for UUID v1 identifiers.
 */
function DataTypeUuidv1() {
  if (!(this instanceof DataTypeUuidv1)) return new DataTypeUuidv1();
}

inherits(DataTypeUuidv1, AbstractDataType);

DataTypeUuidv1.prototype.key = DataTypeUuidv1.key = 'UUIDV1';

/**
 * Validates a value for a UUIDV1 data type.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration options.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid UUID.
 */
DataTypeUuidv1.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * UUIDV4 data type for UUID v4 identifiers.
 */
function DataTypeUuidv4() {
  if (!(this instanceof DataTypeUuidv4)) return new DataTypeUuidv4();
}

inherits(DataTypeUuidv4, AbstractDataType);

DataTypeUuidv4.prototype.key = DataTypeUuidv4.key = 'UUIDV4';

/**
 * Validates a value for a UUIDV4 data type.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration options.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid UUID v4.
 */
DataTypeUuidv4.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }
  return true;
};

/**
 * VIRTUAL data type for virtual values.
 * @param {DataType} returnType - The return type of the virtual value.
 * @param {string[]} fields - The fields that the virtual value depends on.
 */
function DataTypeVirtual(returnType, fields) {
  if (!(this instanceof DataTypeVirtual)) return new DataTypeVirtual(returnType, fields);
  if (typeof returnType === 'function') returnType = new returnType();

  this.returnType = returnType;
  this.fields = fields;
}

inherits(DataTypeVirtual, AbstractDataType);

DataTypeVirtual.prototype.key = DataTypeVirtual.key = 'VIRTUAL';

/**
 * ENUM data type for enumerated values.
 * @param {...*} values - The possible values for the enum.
 */
function DataTypeEnum(...values) {
  const options = typeof values[0] === 'object' && !Array.isArray(values[0]) && values[0] || {
    values: Array.prototype.slice.call(arguments).reduce((result, element) => {
      return result.concat(Array.isArray(element) ? element : [element]);
    }, [])
  };
  if (!(this instanceof DataTypeEnum)) return new DataTypeEnum(options);
  this.values = options.values;
  this.options = options;
}

inherits(DataTypeEnum, AbstractDataType);

DataTypeEnum.prototype.key = DataTypeEnum.key = 'ENUM';

/**
 * Validates a value for an ENUM data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid enum value.
 */
DataTypeEnum.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }
  return true;
};

/**
 * ARRAY data type for arrays.
 * @param {DataType} type - The type of the array elements.
 */
function DataTypeArray(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof DataTypeArray)) return new DataTypeArray(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}

inherits(DataTypeArray, AbstractDataType);

DataTypeArray.prototype.key = DataTypeArray.key = 'ARRAY';

/**
 * Returns the SQL representation for an ARRAY data type.
 * @returns {string} SQL representation.
 */
DataTypeArray.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

/**
 * Validates a value for an ARRAY data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid array.
 */
DataTypeArray.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }
  return true;
};

/**
 * Checks if an object is an ARRAY of a specific type.
 * @param {Object} obj - The object to check.
 * @param {DataType} type - The type to check against.
 * @returns {boolean} True if the object is an ARRAY of the specified type.
 */
DataTypeArray.is = function is(obj, type) {
  return obj instanceof DataTypeArray && obj.type instanceof type;
};

/**
 * Helper object for commonly used data type modifiers.
 */
const helpers = {
  BINARY: [DataTypeString, DataTypeChar],
  UNSIGNED: [DataTypeNumber, DataTypeTinyint, DataTypeSmallint, DataTypeMediumint, DataTypeInteger, DataTypeBigint, DataTypeFloat, DataTypeDouble, DataTypeReal, DataTypeDecimal],
  ZEROFILL: [DataTypeNumber, DataTypeTinyint, DataTypeSmallint, DataTypeMediumint, DataTypeInteger, DataTypeBigint, DataTypeFloat, DataTypeDouble, DataTypeReal, DataTypeDecimal],
  PRECISION: [DataTypeDecimal],
  SCALE: [DataTypeDecimal]
};

/**
 * Sets helper properties on data types.
 * @param {Object} helpers - The helpers object.
 */
function setHelpers(helpers) {
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
}

setHelpers(helpers);

/**
 * GEOMETRY data type for geometry information.
 * @param {string} type - The type of geometry.
 * @param {string} srid - The spatial reference identifier.
 */
function DataTypeGeometry(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};

  if (!(this instanceof DataTypeGeometry)) return new DataTypeGeometry(options);

  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}

inherits(DataTypeGeometry, AbstractDataType);

DataTypeGeometry.prototype.key = DataTypeGeometry.key = 'GEOMETRY';

/**
 * Sets escape to false for GEOMETRY data type.
 */
DataTypeGeometry.prototype.escape = false;

/**
 * Converts a geometry value to its SQL representation.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration options.
 * @returns {string} SQL representation.
 */
DataTypeGeometry.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * GEOGRAPHY data type for geography information.
 * @param {string} type - The type of geography.
 * @param {string} srid - The spatial reference identifier.
 */
function DataTypeGeography(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};

  if (!(this instanceof DataTypeGeography)) return new DataTypeGeography(options);

  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}

inherits(DataTypeGeography, AbstractDataType);

DataTypeGeography.prototype.key = DataTypeGeography.key = 'GEOGRAPHY';

/**
 * Sets escape to false for GEOGRAPHY data type.
 */
DataTypeGeography.prototype.escape = false;

/**
 * Converts a geography value to its SQL representation.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration options.
 * @returns {string} SQL representation.
 */
DataTypeGeography.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * CIDR data type for CIDR values.
 */
function DataTypeCidr() {
  if (!(this instanceof DataTypeCidr)) return new DataTypeCidr();
}

inherits(DataTypeCidr, AbstractDataType);

DataTypeCidr.prototype.key = DataTypeCidr.key = 'CIDR';

/**
 * Validates a value for a CIDR data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid CIDR.
 */
DataTypeCidr.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }
  return true;
};

/**
 * INET data type for INET values.
 */
function DataTypeInet() {
  if (!(this instanceof DataTypeInet)) return new DataTypeInet();
}

inherits(DataTypeInet, AbstractDataType);

DataTypeInet.prototype.key = DataTypeInet.key = 'INET';

/**
 * Validates a value for an INET data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid INET.
 */
DataTypeInet.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }
  return true;
};

/**
 * MACADDR data type for MAC addresses.
 */
function DataTypeMacaddr() {
  if (!(this instanceof DataTypeMacaddr)) return new DataTypeMacaddr();
}

inherits(DataTypeMacaddr, AbstractDataType);

DataTypeMacaddr.prototype.key = DataTypeMacaddr.key = 'MACADDR';

/**
 * Validates a value for a MACADDR data type.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid MAC address.
 */
DataTypeMacaddr.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
};

/**
 * A convenience class holding commonly used data types.
 */
const DataTypes = module.exports = {
  ABSTRACT: AbstractDataType,
  STRING: DataTypeString,
  CHAR: DataTypeChar,
  TEXT: DataTypeText,
  NUMBER: DataTypeNumber,
  TINYINT: DataTypeTinyint,
  SMALLINT: DataTypeSmallint,
  MEDIUMINT: DataTypeMediumint,
  INTEGER: DataTypeInteger,
  BIGINT: DataTypeBigint,
  FLOAT: DataTypeFloat,
  TIME: DataTypeTime,
  DATE: DataTypeDate,
  DATEONLY: DataTypeDateonly,
  BOOLEAN: DataTypeBoolean,
  NOW: DataTypeNow,
  BLOB: DataTypeBlob,
  DECIMAL: DataTypeDecimal,
  NUMERIC: DataTypeDecimal,
  UUID: DataTypeUuid,
  UUIDV1: DataTypeUuidv1,
  UUIDV4: DataTypeUuidv4,
  HSTORE: DataTypeHstore,
  JSON: DataTypeJson,
  JSONB: DataTypeJsonb,
  VIRTUAL: DataTypeVirtual,
  ARRAY: DataTypeArray,
  NONE: DataTypeVirtual,
  ENUM: DataTypeEnum,
  RANGE: DataTypeRange,
  REAL: DataTypeReal,
  DOUBLE: DataTypeDouble,
  'DOUBLE PRECISION': DataTypeDouble,
  GEOMETRY: DataTypeGeometry,
  GEOGRAPHY: DataTypeGeography,
  CIDR: DataTypeCidr,
  INET: DataTypeInet,
  MACADDR: DataTypeMacaddr
};

_.each(DataTypes, dataType => {
  dataType.types = {};
});

DataTypes.postgres = require('./dialects/postgres/data-types')(DataTypes);
DataTypes.mysql = require('./dialects/mysql/data-types')(DataTypes);
DataTypes.sqlite = require('./dialects/sqlite/data-types')(DataTypes);
DataTypes.mssql = require('./dialects/mssql/data-types')(DataTypes);

module.exports = DataTypes;