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
 * Provides common functionality and properties shared by all type implementations.
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
 * Stringifies a value based on the type's configuration.
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
 * Validates a value against the data type constraints.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
AbstractDataType.prototype.validate = function validate(value) {
  return true;
};

/**
 * Sanitizes a value before storing it.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration object.
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
 * @param {Object} options - Optional configuration object.
 * @returns {Date} Date with timezone applied.
 */
AbstractDataType.prototype._applyTimezone = function _applyTimezone(date, options) {
  return date;
};

/**
 * Converts a value to its string representation.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {string} String representation.
 */
AbstractDataType.prototype._stringify = function _stringify(value, options) {
  return value;
};

/**
 * Base class for string data types.
 * @param {Object|string} length - Maximum length or options object.
 * @param {boolean} binary - Whether the string is binary.
 */
function StringDataType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof StringDataType)) return new StringDataType(options);

  this.options = options;
  this._binary = options.binary;
  this._length = options.length || 255;
}

inherits(StringDataType, AbstractDataType);

StringDataType.prototype.key = StringDataType.key = 'STRING';

/**
 * Returns the SQL representation for string types.
 * @returns {string} SQL representation.
 */
StringDataType.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Validates a value is a string or buffer.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
StringDataType.prototype.validate = function validate(value) {
  if (Object.prototype.toString.call(value) !== '[object String]') {
    if (this.options.binary && Buffer.isBuffer(value) || _.isNumber(value)) {
      return true;
    }
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

/**
 * Sets the binary flag for the string type.
 * @returns {StringDataType} This instance.
 */
Object.defineProperty(StringDataType.prototype, 'BINARY', {
  get() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
});

/**
 * Base class for character data types.
 * @param {Object|string} length - Maximum length or options object.
 * @param {boolean} binary - Whether the string is binary.
 */
function CharDataType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof CharDataType)) return new CharDataType(options);
  StringDataType.apply(this, arguments);
}

inherits(CharDataType, StringDataType);

CharDataType.prototype.key = CharDataType.key = 'CHAR';

/**
 * Returns the SQL representation for character types.
 * @returns {string} SQL representation.
 */
CharDataType.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Base class for text data types.
 * @param {Object|string} length - Maximum length or options object.
 */
function TextDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TextDataType)) return new TextDataType(options);
  this.options = options;
  this._length = options.length || '';
}

inherits(TextDataType, AbstractDataType);

TextDataType.prototype.key = TextDataType.key = 'TEXT';

/**
 * Returns the SQL representation for text types.
 * @returns {string} SQL representation.
 */
TextDataType.prototype.toSql = function toSql() {
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
 * Validates a value is a string.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
TextDataType.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

/**
 * Base class for numeric data types.
 * @param {Object} options - Configuration options.
 */
function NumberDataType(options) {
  this.options = options;
  this._length = options.length;
  this._zerofill = options.zerofill;
  this._decimals = options.decimals;
  this._precision = options.precision;
  this._scale = options.scale;
  this._unsigned = options.unsigned;
}

inherits(NumberDataType, AbstractDataType);

NumberDataType.prototype.key = NumberDataType.key = 'NUMBER';

/**
 * Returns the SQL representation for numeric types.
 * @returns {string} SQL representation.
 */
NumberDataType.prototype.toSql = function toSql() {
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
 * Validates a value is a float.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
NumberDataType.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

/**
 * Converts a numeric value to string.
 * @param {*} number - The number to stringify.
 * @returns {*} String representation.
 */
NumberDataType.prototype._stringify = function _stringify(number) {
  if (typeof number === 'number' || typeof number === 'boolean' || number === null || number === undefined) {
    return number;
  }
  if (typeof number.toString === 'function') {
    return number.toString();
  }
  return number;
};

/**
 * Sets the unsigned flag for the number type.
 * @returns {NumberDataType} This instance.
 */
Object.defineProperty(NumberDataType.prototype, 'UNSIGNED', {
  get() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }
});

/**
 * Sets the zerofill flag for the number type.
 * @returns {NumberDataType} This instance.
 */
Object.defineProperty(NumberDataType.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

/**
 * Base class for integer data types.
 * @param {Object|string} length - Maximum length or options object.
 */
function IntegerDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof IntegerDataType)) return new IntegerDataType(options);
  NumberDataType.call(this, options);
}

inherits(IntegerDataType, NumberDataType);

IntegerDataType.prototype.key = IntegerDataType.key = 'INTEGER';

/**
 * Validates a value is an integer.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
IntegerDataType.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

/**
 * Base class for tiny integer data types.
 * @param {Object|string} length - Maximum length or options object.
 */
function TinyIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TinyIntDataType)) return new TinyIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(TinyIntDataType, IntegerDataType);

TinyIntDataType.prototype.key = TinyIntDataType.key = 'TINYINT';

/**
 * Base class for small integer data types.
 * @param {Object|string} length - Maximum length or options object.
 */
function SmallIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SmallIntDataType)) return new SmallIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(SmallIntDataType, IntegerDataType);

SmallIntDataType.prototype.key = SmallIntDataType.key = 'SMALLINT';

/**
 * Base class for medium integer data types.
 * @param {Object|string} length - Maximum length or options object.
 */
function MediumIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MediumIntDataType)) return new MediumIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(MediumIntDataType, IntegerDataType);

MediumIntDataType.prototype.key = MediumIntDataType.key = 'MEDIUMINT';

/**
 * Base class for big integer data types.
 * @param {Object|string} length - Maximum length or options object.
 */
function BigIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BigIntDataType)) return new BigIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(BigIntDataType, IntegerDataType);

BigIntDataType.prototype.key = BigIntDataType.key = 'BIGINT';

/**
 * Base class for float data types.
 * @param {Object|string} length - Maximum length or options object.
 * @param {number} decimals - Number of decimal places.
 */
function FloatDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof FloatDataType)) return new FloatDataType(options);
  NumberDataType.call(this, options);
}

inherits(FloatDataType, NumberDataType);

FloatDataType.prototype.key = FloatDataType.key = 'FLOAT';

/**
 * Validates a value is a float.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
FloatDataType.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }
  return true;
};

/**
 * Base class for real data types.
 * @param {Object|string} length - Maximum length or options object.
 * @param {number} decimals - Number of decimal places.
 */
function RealDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof RealDataType)) return new RealDataType(options);
  NumberDataType.call(this, options);
}

inherits(RealDataType, NumberDataType);

RealDataType.prototype.key = RealDataType.key = 'REAL';

/**
 * Base class for double precision data types.
 * @param {Object|string} length - Maximum length or options object.
 * @param {number} decimals - Number of decimal places.
 */
function DoubleDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DoubleDataType)) return new DoubleDataType(options);
  NumberDataType.call(this, options);
}

inherits(DoubleDataType, NumberDataType);

DoubleDataType.prototype.key = DoubleDataType.key = 'DOUBLE PRECISION';

/**
 * Base class for decimal data types.
 * @param {Object} precision - Number of significant digits.
 * @param {Object} scale - Number of decimal places.
 */
function DecimalDataType(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DecimalDataType)) return new DecimalDataType(options);
  NumberDataType.call(this, options);
}

inherits(DecimalDataType, NumberDataType);

DecimalDataType.prototype.key = DecimalDataType.key = 'DECIMAL';

/**
 * Returns the SQL representation for decimal types.
 * @returns {string} SQL representation.
 */
DecimalDataType.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }
  return 'DECIMAL';
};

/**
 * Validates a value is a decimal.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
DecimalDataType.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
};

/**
 * Sets escape flag to false for floating point types.
 * @param {Function} type - The data type constructor.
 */
function setFloatingPointEscape(type) {
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

setFloatingPointEscape(FloatDataType);
setFloatingPointEscape(DoubleDataType);
setFloatingPointEscape(RealDataType);

/**
 * Base class for boolean data types.
 */
function BooleanDataType() {
  if (!(this instanceof BooleanDataType)) return new BooleanDataType();
}

inherits(BooleanDataType, AbstractDataType);

BooleanDataType.prototype.key = BooleanDataType.key = 'BOOLEAN';

/**
 * Returns the SQL representation for boolean types.
 * @returns {string} SQL representation.
 */
BooleanDataType.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

/**
 * Validates a value is a boolean.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
BooleanDataType.prototype.validate = function validate(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }
  return true;
};

/**
 * Sanitizes a boolean value.
 * @param {*} value - The value to sanitize.
 * @returns {*} Sanitized value.
 */
BooleanDataType.prototype._sanitize = function _sanitize(value) {
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
 * Static method to sanitize boolean values.
 * @param {*} value - The value to sanitize.
 * @returns {*} Sanitized value.
 */
BooleanDataType.parse = BooleanDataType.prototype._sanitize;

/**
 * Base class for time data types.
 */
function TimeDataType() {
  if (!(this instanceof TimeDataType)) return new TimeDataType();
}

inherits(TimeDataType, AbstractDataType);

TimeDataType.prototype.key = TimeDataType.key = 'TIME';

/**
 * Returns the SQL representation for time types.
 * @returns {string} SQL representation.
 */
TimeDataType.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * Base class for date data types.
 * @param {Object|string} length - Maximum length or options object.
 */
function DateDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof DateDataType)) return new DateDataType(options);
  this.options = options;
  this._length = options.length || '';
}

inherits(DateDataType, AbstractDataType);

DateDataType.prototype.key = DateDataType.key = 'DATE';

/**
 * Returns the SQL representation for date types.
 * @returns {string} SQL representation.
 */
DateDataType.prototype.toSql = function toSql() {
  return 'DATETIME';
};

/**
 * Validates a value is a date.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
DateDataType.prototype.validate = function validate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }
  return true;
};

/**
 * Sanitizes a date value.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration object.
 * @returns {*} Sanitized value.
 */
DateDataType.prototype._sanitize = function _sanitize(value, options) {
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
DateDataType.prototype._isChanged = function _isChanged(value, originalValue) {
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
 * @param {Date} date - The date to apply timezone to.
 * @param {Object} options - Optional configuration object.
 * @returns {Date} Date with timezone applied.
 */
DateDataType.prototype._applyTimezone = function _applyTimezone(date, options) {
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
 * Converts a date value to string.
 * @param {Date} date - The date to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {string} String representation.
 */
DateDataType.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

/**
 * Base class for date only data types.
 */
function DateOnlyDataType() {
  if (!(this instanceof DateOnlyDataType)) return new DateOnlyDataType();
}

util.inherits(DateOnlyDataType, AbstractDataType);

DateOnlyDataType.prototype.key = DateOnlyDataType.key = 'DATEONLY';

/**
 * Returns the SQL representation for date only types.
 * @returns {string} SQL representation.
 */
DateOnlyDataType.prototype.toSql = function toSql() {
  return 'DATE';
};

/**
 * Converts a date only value to string.
 * @param {Date} date - The date to stringify.
 * @returns {string} String representation.
 */
DateOnlyDataType.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};

/**
 * Sanitizes a date only value.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration object.
 * @returns {*} Sanitized value.
 */
DateOnlyDataType.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value;
};

/**
 * Checks if a date only value has changed.
 * @param {*} value - The new value.
 * @param {*} originalValue - The original value.
 * @returns {boolean} True if changed.
 */
DateOnlyDataType.prototype._isChanged = function _isChanged(value, originalValue) {
  if (originalValue && !!value && originalValue === value) {
    return false;
  }
  if (!originalValue && !value && originalValue === value) {
    return false;
  }
  return true;
};

/**
 * Base class for hstore data types.
 */
function HstoreDataType() {
  if (!(this instanceof HstoreDataType)) return new HstoreDataType();
}

inherits(HstoreDataType, AbstractDataType);

HstoreDataType.prototype.key = HstoreDataType.key = 'HSTORE';

/**
 * Validates a value is a plain object.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
HstoreDataType.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
};

/**
 * Base class for JSON data types.
 */
function JsonDataType() {
  if (!(this instanceof JsonDataType)) return new JsonDataType();
}

inherits(JsonDataType, AbstractDataType);

JsonDataType.prototype.key = JsonDataType.key = 'JSON';

/**
 * Validates a value is JSON.
 * @returns {boolean} True if valid.
 */
JsonDataType.prototype.validate = function validate() {
  return true;
};

/**
 * Converts a value to JSON string.
 * @param {*} value - The value to stringify.
 * @returns {string} JSON string.
 */
JsonDataType.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

/**
 * Base class for JSONB data types.
 */
function JsonbDataType() {
  if (!(this instanceof JsonbDataType)) return new JsonbDataType();
  JsonDataType.call(this);
}

inherits(JsonbDataType, JsonDataType);

JsonbDataType.prototype.key = JsonbDataType.key = 'JSONB';

/**
 * Base class for NOW data types.
 */
function NowDataType() {
  if (!(this instanceof NowDataType)) return new NowDataType();
}

inherits(NowDataType, AbstractDataType);

NowDataType.prototype.key = NowDataType.key = 'NOW';

/**
 * Base class for BLOB data types.
 * @param {Object|string} length - Maximum length or options object.
 */
function BlobDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BlobDataType)) return new BlobDataType(options);
  this.options = options;
  this._length = options.length || '';
}

inherits(BlobDataType, AbstractDataType);

BlobDataType.prototype.key = BlobDataType.key = 'BLOB';

/**
 * Returns the SQL representation for blob types.
 * @returns {string} SQL representation.
 */
BlobDataType.prototype.toSql = function toSql() {
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
 * Validates a value is a string or buffer.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
BlobDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
};

/**
 * Sets escape flag to false for blob types.
 */
BlobDataType.prototype.escape = false;

/**
 * Converts a blob value to hex string.
 * @param {*} value - The value to stringify.
 * @returns {string} Hex string.
 */
BlobDataType.prototype._stringify = function _stringify(value) {
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
 * Formats hex string with X prefix.
 * @param {string} hex - The hex string.
 * @returns {string} Formatted hex string.
 */
BlobDataType.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

/**
 * Base class for range data types.
 * @param {Object|string} subtype - The subtype of the range.
 */
function RangeDataType(subtype) {
  const options = _.isPlainObject(subtype) ? subtype : {subtype};

  if (!options.subtype) options.subtype = new IntegerDataType();

  if (_.isFunction(options.subtype)) {
    options.subtype = new options.subtype();
  }

  if (!(this instanceof RangeDataType)) return new RangeDataType(options);

  this._subtype = options.subtype.key;
  this.options = options;
}

inherits(RangeDataType, AbstractDataType);

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

RangeDataType.prototype.key = RangeDataType.key = 'RANGE';

/**
 * Returns the SQL representation for range types.
 * @returns {string} SQL representation.
 */
RangeDataType.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};

/**
 * Returns the cast type for range types.
 * @returns {string} Cast type.
 */
RangeDataType.prototype.toCastType = function toCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};

/**
 * Validates a value is a range.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
RangeDataType.prototype.validate = function validate(value) {
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
 * Base class for UUID data types.
 */
function UuidDataType() {
  if (!(this instanceof UuidDataType)) return new UuidDataType();
}

inherits(UuidDataType, AbstractDataType);

UuidDataType.prototype.key = UuidDataType.key = 'UUID';

/**
 * Validates a value is a UUID.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration object.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
UuidDataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * Base class for UUID v1 data types.
 */
function UuidV1DataType() {
  if (!(this instanceof UuidV1DataType)) return new UuidV1DataType();
}

inherits(UuidV1DataType, AbstractDataType);

UuidV1DataType.prototype.key = UuidV1DataType.key = 'UUIDV1';

/**
 * Validates a value is a UUID v1.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration object.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
UuidV1DataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * Base class for UUID v4 data types.
 */
function UuidV4DataType() {
  if (!(this instanceof UuidV4DataType)) return new UuidV4DataType();
}

inherits(UuidV4DataType, AbstractDataType);

UuidV4DataType.prototype.key = UuidV4DataType.key = 'UUIDV4';

/**
 * Validates a value is a UUID v4.
 * @param {*} value - The value to validate.
 * @param {Object} options - Optional configuration object.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
UuidV4DataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }
  return true;
};

/**
 * Base class for virtual data types.
 * @param {Function} returnType - The return type of the virtual field.
 * @param {string[]} fields - The fields that the virtual field depends on.
 */
function VirtualDataType(ReturnType, fields) {
  if (!(this instanceof VirtualDataType)) return new VirtualDataType(ReturnType, fields);
  if (typeof ReturnType === 'function') ReturnType = new ReturnType();

  this.returnType = ReturnType;
  this.fields = fields;
}

inherits(VirtualDataType, AbstractDataType);

VirtualDataType.prototype.key = VirtualDataType.key = 'VIRTUAL';

/**
 * Base class for ENUM data types.
 * @param {string|string[]} value - The value(s) of the enum.
 */
function EnumDataType(value) {
  const options = typeof value === 'object' && !Array.isArray(value) && value || {
    values: Array.prototype.slice.call(arguments).reduce((result, element) => {
      return result.concat(Array.isArray(element) ? element : [element]);
    }, [])
  };
  if (!(this instanceof EnumDataType)) return new EnumDataType(options);
  this.values = options.values;
  this.options = options;
}

inherits(EnumDataType, AbstractDataType);

EnumDataType.prototype.key = EnumDataType.key = 'ENUM';

/**
 * Validates a value is in the enum values.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
EnumDataType.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }
  return true;
};

/**
 * Base class for ARRAY data types.
 * @param {Object|Function} type - The type of the array elements.
 */
function ArrayDataType(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ArrayDataType)) return new ArrayDataType(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}

inherits(ArrayDataType, AbstractDataType);

ArrayDataType.prototype.key = ArrayDataType.key = 'ARRAY';

/**
 * Returns the SQL representation for array types.
 * @returns {string} SQL representation.
 */
ArrayDataType.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

/**
 * Validates a value is an array.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
ArrayDataType.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }
  return true;
};

/**
 * Checks if an object is an array of a specific type.
 * @param {Object} obj - The object to check.
 * @param {Function} type - The type to check against.
 * @returns {boolean} True if it is an array of the specified type.
 */
ArrayDataType.is = function is(obj, type) {
  return obj instanceof ArrayDataType && obj.type instanceof type;
};

/**
 * Helper object containing lists of data types with specific properties.
 */
const helpers = {
  BINARY: [StringDataType, CharDataType],
  UNSIGNED: [NumberDataType, TinyIntDataType, SmallIntDataType, MediumIntDataType, IntegerDataType, BigIntDataType, FloatDataType, DoubleDataType, RealDataType, DecimalDataType],
  ZEROFILL: [NumberDataType, TinyIntDataType, SmallIntDataType, MediumIntDataType, IntegerDataType, BigIntDataType, FloatDataType, DoubleDataType, RealDataType, DecimalDataType],
  PRECISION: [DecimalDataType],
  SCALE: [DecimalDataType]
};

/**
 * Base class for geometry data types.
 * @param {Object|string} type - The type of geometry.
 * @param {string} srid - The spatial reference identifier.
 */
function GeometryDataType(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};

  if (!(this instanceof GeometryDataType)) return new GeometryDataType(options);

  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}

inherits(GeometryDataType, AbstractDataType);

GeometryDataType.prototype.key = GeometryDataType.key = 'GEOMETRY';

/**
 * Sets escape flag to false for geometry types.
 */
GeometryDataType.prototype.escape = false;

/**
 * Converts a geometry value to WKT string.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {string} WKT string.
 */
GeometryDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Base class for geography data types.
 * @param {Object|string} type - The type of geography.
 * @param {string} srid - The spatial reference identifier.
 */
function GeographyDataType(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};

  if (!(this instanceof GeographyDataType)) return new GeographyDataType(options);

  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}

inherits(GeographyDataType, AbstractDataType);

GeographyDataType.prototype.key = GeographyDataType.key = 'GEOGRAPHY';

/**
 * Sets escape flag to false for geography types.
 */
GeographyDataType.prototype.escape = false;

/**
 * Converts a geography value to WKT string.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {string} WKT string.
 */
GeographyDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Base class for CIDR data types.
 */
function CidrDataType() {
  if (!(this instanceof CidrDataType)) return new CidrDataType();
}

inherits(CidrDataType, AbstractDataType);

CidrDataType.prototype.key = CidrDataType.key = 'CIDR';

/**
 * Validates a value is a CIDR.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
CidrDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }
  return true;
};

/**
 * Base class for INET data types.
 */
function InetDataType() {
  if (!(this instanceof InetDataType)) return new InetDataType();
}

inherits(InetDataType, AbstractDataType);

InetDataType.prototype.key = InetDataType.key = 'INET';

/**
 * Validates a value is an INET.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
InetDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }
  return true;
};

/**
 * Base class for MACADDR data types.
 */
function MacaddrDataType() {
  if (!(this instanceof MacaddrDataType)) return new MacaddrDataType();
}

inherits(MacaddrDataType, AbstractDataType);

MacaddrDataType.prototype.key = MacaddrDataType.key = 'MACADDR';

/**
 * Validates a value is a MACADDR.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If validation fails.
 */
MacaddrDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
};

/**
 * Dynamically adds helper properties to data types.
 * @param {string} helper - The name of the helper property.
 * @param {Array} types - The list of data types to add the helper to.
 */
function addHelperProperty(helper, types) {
  for (const DataType of types) {
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

addHelperProperty('BINARY', helpers.BINARY);
addHelperProperty('UNSIGNED', helpers.UNSIGNED);
addHelperProperty('ZEROFILL', helpers.ZEROFILL);
addHelperProperty('PRECISION', helpers.PRECISION);
addHelperProperty('SCALE', helpers.SCALE);

/**
 * A convenience class holding commonly used data types.
 * The datatypes are used when defining a new model using `Sequelize.define`.
 *
 * To provide a length for the data type, you can invoke it like a function: `INTEGER(2)`
 *
 * Some data types have special properties that can be accessed in order to change the data type.
 * For example, to get an unsigned integer with zerofill you can do `DataTypes.INTEGER.UNSIGNED.ZEROFILL`.
 *
 * Three of the values provided here (`NOW`, `UUIDV1` and `UUIDV4`) are special default values,
 * that should not be used to define types. Instead they are used as shorthands for defining default values.
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
  ABSTRACT: AbstractDataType,
  STRING: StringDataType,
  CHAR: CharDataType,
  TEXT: TextDataType,
  NUMBER: NumberDataType,
  TINYINT: TinyIntDataType,
  SMALLINT: SmallIntDataType,
  MEDIUMINT: MediumIntDataType,
  INTEGER: IntegerDataType,
  BIGINT: BigIntDataType,
  FLOAT: FloatDataType,
  TIME: TimeDataType,
  DATE: DateDataType,
  DATEONLY: DateOnlyDataType,
  BOOLEAN: BooleanDataType,
  NOW: NowDataType,
  BLOB: BlobDataType,
  DECIMAL: DecimalDataType,
  NUMERIC: DecimalDataType,
  UUID: UuidDataType,
  UUIDV1: UuidV1DataType,
  UUIDV4: UuidV4DataType,
  HSTORE: HstoreDataType,
  JSON: JsonDataType,
  JSONB: JsonbDataType,
  VIRTUAL: VirtualDataType,
  ARRAY: ArrayDataType,
  NONE: VirtualDataType,
  ENUM: EnumDataType,
  RANGE: RangeDataType,
  REAL: RealDataType,
  DOUBLE: DoubleDataType,
  'DOUBLE PRECISION': DoubleDataType,
  GEOMETRY: GeometryDataType,
  GEOGRAPHY: GeographyDataType,
  CIDR: CidrDataType,
  INET: InetDataType,
  MACADDR: MacaddrDataType
};

_.each(DataTypes, dataType => {
  dataType.types = {};
});

DataTypes.postgres = require('./dialects/postgres/data-types')(DataTypes);
DataTypes.mysql = require('./dialects/mysql/data-types')(DataTypes);
DataTypes.sqlite = require('./dialects/sqlite/data-types')(DataTypes);
DataTypes.mssql = require('./dialects/mssql/data-types')(DataTypes);

module.exports = DataTypes;