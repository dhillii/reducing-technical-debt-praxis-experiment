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
 * Provides common functionality like stringification and SQL generation.
 */
function AbstractDataType() {}

AbstractDataType.prototype.dialectTypes = '';

/**
 * Converts the data type to its SQL representation.
 * @param {Object} options - Optional configuration object.
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
 * @param {string} link - URL to check documentation.
 * @param {string} text - Warning message text.
 */
AbstractDataType.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};

/**
 * Stringifies a value based on the data type's specific stringify method.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {*} Stringified value.
 */
AbstractDataType.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};

/**
 * Validates if a value is a valid string.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid string.
 */
function validateString(value) {
  if (Object.prototype.toString.call(value) !== '[object String]') {
    if (this.options.binary && Buffer.isBuffer(value) || _.isNumber(value)) {
      return true;
    }
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
}

/**
 * Validates if a value is a valid string for TEXT types.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid string.
 */
function validateText(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
}

/**
 * Validates if a value is a valid number.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid number.
 */
function validateNumber(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
}

/**
 * Validates if a value is a valid integer.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid integer.
 */
function validateInteger(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
}

/**
 * Validates if a value is a valid float.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid float.
 */
function validateFloat(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }
  return true;
}

/**
 * Validates if a value is a valid decimal.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid decimal.
 */
function validateDecimal(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
}

/**
 * Validates if a value is a valid boolean.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid boolean.
 */
function validateBoolean(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }
  return true;
}

/**
 * Validates if a value is a valid date.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid date.
 */
function validateDate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }
  return true;
}

/**
 * Validates if a value is a valid plain object.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid plain object.
 */
function validatePlainObject(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
}

/**
 * Validates if a value is a valid UUID.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration object.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid UUID.
 */
function validateUUID(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
}

/**
 * Validates if a value is a valid UUID v4.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration object.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid UUID v4.
 */
function validateUUIDV4(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }
  return true;
}

/**
 * Validates if a value is a valid array.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid array.
 */
function validateArray(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }
  return true;
}

/**
 * Validates if a value is a valid enum.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid enum.
 */
function validateEnum(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }
  return true;
}

/**
 * Validates if a value is a valid CIDR.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid CIDR.
 */
function validateCIDR(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }
  return true;
}

/**
 * Validates if a value is a valid INET.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid INET.
 */
function validateINET(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }
  return true;
}

/**
 * Validates if a value is a valid MAC address.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid MAC address.
 */
function validateMACADDR(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
}

/**
 * Validates if a value is a valid range.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {ValidationError} If the value is not a valid range.
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
 * @param {*} number - The number to stringify.
 * @returns {*} Stringified number.
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
 * Stringifies a floating point number.
 * @param {*} value - The value to stringify.
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
 * Sanitizes a boolean value.
 * @param {*} value - The value to sanitize.
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
 * Sanitizes a date value.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration object.
 * @returns {*} Sanitized value.
 */
function sanitizeDate(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }

  return value;
}

/**
 * Checks if a date value has changed.
 * @param {*} value - The new value.
 * @param {*} originalValue - The original value.
 * @returns {boolean} True if changed.
 */
function isChangedDate(value, originalValue) {
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
 * Applies timezone to a date value.
 * @param {Date} date - The date to apply timezone to.
 * @param {Object} options - Optional configuration object.
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
 * @param {Date} date - The date to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {string} Stringified date.
 */
function stringifyDate(date, options) {
  date = applyTimezone(date, options);
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
}

/**
 * Stringifies a date-only value.
 * @param {Date} date - The date to stringify.
 * @returns {string} Stringified date.
 */
function stringifyDateOnly(date) {
  return moment(date).format('YYYY-MM-DD');
}

/**
 * Sanitizes a date-only value.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration object.
 * @returns {*} Sanitized value.
 */
function sanitizeDateOnly(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }

  return value;
}

/**
 * Checks if a date-only value has changed.
 * @param {*} value - The new value.
 * @param {*} originalValue - The original value.
 * @returns {boolean} True if changed.
 */
function isChangedDateOnly(value, originalValue) {
  if (originalValue && !!value && originalValue === value) {
    return false;
  }

  if (!originalValue && !value && originalValue === value) {
    return false;
  }

  return true;
}

/**
 * Stringifies a blob value.
 * @param {*} value - The value to stringify.
 * @returns {string} Stringified blob.
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
 * Converts a hex string to SQL hex format.
 * @param {string} hex - The hex string to convert.
 * @returns {string} SQL hex format.
 */
function hexify(hex) {
  return "X'" + hex + "'";
}

/**
 * Creates a STRING data type.
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
 * Returns the SQL representation of a STRING data type.
 * @returns {string} SQL representation.
 */
DataTypeString.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

DataTypeString.prototype.validate = validateString;

/**
 * Sets the binary flag for a STRING data type.
 * @returns {DataTypeString} This instance.
 */
Object.defineProperty(DataTypeString.prototype, 'BINARY', {
  get() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
});

/**
 * Creates a CHAR data type.
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
 * Returns the SQL representation of a CHAR data type.
 * @returns {string} SQL representation.
 */
DataTypeChar.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Creates a TEXT data type.
 * @param {string} length - Length of the text (e.g., 'tiny', 'medium', 'long').
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
 * Returns the SQL representation of a TEXT data type.
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

DataTypeText.prototype.validate = validateText;

/**
 * Creates a NUMBER data type.
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
 * Returns the SQL representation of a NUMBER data type.
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

DataTypeNumber.prototype.validate = validateNumber;

DataTypeNumber.prototype._stringify = stringifyNumber;

/**
 * Sets the unsigned flag for a NUMBER data type.
 * @returns {DataTypeNumber} This instance.
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
 * @returns {DataTypeNumber} This instance.
 */
Object.defineProperty(DataTypeNumber.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

/**
 * Creates an INTEGER data type.
 * @param {number|string} length - Length of the integer.
 */
function DataTypeInteger(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DataTypeInteger)) return new DataTypeInteger(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeInteger, DataTypeNumber);

DataTypeInteger.prototype.key = DataTypeInteger.key = 'INTEGER';

DataTypeInteger.prototype.validate = validateInteger;

/**
 * Creates a TINYINT data type.
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
 * Creates a SMALLINT data type.
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
 * Creates a MEDIUMINT data type.
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
 * Creates a BIGINT data type.
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
 * Creates a FLOAT data type.
 * @param {number|string} length - Length of the float.
 * @param {number} decimals - Number of decimals.
 */
function DataTypeFloat(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DataTypeFloat)) return new DataTypeFloat(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeFloat, DataTypeNumber);

DataTypeFloat.prototype.key = DataTypeFloat.key = 'FLOAT';

DataTypeFloat.prototype.validate = validateFloat;

/**
 * Creates a REAL data type.
 * @param {number|string} length - Length of the real.
 * @param {number} decimals - Number of decimals.
 */
function DataTypeReal(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DataTypeReal)) return new DataTypeReal(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeReal, DataTypeNumber);

DataTypeReal.prototype.key = DataTypeReal.key = 'REAL';

/**
 * Creates a DOUBLE data type.
 * @param {number|string} length - Length of the double.
 * @param {number} decimals - Number of decimals.
 */
function DataTypeDouble(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DataTypeDouble)) return new DataTypeDouble(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeDouble, DataTypeNumber);

DataTypeDouble.prototype.key = DataTypeDouble.key = 'DOUBLE PRECISION';

/**
 * Creates a DECIMAL data type.
 * @param {number} precision - Precision of the decimal.
 * @param {number} scale - Scale of the decimal.
 */
function DataTypeDecimal(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DataTypeDecimal)) return new DataTypeDecimal(options);
  DataTypeNumber.call(this, options);
}

inherits(DataTypeDecimal, DataTypeNumber);

DataTypeDecimal.prototype.key = DataTypeDecimal.key = 'DECIMAL';

/**
 * Returns the SQL representation of a DECIMAL data type.
 * @returns {string} SQL representation.
 */
DataTypeDecimal.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }
  return 'DECIMAL';
};

DataTypeDecimal.prototype.validate = validateDecimal;

/**
 * Creates a BOOLEAN data type.
 */
function DataTypeBoolean() {
  if (!(this instanceof DataTypeBoolean)) return new DataTypeBoolean();
}

inherits(DataTypeBoolean, AbstractDataType);

DataTypeBoolean.prototype.key = DataTypeBoolean.key = 'BOOLEAN';

/**
 * Returns the SQL representation of a BOOLEAN data type.
 * @returns {string} SQL representation.
 */
DataTypeBoolean.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

DataTypeBoolean.prototype.validate = validateBoolean;

DataTypeBoolean.prototype._sanitize = sanitizeBoolean;

DataTypeBoolean.parse = DataTypeBoolean.prototype._sanitize;

/**
 * Creates a TIME data type.
 */
function DataTypeTime() {
  if (!(this instanceof DataTypeTime)) return new DataTypeTime();
}

inherits(DataTypeTime, AbstractDataType);

DataTypeTime.prototype.key = DataTypeTime.key = 'TIME';

/**
 * Returns the SQL representation of a TIME data type.
 * @returns {string} SQL representation.
 */
DataTypeTime.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * Creates a DATE data type.
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
 * Returns the SQL representation of a DATE data type.
 * @returns {string} SQL representation.
 */
DataTypeDate.prototype.toSql = function toSql() {
  return 'DATETIME';
};

DataTypeDate.prototype.validate = validateDate;

DataTypeDate.prototype._sanitize = sanitizeDate;

DataTypeDate.prototype._isChanged = isChangedDate;

DataTypeDate.prototype._applyTimezone = applyTimezone;

DataTypeDate.prototype._stringify = stringifyDate;

/**
 * Creates a DATEONLY data type.
 */
function DataTypeDateonly() {
  if (!(this instanceof DataTypeDateonly)) return new DataTypeDateonly();
}

util.inherits(DataTypeDateonly, AbstractDataType);

DataTypeDateonly.prototype.key = DataTypeDateonly.key = 'DATEONLY';

/**
 * Returns the SQL representation of a DATEONLY data type.
 * @returns {string} SQL representation.
 */
DataTypeDateonly.prototype.toSql = function() {
  return 'DATE';
};

DataTypeDateonly.prototype._stringify = stringifyDateOnly;

DataTypeDateonly.prototype._sanitize = sanitizeDateOnly;

DataTypeDateonly.prototype._isChanged = isChangedDateOnly;

/**
 * Creates a HSTORE data type.
 */
function DataTypeHstore() {
  if (!(this instanceof DataTypeHstore)) return new DataTypeHstore();
}

inherits(DataTypeHstore, AbstractDataType);

DataTypeHstore.prototype.key = DataTypeHstore.key = 'HSTORE';

DataTypeHstore.prototype.validate = validatePlainObject;

/**
 * Creates a JSON data type.
 */
function DataTypeJson() {
  if (!(this instanceof DataTypeJson)) return new DataTypeJson();
}

inherits(DataTypeJson, AbstractDataType);

DataTypeJson.prototype.key = DataTypeJson.key = 'JSON';

DataTypeJson.prototype.validate = function validate() {
  return true;
};

DataTypeJson.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

/**
 * Creates a JSONB data type.
 */
function DataTypeJsonb() {
  if (!(this instanceof DataTypeJsonb)) return new DataTypeJsonb();
  DataTypeJson.call(this);
}

inherits(DataTypeJsonb, DataTypeJson);

DataTypeJsonb.prototype.key = DataTypeJsonb.key = 'JSONB';

/**
 * Creates a NOW data type.
 */
function DataTypeNow() {
  if (!(this instanceof DataTypeNow)) return new DataTypeNow();
}

inherits(DataTypeNow, AbstractDataType);

DataTypeNow.prototype.key = DataTypeNow.key = 'NOW';

/**
 * Creates a BLOB data type.
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
 * Returns the SQL representation of a BLOB data type.
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

DataTypeBlob.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
};

DataTypeBlob.prototype.escape = false;

DataTypeBlob.prototype._stringify = stringifyBlob;

DataTypeBlob.prototype._hexify = hexify;

/**
 * Creates a RANGE data type.
 * @param {Object|string} subtype - The subtype of the range.
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
 * Returns the SQL representation of a RANGE data type.
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

DataTypeRange.prototype.validate = validateRange;

/**
 * Creates a UUID data type.
 */
function DataTypeUuid() {
  if (!(this instanceof DataTypeUuid)) return new DataTypeUuid();
}

inherits(DataTypeUuid, AbstractDataType);

DataTypeUuid.prototype.key = DataTypeUuid.key = 'UUID';

DataTypeUuid.prototype.validate = validateUUID;

/**
 * Creates a UUIDV1 data type.
 */
function DataTypeUuidv1() {
  if (!(this instanceof DataTypeUuidv1)) return new DataTypeUuidv1();
}

inherits(DataTypeUuidv1, AbstractDataType);

DataTypeUuidv1.prototype.key = DataTypeUuidv1.key = 'UUIDV1';

DataTypeUuidv1.prototype.validate = validateUUID;

/**
 * Creates a UUIDV4 data type.
 */
function DataTypeUuidv4() {
  if (!(this instanceof DataTypeUuidv4)) return new DataTypeUuidv4();
}

inherits(DataTypeUuidv4, AbstractDataType);

DataTypeUuidv4.prototype.key = DataTypeUuidv4.key = 'UUIDV4';

DataTypeUuidv4.prototype.validate = validateUUIDV4;

/**
 * Creates a VIRTUAL data type.
 * @param {DataType} returnType - The return type of the virtual field.
 * @param {string[]} fields - The fields that the virtual field depends on.
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
 * Creates an ENUM data type.
 * @param {...*} values - The allowed values for the enum.
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

DataTypeEnum.prototype.validate = validateEnum;

/**
 * Creates an ARRAY data type.
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
 * Returns the SQL representation of an ARRAY data type.
 * @returns {string} SQL representation.
 */
DataTypeArray.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

DataTypeArray.prototype.validate = validateArray;

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
 * Creates a GEOMETRY data type.
 * @param {string} type - The type of the geometry.
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

DataTypeGeometry.prototype.escape = false;

DataTypeGeometry.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Creates a GEOGRAPHY data type.
 * @param {string} type - The type of the geography.
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

DataTypeGeography.prototype.escape = false;

DataTypeGeography.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Creates a CIDR data type.
 */
function DataTypeCidr() {
  if (!(this instanceof DataTypeCidr)) return new DataTypeCidr();
}

inherits(DataTypeCidr, AbstractDataType);

DataTypeCidr.prototype.key = DataTypeCidr.key = 'CIDR';

DataTypeCidr.prototype.validate = validateCIDR;

/**
 * Creates an INET data type.
 */
function DataTypeInet() {
  if (!(this instanceof DataTypeInet)) return new DataTypeInet();
}

inherits(DataTypeInet, AbstractDataType);

DataTypeInet.prototype.key = DataTypeInet.key = 'INET';

DataTypeInet.prototype.validate = validateINET;

/**
 * Creates a MACADDR data type.
 */
function DataTypeMacaddr() {
  if (!(this instanceof DataTypeMacaddr)) return new DataTypeMacaddr();
}

inherits(DataTypeMacaddr, AbstractDataType);

DataTypeMacaddr.prototype.key = DataTypeMacaddr.key = 'MACADDR';

DataTypeMacaddr.prototype.validate = validateMACADDR;

/**
 * Helper object for common data type modifiers.
 */
const helpers = {
  BINARY: [DataTypeString, DataTypeChar],
  UNSIGNED: [DataTypeNumber, DataTypeTinyint, DataTypeSmallint, DataTypeMediumint, DataTypeInteger, DataTypeBigint, DataTypeFloat, DataTypeDouble, DataTypeReal, DataTypeDecimal],
  ZEROFILL: [DataTypeNumber, DataTypeTinyint, DataTypeSmallint, DataTypeMediumint, DataTypeInteger, DataTypeBigint, DataTypeFloat, DataTypeDouble, DataTypeReal, DataTypeDecimal],
  PRECISION: [DataTypeDecimal],
  SCALE: [DataTypeDecimal]
};

/**
 * Applies common modifiers to data types.
 */
function applyModifiers() {
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

applyModifiers();

DataTypes.postgres = require('./dialects/postgres/data-types')(DataTypes);
DataTypes.mysql = require('./dialects/mysql/data-types')(DataTypes);
DataTypes.sqlite = require('./dialects/sqlite/data-types')(DataTypes);
DataTypes.mssql = require('./dialects/mssql/data-types')(DataTypes);

module.exports = DataTypes;