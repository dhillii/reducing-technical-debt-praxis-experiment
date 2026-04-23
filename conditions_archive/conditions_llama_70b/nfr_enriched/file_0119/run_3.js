```javascript
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
 * Abstract data type class.
 */
function AbstractDataType() {}

AbstractDataType.prototype.dialectTypes = '';

/**
 * Converts the data type to a string.
 * @param {object} options - Options for the conversion.
 * @returns {string} The string representation of the data type.
 */
AbstractDataType.prototype.toString = function toString(options) {
  return this.toSql(options);
};

/**
 * Converts the data type to SQL.
 * @returns {string} The SQL representation of the data type.
 */
AbstractDataType.prototype.toSql = function toSql() {
  return this.key;
};

/**
 * Warns about a potential issue.
 * @param {string} link - Link to more information.
 * @param {string} text - Warning text.
 */
AbstractDataType.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};

/**
 * Stringifies a value.
 * @param {*} value - Value to stringify.
 * @param {object} options - Options for the stringification.
 * @returns {*} The stringified value.
 */
AbstractDataType.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};

/**
 * String data type class.
 * @param {number|object} length - Length of the string.
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
 * Converts the string data type to SQL.
 * @returns {string} The SQL representation of the string data type.
 */
StringDataType.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Validates a string value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
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
 * Gets the binary version of the string data type.
 * @returns {StringDataType} The binary version of the string data type.
 */
Object.defineProperty(StringDataType.prototype, 'BINARY', {
  get() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
});

/**
 * Character data type class.
 * @param {number|object} length - Length of the character.
 * @param {boolean} binary - Whether the character is binary.
 */
function CharDataType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof CharDataType)) return new CharDataType(options);
  StringDataType.apply(this, arguments);
}
inherits(CharDataType, StringDataType);

CharDataType.prototype.key = CharDataType.key = 'CHAR';

/**
 * Converts the character data type to SQL.
 * @returns {string} The SQL representation of the character data type.
 */
CharDataType.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Text data type class.
 * @param {string|object} length - Length of the text.
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
 * Converts the text data type to SQL.
 * @returns {string} The SQL representation of the text data type.
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
 * Validates a text value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
TextDataType.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }

  return true;
};

/**
 * Number data type class.
 * @param {object} options - Options for the number data type.
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
 * Converts the number data type to SQL.
 * @returns {string} The SQL representation of the number data type.
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
 * Validates a number value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
NumberDataType.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};

/**
 * Gets the unsigned version of the number data type.
 * @returns {NumberDataType} The unsigned version of the number data type.
 */
Object.defineProperty(NumberDataType.prototype, 'UNSIGNED', {
  get() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }
});

/**
 * Gets the zerofill version of the number data type.
 * @returns {NumberDataType} The zerofill version of the number data type.
 */
Object.defineProperty(NumberDataType.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

/**
 * Integer data type class.
 * @param {number|object} length - Length of the integer.
 */
function IntegerDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof IntegerDataType)) return new IntegerDataType(options);
  NumberDataType.call(this, options);
}
inherits(IntegerDataType, NumberDataType);

IntegerDataType.prototype.key = IntegerDataType.key = 'INTEGER';

/**
 * Validates an integer value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
IntegerDataType.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};

/**
 * Tiny integer data type class.
 * @param {number|object} length - Length of the tiny integer.
 */
function TinyIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TinyIntDataType)) return new TinyIntDataType(options);
  NumberDataType.call(this, options);
}
inherits(TinyIntDataType, IntegerDataType);

TinyIntDataType.prototype.key = TinyIntDataType.key = 'TINYINT';

/**
 * Small integer data type class.
 * @param {number|object} length - Length of the small integer.
 */
function SmallIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SmallIntDataType)) return new SmallIntDataType(options);
  NumberDataType.call(this, options);
}
inherits(SmallIntDataType, IntegerDataType);

SmallIntDataType.prototype.key = SmallIntDataType.key = 'SMALLINT';

/**
 * Medium integer data type class.
 * @param {number|object} length - Length of the medium integer.
 */
function MediumIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MediumIntDataType)) return new MediumIntDataType(options);
  NumberDataType.call(this, options);
}
inherits(MediumIntDataType, IntegerDataType);

MediumIntDataType.prototype.key = MediumIntDataType.key = 'MEDIUMINT';

/**
 * Big integer data type class.
 * @param {number|object} length - Length of the big integer.
 */
function BigIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BigIntDataType)) return new BigIntDataType(options);
  NumberDataType.call(this, options);
}
inherits(BigIntDataType, IntegerDataType);

BigIntDataType.prototype.key = BigIntDataType.key = 'BIGINT';

/**
 * Float data type class.
 * @param {number|object} length - Length of the float.
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
 * Validates a float value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
FloatDataType.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }

  return true;
};

/**
 * Real data type class.
 * @param {number|object} length - Length of the real.
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
 * Double data type class.
 * @param {number|object} length - Length of the double.
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
 * Decimal data type class.
 * @param {number|object} precision - Precision of the decimal.
 * @param {number} scale - Scale of the decimal.
 */
function DecimalDataType(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DecimalDataType)) return new DecimalDataType(options);
  NumberDataType.call(this, options);
}
inherits(DecimalDataType, NumberDataType);

DecimalDataType.prototype.key = DecimalDataType.key = 'DECIMAL';

/**
 * Converts the decimal data type to SQL.
 * @returns {string} The SQL representation of the decimal data type.
 */
DecimalDataType.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }

  return 'DECIMAL';
};

/**
 * Validates a decimal value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
DecimalDataType.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }

  return true;
};

/**
 * Boolean data type class.
 */
function BooleanDataType() {
  if (!(this instanceof BooleanDataType)) return new BooleanDataType();
}
inherits(BooleanDataType, AbstractDataType);

BooleanDataType.prototype.key = BooleanDataType.key = 'BOOLEAN';

/**
 * Converts the boolean data type to SQL.
 * @returns {string} The SQL representation of the boolean data type.
 */
BooleanDataType.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

/**
 * Validates a boolean value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
BooleanDataType.prototype.validate = function validate(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }

  return true;
};

/**
 * Sanitizes a boolean value.
 * @param {*} value - Value to sanitize.
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
 * Time data type class.
 */
function TimeDataType() {
  if (!(this instanceof TimeDataType)) return new TimeDataType();
}
inherits(TimeDataType, AbstractDataType);

TimeDataType.prototype.key = TimeDataType.key = 'TIME';

/**
 * Converts the time data type to SQL.
 * @returns {string} The SQL representation of the time data type.
 */
TimeDataType.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * Date data type class.
 * @param {string|object} length - Length of the date.
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
 * Converts the date data type to SQL.
 * @returns {string} The SQL representation of the date data type.
 */
DateDataType.prototype.toSql = function toSql() {
  return 'DATETIME';
};

/**
 * Validates a date value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
DateDataType.prototype.validate = function validate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }

  return true;
};

/**
 * Sanitizes a date value.
 * @param {*} value - Value to sanitize.
 * @param {object} options - Options for the sanitization.
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
 * @param {*} value - Value to check.
 * @param {*} originalValue - Original value to compare with.
 * @returns {boolean} Whether the value has changed.
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
 * Applies a timezone to a date value.
 * @param {*} date - Date to apply the timezone to.
 * @param {object} options - Options for the timezone application.
 * @returns {*} The date with the timezone applied.
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
 * @param {*} date - Date to stringify.
 * @param {object} options - Options for the stringification.
 * @returns {string} The stringified date.
 */
DateDataType.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);

  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

/**
 * Date only data type class.
 */
function DateOnlyDataType() {
  if (!(this instanceof DateOnlyDataType)) return new DateOnlyDataType();
}
util.inherits(DateOnlyDataType, AbstractDataType);

DateOnlyDataType.prototype.key = DateOnlyDataType.key = 'DATEONLY';

/**
 * Converts the date only data type to SQL.
 * @returns {string} The SQL representation of the date only data type.
 */
DateOnlyDataType.prototype.toSql = function() {
  return 'DATE';
};

/**
 * Stringifies a date only value.
 * @param {*} date - Date to stringify.
 * @returns {string} The stringified date.
 */
DateOnlyDataType.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};

/**
 * Sanitizes a date only value.
 * @param {*} value - Value to sanitize.
 * @param {object} options - Options for the sanitization.
 * @returns {*} The sanitized value.
 */
DateOnlyDataType.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }

  return value;
};

/**
 * Checks if a date only value has changed.
 * @param {*} value - Value to check.
 * @param {*} originalValue - Original value to compare with.
 * @returns {boolean} Whether the value has changed.
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
 * HStore data type class.
 */
function HStoreDataType() {
  if (!(this instanceof HStoreDataType)) return new HStoreDataType();
}
inherits(HStoreDataType, AbstractDataType);

HStoreDataType.prototype.key = HStoreDataType.key = 'HSTORE';

/**
 * Validates an HStore value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
HStoreDataType.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }

  return true;
};

/**
 * JSON data type class.
 */
function JsonDataType() {
  if (!(this instanceof JsonDataType)) return new JsonDataType();
}
inherits(JsonDataType, AbstractDataType);

JsonDataType.prototype.key = JsonDataType.key = 'JSON';

/**
 * Stringifies a JSON value.
 * @param {*} value - Value to stringify.
 * @returns {string} The stringified JSON.
 */
JsonDataType.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

/**
 * JSONB data type class.
 */
function JsonbDataType() {
  if (!(this instanceof JsonbDataType)) return new JsonbDataType();
  JsonDataType.call(this);
}
inherits(JsonbDataType, JsonDataType);

JsonbDataType.prototype.key = JsonbDataType.key = 'JSONB';

/**
 * Now data type class.
 */
function NowDataType() {
  if (!(this instanceof NowDataType)) return new NowDataType();
}
inherits(NowDataType, AbstractDataType);

NowDataType.prototype.key = NowDataType.key = 'NOW';

/**
 * Blob data type class.
 * @param {string|object} length - Length of the blob.
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
 * Converts the blob data type to SQL.
 * @returns {string} The SQL representation of the blob data type.
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
 * Validates a blob value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
BlobDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }

  return true;
};

/**
 * Stringifies a blob value.
 * @param {*} value - Value to stringify.
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
 * @param {string} hex - Hex string to hexify.
 * @returns {string} The hexified blob.
 */
BlobDataType.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

/**
 * Range data type class.
 * @param {object} subtype - Subtype of the range.
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

RangeDataType.prototype.key = RangeDataType.key = 'RANGE';

/**
 * Converts the range data type to SQL.
 * @returns {string} The SQL representation of the range data type.
 */
RangeDataType.prototype.toSql = function toSql() {
  return {
    integer: 'int4range',
    bigint: 'int8range',
    decimal: 'numrange',
    dateonly: 'daterange',
    date: 'tstzrange',
    datenotz: 'tsrange'
  }[this._subtype.toLowerCase()];
};

/**
 * Validates a range value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
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
 * UUID data type class.
 */
function UuidDataType() {
  if (!(this instanceof UuidDataType)) return new UuidDataType();
}
inherits(UuidDataType, AbstractDataType);

UuidDataType.prototype.key = UuidDataType.key = 'UUID';

/**
 * Validates a UUID value.
 * @param {*} value - Value to validate.
 * @param {object} options - Options for the validation.
 * @returns {boolean} Whether the value is valid.
 */
UuidDataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

/**
 * UUIDV1 data type class.
 */
function UuidV1DataType() {
  if (!(this instanceof UuidV1DataType)) return new UuidV1DataType();
}
inherits(UuidV1DataType, AbstractDataType);

UuidV1DataType.prototype.key = UuidV1DataType.key = 'UUIDV1';

/**
 * Validates a UUIDV1 value.
 * @param {*} value - Value to validate.
 * @param {object} options - Options for the validation.
 * @returns {boolean} Whether the value is valid.
 */
UuidV1DataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

/**
 * UUIDV4 data type class.
 */
function UuidV4DataType() {
  if (!(this instanceof UuidV4DataType)) return new UuidV4DataType();
}
inherits(UuidV4DataType, AbstractDataType);

UuidV4DataType.prototype.key = UuidV4DataType.key = 'UUIDV4';

/**
 * Validates a UUIDV4 value.
 * @param {*} value - Value to validate.
 * @param {object} options - Options for the validation.
 * @returns {boolean} Whether the value is valid.
 */
UuidV4DataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }

  return true;
};

/**
 * Virtual data type class.
 * @param {object} returnType - Return type of the virtual data type.
 * @param {string[]} fields - Fields of the virtual data type.
 */
function VirtualDataType(returnType, fields) {
  if (!(this instanceof VirtualDataType)) return new VirtualDataType(returnType, fields);
  if (typeof returnType === 'function') returnType = new returnType();

  this.returnType = returnType;
  this.fields = fields;
}
inherits(VirtualDataType, AbstractDataType);

VirtualDataType.prototype.key = VirtualDataType.key = 'VIRTUAL';

/**
 * Enum data type class.
 * @param {object} value - Value of the enum data type.
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
 * Validates an enum value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
EnumDataType.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }

  return true;
};

/**
 * Array data type class.
 * @param {object} type - Type of the array data type.
 */
function ArrayDataType(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ArrayDataType)) return new ArrayDataType(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}
inherits(ArrayDataType, AbstractDataType);

ArrayDataType.prototype.key = ArrayDataType.key = 'ARRAY';

/**
 * Converts the array data type to SQL.
 * @returns {string} The SQL representation of the array data type.
 */
ArrayDataType.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

/**
 * Validates an array value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
ArrayDataType.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }

  return true;
};

/**
 * Checks if a value is an array of a certain type.
 * @param {*} obj - Value to check.
 * @param {object} type - Type to check against.
 * @returns {boolean} Whether the value is an array of the given type.
 */
ArrayDataType.is = function is(obj, type) {
  return obj instanceof ArrayDataType && obj.type instanceof type;
};

/**
 * Geometry data type class.
 * @param {object} type - Type of the geometry data type.
 * @param {string} srid - SRID of the geometry data type.
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
 * Stringifies a geometry value.
 * @param {*} value - Value to stringify.
 * @param {object} options - Options for the stringification.
 * @returns {string} The stringified geometry.
 */
GeometryDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Geography data type class.
 * @param {object} type - Type of the geography data type.
 * @param {string} srid - SRID of the geography data type.
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
 * Stringifies a geography value.
 * @param {*} value - Value to stringify.
 * @param {object} options - Options for the stringification.
 * @returns {string} The stringified geography.
 */
GeographyDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * CIDR data type class.
 */
function CidrDataType() {
  if (!(this instanceof CidrDataType)) return new CidrDataType();
}
inherits(CidrDataType, AbstractDataType);

CidrDataType.prototype.key = CidrDataType.key = 'CIDR';

/**
 * Validates a CIDR value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
CidrDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }

  return true;
};

/**
 * INET data type class.
 */
function InetDataType() {
  if (!(this instanceof InetDataType)) return new InetDataType();
}
inherits(InetDataType, AbstractDataType);

InetDataType.prototype.key = InetDataType.key = 'INET';

/**
 * Validates an INET value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
InetDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }

  return true;
};

/**
 * MACADDR data type class.
 */
function MacaddrDataType() {
  if (!(this instanceof MacaddrDataType)) return new MacaddrDataType();
}
inherits(MacaddrDataType, AbstractDataType);

MacaddrDataType.prototype.key = MacaddrDataType.key = 'MACADDR';

/**
 * Validates a MACADDR value.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
MacaddrDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }

  return true;
};

const DataTypes = {
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
  HSTORE: HStoreDataType,
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
```