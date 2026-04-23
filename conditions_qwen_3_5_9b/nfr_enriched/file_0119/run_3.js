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
 * @returns {string} The SQL representation of the data type.
 */
AbstractDataType.prototype.toString = function toString(options) {
  return this.toSql(options);
};

/**
 * Returns the SQL representation of the data type.
 * @returns {string} The SQL representation.
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
 * Stringifies a value based on the data type's specific stringify method.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {*} The stringified value.
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
 * @throws {Error} If the value is not a valid string.
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
 * @throws {Error} If the value is not a valid string.
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
 * @throws {Error} If the value is not a valid number.
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
 * @throws {Error} If the value is not a valid integer.
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
 * @throws {Error} If the value is not a valid float.
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
 * @throws {Error} If the value is not a valid decimal.
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
 * @throws {Error} If the value is not a valid boolean.
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
 * @throws {Error} If the value is not a valid date.
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
 * @throws {Error} If the value is not a valid plain object.
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
 * @throws {Error} If the value is not a valid UUID.
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
 * @throws {Error} If the value is not a valid UUID v4.
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
 * @throws {Error} If the value is not a valid array.
 */
function validateArray(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }
  return true;
}

/**
 * Validates if a value is a valid CIDR.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid CIDR.
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
 * @throws {Error} If the value is not a valid INET.
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
 * @throws {Error} If the value is not a valid MAC address.
 */
function validateMACADDR(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
}

/**
 * Validates if a value is a valid ENUM.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid ENUM.
 */
function validateEnum(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }
  return true;
}

/**
 * Validates if a value is a valid range.
 * @param {*} value - The value to validate.
 * @returns {boolean} True if valid.
 * @throws {Error} If the value is not a valid range.
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
 * STRING data type for variable length strings.
 * @param {number|string} length - The maximum length of the string.
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
 * Returns the SQL representation of the STRING data type.
 * @returns {string} The SQL representation.
 */
StringDataType.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

StringDataType.prototype.validate = validateString;

/**
 * Sets the binary flag for the STRING data type.
 * @returns {StringDataType} The data type instance.
 */
Object.defineProperty(StringDataType.prototype, 'BINARY', {
  get() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
});

/**
 * CHAR data type for fixed length strings.
 * @param {number|string} length - The length of the string.
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
 * Returns the SQL representation of the CHAR data type.
 * @returns {string} The SQL representation.
 */
CharDataType.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * TEXT data type for unlimited length text.
 * @param {string} length - The length of the text.
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
 * Returns the SQL representation of the TEXT data type.
 * @returns {string} The SQL representation.
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

TextDataType.prototype.validate = validateText;

/**
 * NUMBER data type for numeric values.
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
 * Returns the SQL representation of the NUMBER data type.
 * @returns {string} The SQL representation.
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

NumberDataType.prototype.validate = validateNumber;

/**
 * Stringifies a number value.
 * @param {*} number - The number to stringify.
 * @returns {*} The stringified number.
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
 * Sets the unsigned flag for the NUMBER data type.
 * @returns {NumberDataType} The data type instance.
 */
Object.defineProperty(NumberDataType.prototype, 'UNSIGNED', {
  get() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }
});

/**
 * Sets the zerofill flag for the NUMBER data type.
 * @returns {NumberDataType} The data type instance.
 */
Object.defineProperty(NumberDataType.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

/**
 * INTEGER data type for 32-bit integers.
 * @param {number|string} length - The length of the integer.
 */
function IntegerDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof IntegerDataType)) return new IntegerDataType(options);
  NumberDataType.call(this, options);
}

inherits(IntegerDataType, NumberDataType);

IntegerDataType.prototype.key = IntegerDataType.key = 'INTEGER';

IntegerDataType.prototype.validate = validateInteger;

/**
 * TINYINT data type for 8-bit integers.
 * @param {number|string} length - The length of the integer.
 */
function TinyIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TinyIntDataType)) return new TinyIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(TinyIntDataType, IntegerDataType);

TinyIntDataType.prototype.key = TinyIntDataType.key = 'TINYINT';

/**
 * SMALLINT data type for 16-bit integers.
 * @param {number|string} length - The length of the integer.
 */
function SmallIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SmallIntDataType)) return new SmallIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(SmallIntDataType, IntegerDataType);

SmallIntDataType.prototype.key = SmallIntDataType.key = 'SMALLINT';

/**
 * MEDIUMINT data type for 24-bit integers.
 * @param {number|string} length - The length of the integer.
 */
function MediumIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MediumIntDataType)) return new MediumIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(MediumIntDataType, IntegerDataType);

MediumIntDataType.prototype.key = MediumIntDataType.key = 'MEDIUMINT';

/**
 * BIGINT data type for 64-bit integers.
 * @param {number|string} length - The length of the integer.
 */
function BigIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BigIntDataType)) return new BigIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(BigIntDataType, IntegerDataType);

BigIntDataType.prototype.key = BigIntDataType.key = 'BIGINT';

/**
 * FLOAT data type for floating point numbers.
 * @param {number|string} length - The length of the float.
 * @param {number|string} decimals - The number of decimals.
 */
function FloatDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof FloatDataType)) return new FloatDataType(options);
  NumberDataType.call(this, options);
}

inherits(FloatDataType, NumberDataType);

FloatDataType.prototype.key = FloatDataType.key = 'FLOAT';

FloatDataType.prototype.validate = validateFloat;

/**
 * REAL data type for floating point numbers.
 * @param {number|string} length - The length of the real.
 * @param {number|string} decimals - The number of decimals.
 */
function RealDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof RealDataType)) return new RealDataType(options);
  NumberDataType.call(this, options);
}

inherits(RealDataType, NumberDataType);

RealDataType.prototype.key = RealDataType.key = 'REAL';

/**
 * DOUBLE data type for floating point numbers.
 * @param {number|string} length - The length of the double.
 * @param {number|string} decimals - The number of decimals.
 */
function DoubleDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DoubleDataType)) return new DoubleDataType(options);
  NumberDataType.call(this, options);
}

inherits(DoubleDataType, NumberDataType);

DoubleDataType.prototype.key = DoubleDataType.key = 'DOUBLE PRECISION';

/**
 * DECIMAL data type for decimal numbers.
 * @param {number|string} precision - The precision of the decimal.
 * @param {number|string} scale - The scale of the decimal.
 */
function DecimalDataType(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DecimalDataType)) return new DecimalDataType(options);
  NumberDataType.call(this, options);
}

inherits(DecimalDataType, NumberDataType);

DecimalDataType.prototype.key = DecimalDataType.key = 'DECIMAL';

/**
 * Returns the SQL representation of the DECIMAL data type.
 * @returns {string} The SQL representation.
 */
DecimalDataType.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }
  return 'DECIMAL';
};

DecimalDataType.prototype.validate = validateDecimal;

/**
 * Applies special stringification for floating point types.
 * @param {Array} floatingTypes - Array of floating point data types.
 */
function applyFloatingPointStringification(floatingTypes) {
  floatingTypes.forEach(function (DataType) {
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
  });
}

applyFloatingPointStringification([FloatDataType, DoubleDataType, RealDataType]);

/**
 * BOOLEAN data type for boolean values.
 */
function BooleanDataType() {
  if (!(this instanceof BooleanDataType)) return new BooleanDataType();
}

inherits(BooleanDataType, AbstractDataType);

BooleanDataType.prototype.key = BooleanDataType.key = 'BOOLEAN';

/**
 * Returns the SQL representation of the BOOLEAN data type.
 * @returns {string} The SQL representation.
 */
BooleanDataType.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

BooleanDataType.prototype.validate = validateBoolean;

/**
 * Sanitizes a boolean value.
 * @param {*} value - The value to sanitize.
 * @returns {*} The sanitized value.
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

BooleanDataType.parse = BooleanDataType.prototype._sanitize;

/**
 * TIME data type for time values.
 */
function TimeDataType() {
  if (!(this instanceof TimeDataType)) return new TimeDataType();
}

inherits(TimeDataType, AbstractDataType);

TimeDataType.prototype.key = TimeDataType.key = 'TIME';

/**
 * Returns the SQL representation of the TIME data type.
 * @returns {string} The SQL representation.
 */
TimeDataType.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * DATE data type for date values.
 * @param {number|string} length - The length of the date.
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
 * Returns the SQL representation of the DATE data type.
 * @returns {string} The SQL representation.
 */
DateDataType.prototype.toSql = function toSql() {
  return 'DATETIME';
};

DateDataType.prototype.validate = validateDate;

/**
 * Sanitizes a date value.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration object.
 * @returns {*} The sanitized value.
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
 * @returns {boolean} True if the value has changed.
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
 * @returns {Date} The date with timezone applied.
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
 * Stringifies a date value.
 * @param {Date} date - The date to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {string} The stringified date.
 */
DateDataType.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

/**
 * DATEONLY data type for date-only values.
 */
function DateOnlyDataType() {
  if (!(this instanceof DateOnlyDataType)) return new DateOnlyDataType();
}

util.inherits(DateOnlyDataType, AbstractDataType);

DateOnlyDataType.prototype.key = DateOnlyDataType.key = 'DATEONLY';

/**
 * Returns the SQL representation of the DATEONLY data type.
 * @returns {string} The SQL representation.
 */
DateOnlyDataType.prototype.toSql = function toSql() {
  return 'DATE';
};

/**
 * Stringifies a date-only value.
 * @param {Date} date - The date to stringify.
 * @returns {string} The stringified date.
 */
DateOnlyDataType.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};

/**
 * Sanitizes a date-only value.
 * @param {*} value - The value to sanitize.
 * @param {Object} options - Optional configuration object.
 * @returns {*} The sanitized value.
 */
DateOnlyDataType.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value;
};

/**
 * Checks if a date-only value has changed.
 * @param {*} value - The new value.
 * @param {*} originalValue - The original value.
 * @returns {boolean} True if the value has changed.
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
 * HSTORE data type for key-value stores.
 */
function HstoreDataType() {
  if (!(this instanceof HstoreDataType)) return new HstoreDataType();
}

inherits(HstoreDataType, AbstractDataType);

HstoreDataType.prototype.key = HstoreDataType.key = 'HSTORE';

HstoreDataType.prototype.validate = validatePlainObject;

/**
 * JSON data type for JSON strings.
 */
function JsonDataType() {
  if (!(this instanceof JsonDataType)) return new JsonDataType();
}

inherits(JsonDataType, AbstractDataType);

JsonDataType.prototype.key = JsonDataType.key = 'JSON';

JsonDataType.prototype.validate = function validate() {
  return true;
};

/**
 * Stringifies a JSON value.
 * @param {*} value - The value to stringify.
 * @returns {string} The stringified JSON.
 */
JsonDataType.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

/**
 * JSONB data type for binary JSON.
 */
function JsonbDataType() {
  if (!(this instanceof JsonbDataType)) return new JsonbDataType();
  JsonDataType.call(this);
}

inherits(JsonbDataType, JsonDataType);

JsonbDataType.prototype.key = JsonbDataType.key = 'JSONB';

/**
 * NOW data type for current timestamp.
 */
function NowDataType() {
  if (!(this instanceof NowDataType)) return new NowDataType();
}

inherits(NowDataType, AbstractDataType);

NowDataType.prototype.key = NowDataType.key = 'NOW';

/**
 * BLOB data type for binary storage.
 * @param {number|string} length - The length of the blob.
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
 * Returns the SQL representation of the BLOB data type.
 * @returns {string} The SQL representation.
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

BlobDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
};

BlobDataType.prototype.escape = false;

/**
 * Stringifies a blob value.
 * @param {*} value - The value to stringify.
 * @returns {string} The stringified blob.
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
 * Hexifies a blob value.
 * @param {string} hex - The hex string to hexify.
 * @returns {string} The hexified blob.
 */
BlobDataType.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

/**
 * RANGE data type for range values.
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
 * Returns the SQL representation of the RANGE data type.
 * @returns {string} The SQL representation.
 */
RangeDataType.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};

/**
 * Returns the cast type for the RANGE data type.
 * @returns {string} The cast type.
 */
RangeDataType.prototype.toCastType = function toCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};

RangeDataType.prototype.validate = validateRange;

/**
 * UUID data type for unique identifiers.
 */
function UuidDataType() {
  if (!(this instanceof UuidDataType)) return new UuidDataType();
}

inherits(UuidDataType, AbstractDataType);

UuidDataType.prototype.key = UuidDataType.key = 'UUID';

UuidDataType.prototype.validate = validateUUID;

/**
 * UUIDV1 data type for unique identifiers.
 */
function UuidV1DataType() {
  if (!(this instanceof UuidV1DataType)) return new UuidV1DataType();
}

inherits(UuidV1DataType, AbstractDataType);

UuidV1DataType.prototype.key = UuidV1DataType.key = 'UUIDV1';

UuidV1DataType.prototype.validate = validateUUID;

/**
 * UUIDV4 data type for unique identifiers.
 */
function UuidV4DataType() {
  if (!(this instanceof UuidV4DataType)) return new UuidV4DataType();
}

inherits(UuidV4DataType, AbstractDataType);

UuidV4DataType.prototype.key = UuidV4DataType.key = 'UUIDV4';

UuidV4DataType.prototype.validate = validateUUIDV4;

/**
 * VIRTUAL data type for virtual values.
 * @param {Object|Function} returnType - The return type of the virtual value.
 * @param {Array} fields - The fields of the virtual value.
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
 * ENUM data type for enumerated values.
 * @param {Array|string} value - The values of the enum.
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

EnumDataType.prototype.validate = validateEnum;

/**
 * ARRAY data type for array values.
 * @param {Object|Function} type - The type of the array.
 */
function ArrayDataType(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ArrayDataType)) return new ArrayDataType(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}

inherits(ArrayDataType, AbstractDataType);

ArrayDataType.prototype.key = ArrayDataType.key = 'ARRAY';

/**
 * Returns the SQL representation of the ARRAY data type.
 * @returns {string} The SQL representation.
 */
ArrayDataType.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

ArrayDataType.prototype.validate = validateArray;

/**
 * Checks if an object is an instance of ARRAY with a specific type.
 * @param {Object} obj - The object to check.
 * @param {Function} type - The type to check.
 * @returns {boolean} True if the object is an instance of ARRAY with the specified type.
 */
ArrayDataType.is = function is(obj, type) {
  return obj instanceof ArrayDataType && obj.type instanceof type;
};

/**
 * Helper object for commonly used data types.
 */
const helpers = {
  BINARY: [StringDataType, CharDataType],
  UNSIGNED: [NumberDataType, TinyIntDataType, SmallIntDataType, MediumIntDataType, IntegerDataType, BigIntDataType, FloatDataType, DoubleDataType, RealDataType, DecimalDataType],
  ZEROFILL: [NumberDataType, TinyIntDataType, SmallIntDataType, MediumIntDataType, IntegerDataType, BigIntDataType, FloatDataType, DoubleDataType, RealDataType, DecimalDataType],
  PRECISION: [DecimalDataType],
  SCALE: [DecimalDataType]
};

/**
 * Applies helper properties to data types.
 * @param {Object} helpers - The helpers object.
 */
function applyHelpers(helpers) {
  Object.keys(helpers).forEach(function (helper) {
    helpers[helper].forEach(function (DataType) {
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
    });
  });
}

applyHelpers(helpers);

/**
 * GEOMETRY data type for geometry values.
 * @param {Object|string} type - The type of the geometry.
 * @param {string} srid - The SRID of the geometry.
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

GeometryDataType.prototype.escape = false;

/**
 * Stringifies a geometry value.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {string} The stringified geometry.
 */
GeometryDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * GEOGRAPHY data type for geography values.
 * @param {Object|string} type - The type of the geography.
 * @param {string} srid - The SRID of the geography.
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

GeographyDataType.prototype.escape = false;

/**
 * Stringifies a geography value.
 * @param {*} value - The value to stringify.
 * @param {Object} options - Optional configuration object.
 * @returns {string} The stringified geography.
 */
GeographyDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * CIDR data type for CIDR values.
 */
function CidrDataType() {
  if (!(this instanceof CidrDataType)) return new CidrDataType();
}

inherits(CidrDataType, AbstractDataType);

CidrDataType.prototype.key = CidrDataType.key = 'CIDR';

CidrDataType.prototype.validate = validateCIDR;

/**
 * INET data type for INET values.
 */
function InetDataType() {
  if (!(this instanceof InetDataType)) return new InetDataType();
}

inherits(InetDataType, AbstractDataType);

InetDataType.prototype.key = InetDataType.key = 'INET';

InetDataType.prototype.validate = validateINET;

/**
 * MACADDR data type for MAC address values.
 */
function MacaddrDataType() {
  if (!(this instanceof MacaddrDataType)) return new MacaddrDataType();
}

inherits(MacaddrDataType, AbstractDataType);

MacaddrDataType.prototype.key = MacaddrDataType.key = 'MACADDR';

MacaddrDataType.prototype.validate = validateMACADDR;

/**
 * A convenience class holding commonly used data types.
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