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
 * Base abstract data type class.
 * All data types inherit from this class.
 */
function AbstractDataType() {
  // Base implementation for abstract data type
}

AbstractDataType.prototype.dialectTypes = '';

/**
 * Converts the data type to SQL representation.
 * @param {Object} options - Optional configuration options
 * @returns {string} SQL representation
 */
AbstractDataType.prototype.toString = function toString(options) {
  return this.toSql(options);
};

/**
 * Returns the SQL representation of this data type.
 * @returns {string} SQL representation
 */
AbstractDataType.prototype.toSql = function toSql() {
  return this.key;
};

/**
 * Issues a warning with a link and text.
 * @param {string} link - The link to display
 * @param {string} text - The warning text
 */
AbstractDataType.warn = function warn(link, text) {
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
AbstractDataType.prototype.stringify = function stringify(value, options) {
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
AbstractDataType.prototype.validate = function validate(value) {
  return true;
};

/**
 * Sanitizes a value before storage.
 * @param {*} value - The value to sanitize
 * @param {Object} options - Optional configuration options
 * @returns {*} Sanitized value
 */
AbstractDataType.prototype.sanitize = function sanitize(value, options) {
  return value;
};

/**
 * Checks if a value has changed from the original.
 * @param {*} value - The current value
 * @param {*} originalValue - The original value
 * @returns {boolean} True if changed
 */
AbstractDataType.prototype.isChanged = function isChanged(value, originalValue) {
  return value !== originalValue;
};

/**
 * Applies timezone to a date value.
 * @param {Date} date - The date to apply timezone to
 * @param {Object} options - Optional configuration options
 * @returns {Date} Date with timezone applied
 */
AbstractDataType.prototype.applyTimezone = function applyTimezone(date, options) {
  return date;
};

/**
 * Formats a date value for SQL representation.
 * @param {Date} date - The date to format
 * @param {Object} options - Optional configuration options
 * @returns {string} Formatted date string
 */
AbstractDataType.prototype.formatDate = function formatDate(date, options) {
  return date;
};

/**
 * Hexifies a hex string for SQL representation.
 * @param {string} hex - The hex string to hexify
 * @returns {string} Hexified string
 */
AbstractDataType.prototype.hexify = function hexify(hex) {
  return "X'" + hex + "'";
};

/**
 * Converts a value to a buffer.
 * @param {*} value - The value to convert
 * @returns {Buffer} Buffer representation
 */
AbstractDataType.prototype.toBuffer = function toBuffer(value) {
  if (Array.isArray(value)) {
    return new Buffer(value);
  }
  return new Buffer(value.toString());
};

/**
 * Creates a STRING data type instance.
 * @param {number|string} length - Maximum length of the string
 * @param {boolean} binary - Whether the string is binary
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
 * Returns the SQL representation for STRING type.
 * @returns {string} SQL representation
 */
StringDataType.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Validates a value is a valid string.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
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

Object.defineProperty(StringDataType.prototype, 'BINARY', {
  get() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
});

/**
 * Creates a CHAR data type instance.
 * @param {number|string} length - Length of the character string
 * @param {boolean} binary - Whether the string is binary
 */
function CharDataType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof CharDataType)) return new CharDataType(options);
  StringDataType.call(this, options);
}

inherits(CharDataType, StringDataType);

CharDataType.prototype.key = CharDataType.key = 'CHAR';

/**
 * Returns the SQL representation for CHAR type.
 * @returns {string} SQL representation
 */
CharDataType.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Creates a TEXT data type instance.
 * @param {string} length - Length specification (tiny, medium, long, or empty)
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
 * Returns the SQL representation for TEXT type.
 * @returns {string} SQL representation
 */
TextDataType.prototype.toSql = function toSql() {
  const length = this._length.toLowerCase();
  switch (length) {
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
 * Validates a value is a valid string.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
TextDataType.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

/**
 * Creates a NUMBER data type instance.
 * @param {Object} options - Configuration options for number type
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
 * Returns the SQL representation for NUMBER type.
 * @returns {string} SQL representation
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
 * Validates a value is a valid number.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
NumberDataType.prototype.validate = function validate(value) {
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
NumberDataType.prototype._stringify = function _stringify(number) {
  if (typeof number === 'number' || typeof number === 'boolean' || number === null || number === undefined) {
    return number;
  }
  if (typeof number.toString === 'function') {
    return number.toString();
  }
  return number;
};

Object.defineProperty(NumberDataType.prototype, 'UNSIGNED', {
  get() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }
});

Object.defineProperty(NumberDataType.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

/**
 * Creates an INTEGER data type instance.
 * @param {number|string} length - Length specification
 */
function IntegerDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof IntegerDataType)) return new IntegerDataType(options);
  NumberDataType.call(this, options);
}

inherits(IntegerDataType, NumberDataType);

IntegerDataType.prototype.key = IntegerDataType.key = 'INTEGER';

/**
 * Validates a value is a valid integer.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
IntegerDataType.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

/**
 * Creates a TINYINT data type instance.
 * @param {number|string} length - Length specification
 */
function TinyIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TinyIntDataType)) return new TinyIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(TinyIntDataType, IntegerDataType);

TinyIntDataType.prototype.key = TinyIntDataType.key = 'TINYINT';

/**
 * Creates a SMALLINT data type instance.
 * @param {number|string} length - Length specification
 */
function SmallIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SmallIntDataType)) return new SmallIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(SmallIntDataType, IntegerDataType);

SmallIntDataType.prototype.key = SmallIntDataType.key = 'SMALLINT';

/**
 * Creates a MEDIUMINT data type instance.
 * @param {number|string} length - Length specification
 */
function MediumIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MediumIntDataType)) return new MediumIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(MediumIntDataType, IntegerDataType);

MediumIntDataType.prototype.key = MediumIntDataType.key = 'MEDIUMINT';

/**
 * Creates a BIGINT data type instance.
 * @param {number|string} length - Length specification
 */
function BigIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BigIntDataType)) return new BigIntDataType(options);
  NumberDataType.call(this, options);
}

inherits(BigIntDataType, IntegerDataType);

BigIntDataType.prototype.key = BigIntDataType.key = 'BIGINT';

/**
 * Creates a FLOAT data type instance.
 * @param {number|string} length - Length specification
 * @param {number|string} decimals - Decimal precision
 */
function FloatDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof FloatDataType)) return new FloatDataType(options);
  NumberDataType.call(this, options);
}

inherits(FloatDataType, NumberDataType);

FloatDataType.prototype.key = FloatDataType.key = 'FLOAT';

/**
 * Validates a value is a valid float.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
FloatDataType.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }
  return true;
};

/**
 * Creates a REAL data type instance.
 * @param {number|string} length - Length specification
 * @param {number|string} decimals - Decimal precision
 */
function RealDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof RealDataType)) return new RealDataType(options);
  NumberDataType.call(this, options);
}

inherits(RealDataType, NumberDataType);

RealDataType.prototype.key = RealDataType.key = 'REAL';

/**
 * Creates a DOUBLE data type instance.
 * @param {number|string} length - Length specification
 * @param {number|string} decimals - Decimal precision
 */
function DoubleDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DoubleDataType)) return new DoubleDataType(options);
  NumberDataType.call(this, options);
}

inherits(DoubleDataType, NumberDataType);

DoubleDataType.prototype.key = DoubleDataType.key = 'DOUBLE PRECISION';

/**
 * Creates a DECIMAL data type instance.
 * @param {number|string} precision - Precision of the decimal
 * @param {number|string} scale - Scale of the decimal
 */
function DecimalDataType(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DecimalDataType)) return new DecimalDataType(options);
  NumberDataType.call(this, options);
}

inherits(DecimalDataType, NumberDataType);

DecimalDataType.prototype.key = DecimalDataType.key = 'DECIMAL';

/**
 * Returns the SQL representation for DECIMAL type.
 * @returns {string} SQL representation
 */
DecimalDataType.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }
  return 'DECIMAL';
};

/**
 * Validates a value is a valid decimal.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
DecimalDataType.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
};

/**
 * Sets escape flag for floating point types.
 * @param {Array} types - Array of floating point type constructors
 */
function setFloatingPointEscape(types) {
  types.forEach(function setFloatingPointEscapeType(type) {
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
  });
}

setFloatingPointEscape([FloatDataType, DoubleDataType, RealDataType]);

/**
 * Creates a BOOLEAN data type instance.
 */
function BooleanDataType() {
  if (!(this instanceof BooleanDataType)) return new BooleanDataType();
}

inherits(BooleanDataType, AbstractDataType);

BooleanDataType.prototype.key = BooleanDataType.key = 'BOOLEAN';

/**
 * Returns the SQL representation for BOOLEAN type.
 * @returns {string} SQL representation
 */
BooleanDataType.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

/**
 * Validates a value is a valid boolean.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
BooleanDataType.prototype.validate = function validate(value) {
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
 * Creates a TIME data type instance.
 */
function TimeDataType() {
  if (!(this instanceof TimeDataType)) return new TimeDataType();
}

inherits(TimeDataType, AbstractDataType);

TimeDataType.prototype.key = TimeDataType.key = 'TIME';

/**
 * Returns the SQL representation for TIME type.
 * @returns {string} SQL representation
 */
TimeDataType.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * Creates a DATE data type instance.
 * @param {number|string} length - Length specification
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
 * Returns the SQL representation for DATE type.
 * @returns {string} SQL representation
 */
DateDataType.prototype.toSql = function toSql() {
  return 'DATETIME';
};

/**
 * Validates a value is a valid date.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
DateDataType.prototype.validate = function validate(value) {
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
DateDataType.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }
  return value;
};

/**
 * Checks if a date value has changed.
 * @param {*} value - The current value
 * @param {*} originalValue - The original value
 * @returns {boolean} True if changed
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
 * @param {Date} date - The date to apply timezone to
 * @param {Object} options - Optional configuration options
 * @returns {Date} Date with timezone applied
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
 * Stringifies a date value for SQL representation.
 * @param {Date} date - The date to stringify
 * @param {Object} options - Optional configuration options
 * @returns {string} Formatted date string
 */
DateDataType.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

/**
 * Creates a DATEONLY data type instance.
 */
function DateOnlyDataType() {
  if (!(this instanceof DateOnlyDataType)) return new DateOnlyDataType();
}

util.inherits(DateOnlyDataType, AbstractDataType);

DateOnlyDataType.prototype.key = DateOnlyDataType.key = 'DATEONLY';

/**
 * Returns the SQL representation for DATEONLY type.
 * @returns {string} SQL representation
 */
DateOnlyDataType.prototype.toSql = function toSql() {
  return 'DATE';
};

/**
 * Stringifies a date value for SQL representation.
 * @param {Date} date - The date to stringify
 * @returns {string} Formatted date string
 */
DateOnlyDataType.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};

/**
 * Sanitizes a date value.
 * @param {*} value - The value to sanitize
 * @param {Object} options - Optional configuration options
 * @returns {*} Sanitized value
 */
DateOnlyDataType.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value;
};

/**
 * Checks if a date value has changed.
 * @param {*} value - The current value
 * @param {*} originalValue - The original value
 * @returns {boolean} True if changed
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
 * Creates an HSTORE data type instance.
 */
function HstoreDataType() {
  if (!(this instanceof HstoreDataType)) return new HstoreDataType();
}

inherits(HstoreDataType, AbstractDataType);

HstoreDataType.prototype.key = HstoreDataType.key = 'HSTORE';

/**
 * Validates a value is a valid hstore object.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
HstoreDataType.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
};

/**
 * Creates a JSON data type instance.
 */
function JsonDataType() {
  if (!(this instanceof JsonDataType)) return new JsonDataType();
}

inherits(JsonDataType, AbstractDataType);

JsonDataType.prototype.key = JsonDataType.key = 'JSON';

/**
 * Validates a value is a valid JSON object.
 * @returns {boolean} True if valid
 */
JsonDataType.prototype.validate = function validate() {
  return true;
};

/**
 * Stringifies a value as JSON.
 * @param {*} value - The value to stringify
 * @returns {string} JSON string
 */
JsonDataType.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

/**
 * Creates a JSONB data type instance.
 */
function JsonbDataType() {
  if (!(this instanceof JsonbDataType)) return new JsonbDataType();
  JsonDataType.call(this);
}

inherits(JsonbDataType, JsonDataType);

JsonbDataType.prototype.key = JsonbDataType.key = 'JSONB';

/**
 * Creates a NOW data type instance.
 */
function NowDataType() {
  if (!(this instanceof NowDataType)) return new NowDataType();
}

inherits(NowDataType, AbstractDataType);

NowDataType.prototype.key = NowDataType.key = 'NOW';

/**
 * Creates a BLOB data type instance.
 * @param {number|string} length - Length specification
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
 * Returns the SQL representation for BLOB type.
 * @returns {string} SQL representation
 */
BlobDataType.prototype.toSql = function toSql() {
  const length = this._length.toLowerCase();
  switch (length) {
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
 * Validates a value is a valid blob.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
BlobDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
};

BlobDataType.prototype.escape = false;

/**
 * Stringifies a blob value for SQL representation.
 * @param {*} value - The value to stringify
 * @returns {string} Hexified blob string
 */
BlobDataType.prototype._stringify = function _stringify(value) {
  if (!Buffer.isBuffer(value)) {
    value = this.toBuffer(value);
  }
  const hex = value.toString('hex');
  return this.hexify(hex);
};

/**
 * Creates a RANGE data type instance.
 * @param {Object|string} subtype - The subtype of the range
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
 * Returns the SQL representation for RANGE type.
 * @returns {string} SQL representation
 */
RangeDataType.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};

/**
 * Returns the cast type for RANGE type.
 * @returns {string} Cast type
 */
RangeDataType.prototype.toCastType = function toCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};

/**
 * Validates a value is a valid range.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
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
 * Creates a UUID data type instance.
 */
function UuidDataType() {
  if (!(this instanceof UuidDataType)) return new UuidDataType();
}

inherits(UuidDataType, AbstractDataType);

UuidDataType.prototype.key = UuidDataType.key = 'UUID';

/**
 * Validates a value is a valid UUID.
 * @param {*} value - The value to validate
 * @param {Object} options - Optional configuration options
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
UuidDataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * Creates a UUIDV1 data type instance.
 */
function UuidV1DataType() {
  if (!(this instanceof UuidV1DataType)) return new UuidV1DataType();
}

inherits(UuidV1DataType, AbstractDataType);

UuidV1DataType.prototype.key = UuidV1DataType.key = 'UUIDV1';

/**
 * Validates a value is a valid UUID.
 * @param {*} value - The value to validate
 * @param {Object} options - Optional configuration options
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
UuidV1DataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

/**
 * Creates a UUIDV4 data type instance.
 */
function UuidV4DataType() {
  if (!(this instanceof UuidV4DataType)) return new UuidV4DataType();
}

inherits(UuidV4DataType, AbstractDataType);

UuidV4DataType.prototype.key = UuidV4DataType.key = 'UUIDV4';

/**
 * Validates a value is a valid UUID v4.
 * @param {*} value - The value to validate
 * @param {Object} options - Optional configuration options
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
UuidV4DataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }
  return true;
};

/**
 * Creates a VIRTUAL data type instance.
 * @param {Function} returnType - The return type
 * @param {string[]} fields - The fields to include
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
 * Creates an ENUM data type instance.
 * @param {string|string[]} values - The enum values
 */
function EnumDataType(value) {
  const options = typeof value === 'object' && !Array.isArray(value) && value || {
    values: Array.prototype.slice.call(arguments).reduce(function reduceValues(result, element) {
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
 * Validates a value is a valid enum value.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
EnumDataType.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }
  return true;
};

/**
 * Creates an ARRAY data type instance.
 * @param {Object|Function} type - The array element type
 */
function ArrayDataType(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ArrayDataType)) return new ArrayDataType(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}

inherits(ArrayDataType, AbstractDataType);

ArrayDataType.prototype.key = ArrayDataType.key = 'ARRAY';

/**
 * Returns the SQL representation for ARRAY type.
 * @returns {string} SQL representation
 */
ArrayDataType.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

/**
 * Validates a value is a valid array.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
ArrayDataType.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }
  return true;
};

/**
 * Checks if an object is an array of a specific type.
 * @param {Object} obj - The object to check
 * @param {Function} type - The type to check against
 * @returns {boolean} True if it's an array of the specified type
 */
ArrayDataType.is = function is(obj, type) {
  return obj instanceof ArrayDataType && obj.type instanceof type;
};

/**
 * Creates a GEOMETRY data type instance.
 * @param {string} type - The geometry type
 * @param {string} srid - The spatial reference ID
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
 * Stringifies a geometry value for SQL representation.
 * @param {*} value - The value to stringify
 * @param {Object} options - Optional configuration options
 * @returns {string} SQL representation
 */
GeometryDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Creates a GEOGRAPHY data type instance.
 * @param {string} type - The geography type
 * @param {string} srid - The spatial reference ID
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
 * Stringifies a geography value for SQL representation.
 * @param {*} value - The value to stringify
 * @param {Object} options - Optional configuration options
 * @returns {string} SQL representation
 */
GeographyDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Creates a CIDR data type instance.
 */
function CidrDataType() {
  if (!(this instanceof CidrDataType)) return new CidrDataType();
}

inherits(CidrDataType, AbstractDataType);

CidrDataType.prototype.key = CidrDataType.key = 'CIDR';

/**
 * Validates a value is a valid CIDR.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
CidrDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }
  return true;
};

/**
 * Creates an INET data type instance.
 */
function InetDataType() {
  if (!(this instanceof InetDataType)) return new InetDataType();
}

inherits(InetDataType, AbstractDataType);

InetDataType.prototype.key = InetDataType.key = 'INET';

/**
 * Validates a value is a valid INET.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
InetDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }
  return true;
};

/**
 * Creates a MACADDR data type instance.
 */
function MacaddrDataType() {
  if (!(this instanceof MacaddrDataType)) return new MacaddrDataType();
}

inherits(MacaddrDataType, AbstractDataType);

MacaddrDataType.prototype.key = MacaddrDataType.key = 'MACADDR';

/**
 * Validates a value is a valid MAC address.
 * @param {*} value - The value to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If validation fails
 */
MacaddrDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
};

/**
 * Sets helper properties on data types.
 * @param {Object} helpers - Object containing helper property names and type arrays
 */
function setHelperProperties(helpers) {
  Object.keys(helpers).forEach(function setHelperProperty(helper) {
    helpers[helper].forEach(function setHelperPropertyType(DataType) {
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

const helpers = {
  BINARY: [StringDataType, CharDataType],
  UNSIGNED: [NumberDataType, TinyIntDataType, SmallIntDataType, MediumIntDataType, IntegerDataType, BigIntDataType, FloatDataType, DoubleDataType, RealDataType, DecimalDataType],
  ZEROFILL: [NumberDataType, TinyIntDataType, SmallIntDataType, MediumIntDataType, IntegerDataType, BigIntDataType, FloatDataType, DoubleDataType, RealDataType, DecimalDataType],
  PRECISION: [DecimalDataType],
  SCALE: [DecimalDataType]
};

setHelperProperties(helpers);

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
 * @property {function(type: DataTypes)} RANGE Range types are data types representing a range of values of some element type.
 * @property {function(type: string, srid: string)} GEOMETRY A column storing Geometry information.
 * @property {function(type: string, srid: string)} GEOGRAPHY A geography datatype represents two dimensional spacial objects.
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

_.each(DataTypes, function setDataTypeTypes(dataType) {
  dataType.types = {};
});

DataTypes.postgres = require('./dialects/postgres/data-types')(DataTypes);
DataTypes.mysql = require('./dialects/mysql/data-types')(DataTypes);
DataTypes.sqlite = require('./dialects/sqlite/data-types')(DataTypes);
DataTypes.mssql = require('./dialects/mssql/data-types')(DataTypes);

module.exports = DataTypes;