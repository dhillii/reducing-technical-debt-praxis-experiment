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
function ABSTRACT() {}

ABSTRACT.prototype.dialectTypes = '';

/**
 * Converts the data type to a string.
 * @param {object} options - Options for the conversion.
 * @returns {string} The string representation of the data type.
 */
ABSTRACT.prototype.toString = function toString(options) {
  return this.toSql(options);
};

/**
 * Converts the data type to a SQL string.
 * @returns {string} The SQL representation of the data type.
 */
ABSTRACT.prototype.toSql = function toSql() {
  return this.key;
};

/**
 * Warns about a potential issue.
 * @param {string} link - Link to more information.
 * @param {string} text - Warning text.
 */
ABSTRACT.warn = function warn(link, text) {
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
ABSTRACT.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};

/**
 * Creates a new string data type.
 * @param {number|object} length - Length of the string.
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
 * Converts the string data type to a SQL string.
 * @returns {string} The SQL representation of the string data type.
 */
STRING.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Validates a value for the string data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
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
 * Gets the binary version of the string data type.
 * @returns {STRING} The binary version of the string data type.
 */
Object.defineProperty(STRING.prototype, 'BINARY', {
  get() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
});

/**
 * Creates a new char data type.
 * @param {number|object} length - Length of the char.
 * @param {boolean} binary - Whether the char is binary.
 */
function CHAR(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof CHAR)) return new CHAR(options);
  STRING.apply(this, arguments);
}
inherits(CHAR, STRING);

CHAR.prototype.key = CHAR.key = 'CHAR';

/**
 * Converts the char data type to a SQL string.
 * @returns {string} The SQL representation of the char data type.
 */
CHAR.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

/**
 * Creates a new text data type.
 * @param {string|object} length - Length of the text.
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
 * Converts the text data type to a SQL string.
 * @returns {string} The SQL representation of the text data type.
 */
TEXT.prototype.toSql = function toSql() {
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
 * Validates a value for the text data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
TEXT.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }

  return true;
};

/**
 * Creates a new number data type.
 * @param {object} options - Options for the number data type.
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
 * Converts the number data type to a SQL string.
 * @returns {string} The SQL representation of the number data type.
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
 * Validates a value for the number data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
NUMBER.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};

/**
 * Stringifies a value for the number data type.
 * @param {*} value - Value to stringify.
 * @returns {*} The stringified value.
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
 * Gets the unsigned version of the number data type.
 * @returns {NUMBER} The unsigned version of the number data type.
 */
Object.defineProperty(NUMBER.prototype, 'UNSIGNED', {
  get() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }
});

/**
 * Gets the zerofill version of the number data type.
 * @returns {NUMBER} The zerofill version of the number data type.
 */
Object.defineProperty(NUMBER.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

/**
 * Creates a new integer data type.
 * @param {number|object} length - Length of the integer.
 */
function INTEGER(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof INTEGER)) return new INTEGER(options);
  NUMBER.call(this, options);
}
inherits(INTEGER, NUMBER);

INTEGER.prototype.key = INTEGER.key = 'INTEGER';

/**
 * Validates a value for the integer data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
INTEGER.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};

/**
 * Creates a new tiny int data type.
 * @param {number|object} length - Length of the tiny int.
 */
function TINYINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TINYINT)) return new TINYINT(options);
  NUMBER.call(this, options);
}
inherits(TINYINT, INTEGER);

TINYINT.prototype.key = TINYINT.key = 'TINYINT';

/**
 * Creates a new small int data type.
 * @param {number|object} length - Length of the small int.
 */
function SMALLINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SMALLINT)) return new SMALLINT(options);
  NUMBER.call(this, options);
}
inherits(SMALLINT, INTEGER);

SMALLINT.prototype.key = SMALLINT.key = 'SMALLINT';

/**
 * Creates a new medium int data type.
 * @param {number|object} length - Length of the medium int.
 */
function MEDIUMINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MEDIUMINT)) return new MEDIUMINT(options);
  NUMBER.call(this, options);
}
inherits(MEDIUMINT, INTEGER);

MEDIUMINT.prototype.key = MEDIUMINT.key = 'MEDIUMINT';

/**
 * Creates a new big int data type.
 * @param {number|object} length - Length of the big int.
 */
function BIGINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BIGINT)) return new BIGINT(options);
  NUMBER.call(this, options);
}
inherits(BIGINT, INTEGER);

BIGINT.prototype.key = BIGINT.key = 'BIGINT';

/**
 * Creates a new float data type.
 * @param {number|object} length - Length of the float.
 * @param {number} decimals - Number of decimal places.
 */
function FLOAT(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof FLOAT)) return new FLOAT(options);
  NUMBER.call(this, options);
}
inherits(FLOAT, NUMBER);

FLOAT.prototype.key = FLOAT.key = 'FLOAT';

/**
 * Validates a value for the float data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
FLOAT.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }

  return true;
};

/**
 * Creates a new real data type.
 * @param {number|object} length - Length of the real.
 * @param {number} decimals - Number of decimal places.
 */
function REAL(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof REAL)) return new REAL(options);
  NUMBER.call(this, options);
}
inherits(REAL, NUMBER);

REAL.prototype.key = REAL.key = 'REAL';

/**
 * Creates a new double data type.
 * @param {number|object} length - Length of the double.
 * @param {number} decimals - Number of decimal places.
 */
function DOUBLE(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DOUBLE)) return new DOUBLE(options);
  NUMBER.call(this, options);
}
inherits(DOUBLE, NUMBER);

DOUBLE.prototype.key = DOUBLE.key = 'DOUBLE PRECISION';

/**
 * Creates a new decimal data type.
 * @param {number|object} precision - Precision of the decimal.
 * @param {number} scale - Scale of the decimal.
 */
function DECIMAL(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DECIMAL)) return new DECIMAL(options);
  NUMBER.call(this, options);
}
inherits(DECIMAL, NUMBER);

DECIMAL.prototype.key = DECIMAL.key = 'DECIMAL';

/**
 * Converts the decimal data type to a SQL string.
 * @returns {string} The SQL representation of the decimal data type.
 */
DECIMAL.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }

  return 'DECIMAL';
};

/**
 * Validates a value for the decimal data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
DECIMAL.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }

  return true;
};

/**
 * Creates a new boolean data type.
 */
function BOOLEAN() {
  if (!(this instanceof BOOLEAN)) return new BOOLEAN();
}
inherits(BOOLEAN, ABSTRACT);

BOOLEAN.prototype.key = BOOLEAN.key = 'BOOLEAN';

/**
 * Converts the boolean data type to a SQL string.
 * @returns {string} The SQL representation of the boolean data type.
 */
BOOLEAN.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

/**
 * Validates a value for the boolean data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
BOOLEAN.prototype.validate = function validate(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }

  return true;
};

/**
 * Sanitizes a value for the boolean data type.
 * @param {*} value - Value to sanitize.
 * @returns {*} The sanitized value.
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

/**
 * Parses a value for the boolean data type.
 * @param {*} value - Value to parse.
 * @returns {*} The parsed value.
 */
BOOLEAN.parse = BOOLEAN.prototype._sanitize;

/**
 * Creates a new time data type.
 */
function TIME() {
  if (!(this instanceof TIME)) return new TIME();
}
inherits(TIME, ABSTRACT);

TIME.prototype.key = TIME.key = 'TIME';

/**
 * Converts the time data type to a SQL string.
 * @returns {string} The SQL representation of the time data type.
 */
TIME.prototype.toSql = function toSql() {
  return 'TIME';
};

/**
 * Creates a new date data type.
 * @param {string|object} length - Length of the date.
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
 * Converts the date data type to a SQL string.
 * @returns {string} The SQL representation of the date data type.
 */
DATE.prototype.toSql = function toSql() {
  return 'DATETIME';
};

/**
 * Validates a value for the date data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
DATE.prototype.validate = function validate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }

  return true;
};

/**
 * Sanitizes a value for the date data type.
 * @param {*} value - Value to sanitize.
 * @param {object} options - Options for the sanitization.
 * @returns {*} The sanitized value.
 */
DATE.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }

  return value;
};

/**
 * Checks if a value has changed for the date data type.
 * @param {*} value - Value to check.
 * @param {*} originalValue - Original value to compare with.
 * @returns {boolean} Whether the value has changed.
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
 * Applies a timezone to a date value.
 * @param {Date} date - Date to apply the timezone to.
 * @param {object} options - Options for the timezone application.
 * @returns {Date} The date with the timezone applied.
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
 * Stringifies a value for the date data type.
 * @param {Date} date - Date to stringify.
 * @param {object} options - Options for the stringification.
 * @returns {string} The stringified date.
 */
DATE.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);

  // Z here means current timezone, _not_ UTC
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

/**
 * Creates a new date only data type.
 */
function DATEONLY() {
  if (!(this instanceof DATEONLY)) return new DATEONLY();
}
util.inherits(DATEONLY, ABSTRACT);

DATEONLY.prototype.key = DATEONLY.key = 'DATEONLY';

/**
 * Converts the date only data type to a SQL string.
 * @returns {string} The SQL representation of the date only data type.
 */
DATEONLY.prototype.toSql = function() {
  return 'DATE';
};

/**
 * Stringifies a value for the date only data type.
 * @param {Date} date - Date to stringify.
 * @returns {string} The stringified date.
 */
DATEONLY.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};

/**
 * Sanitizes a value for the date only data type.
 * @param {*} value - Value to sanitize.
 * @param {object} options - Options for the sanitization.
 * @returns {*} The sanitized value.
 */
DATEONLY.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }

  return value;
};

/**
 * Checks if a value has changed for the date only data type.
 * @param {*} value - Value to check.
 * @param {*} originalValue - Original value to compare with.
 * @returns {boolean} Whether the value has changed.
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
 * Creates a new hstore data type.
 */
function HSTORE() {
  if (!(this instanceof HSTORE)) return new HSTORE();
}
inherits(HSTORE, ABSTRACT);

HSTORE.prototype.key = HSTORE.key = 'HSTORE';

/**
 * Validates a value for the hstore data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
HSTORE.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }

  return true;
};

/**
 * Creates a new json type data type.
 */
function JSONTYPE() {
  if (!(this instanceof JSONTYPE)) return new JSONTYPE();
}
inherits(JSONTYPE, ABSTRACT);

JSONTYPE.prototype.key = JSONTYPE.key = 'JSON';

/**
 * Validates a value for the json type data type.
 * @returns {boolean} Whether the value is valid.
 */
JSONTYPE.prototype.validate = function validate() {
  return true;
};

/**
 * Stringifies a value for the json type data type.
 * @param {*} value - Value to stringify.
 * @returns {string} The stringified value.
 */
JSONTYPE.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

/**
 * Creates a new jsonb data type.
 */
function JSONB() {
  if (!(this instanceof JSONB)) return new JSONB();
  JSONTYPE.call(this);
}
inherits(JSONB, JSONTYPE);

JSONB.prototype.key = JSONB.key = 'JSONB';

/**
 * Creates a new now data type.
 */
function NOW() {
  if (!(this instanceof NOW)) return new NOW();
}
inherits(NOW, ABSTRACT);

NOW.prototype.key = NOW.key = 'NOW';

/**
 * Creates a new blob data type.
 * @param {string|object} length - Length of the blob.
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
 * Converts the blob data type to a SQL string.
 * @returns {string} The SQL representation of the blob data type.
 */
BLOB.prototype.toSql = function toSql() {
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
 * Validates a value for the blob data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
BLOB.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }

  return true;
};

/**
 * Stringifies a value for the blob data type.
 * @param {*} value - Value to stringify.
 * @returns {string} The stringified value.
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
 * Hexifies a value for the blob data type.
 * @param {string} hex - Hex string to hexify.
 * @returns {string} The hexified value.
 */
BLOB.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

/**
 * Creates a new range data type.
 * @param {object} subtype - Subtype of the range.
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

RANGE.prototype.key = RANGE.key = 'RANGE';

/**
 * Converts the range data type to a SQL string.
 * @returns {string} The SQL representation of the range data type.
 */
RANGE.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};

/**
 * Gets the cast type for the range data type.
 * @returns {string} The cast type for the range data type.
 */
RANGE.prototype.toCastType = function toCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};

/**
 * Validates a value for the range data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
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
 * Creates a new uuid data type.
 */
function UUID() {
  if (!(this instanceof UUID)) return new UUID();
}
inherits(UUID, ABSTRACT);

UUID.prototype.key = UUID.key = 'UUID';

/**
 * Validates a value for the uuid data type.
 * @param {*} value - Value to validate.
 * @param {object} options - Options for the validation.
 * @returns {boolean} Whether the value is valid.
 */
UUID.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

/**
 * Creates a new uuidv1 data type.
 */
function UUIDV1() {
  if (!(this instanceof UUIDV1)) return new UUIDV1();
}
inherits(UUIDV1, ABSTRACT);

UUIDV1.prototype.key = UUIDV1.key = 'UUIDV1';

/**
 * Validates a value for the uuidv1 data type.
 * @param {*} value - Value to validate.
 * @param {object} options - Options for the validation.
 * @returns {boolean} Whether the value is valid.
 */
UUIDV1.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

/**
 * Creates a new uuidv4 data type.
 */
function UUIDV4() {
  if (!(this instanceof UUIDV4)) return new UUIDV4();
}
inherits(UUIDV4, ABSTRACT);

UUIDV4.prototype.key = UUIDV4.key = 'UUIDV4';

/**
 * Validates a value for the uuidv4 data type.
 * @param {*} value - Value to validate.
 * @param {object} options - Options for the validation.
 * @returns {boolean} Whether the value is valid.
 */
UUIDV4.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }

  return true;
};

/**
 * Creates a new virtual data type.
 * @param {DataTypes} returnType - Return type of the virtual data type.
 * @param {string[]} fields - Fields of the virtual data type.
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
 * Creates a new enum data type.
 * @param {object} value - Value of the enum data type.
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
 * Validates a value for the enum data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
ENUM.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }

  return true;
};

/**
 * Creates a new array data type.
 * @param {DataTypes} type - Type of the array data type.
 */
function ARRAY(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ARRAY)) return new ARRAY(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}
inherits(ARRAY, ABSTRACT);

ARRAY.prototype.key = ARRAY.key = 'ARRAY';

/**
 * Converts the array data type to a SQL string.
 * @returns {string} The SQL representation of the array data type.
 */
ARRAY.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};

/**
 * Validates a value for the array data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
ARRAY.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }

  return true;
};

/**
 * Checks if an object is an instance of the array data type.
 * @param {*} obj - Object to check.
 * @param {DataTypes} type - Type to check against.
 * @returns {boolean} Whether the object is an instance of the array data type.
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
 * Creates a new geometry data type.
 * @param {string} type - Type of the geometry data type.
 * @param {string} srid - SRID of the geometry data type.
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

/**
 * Stringifies a value for the geometry data type.
 * @param {*} value - Value to stringify.
 * @param {object} options - Options for the stringification.
 * @returns {string} The stringified value.
 */
GEOMETRY.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Creates a new geography data type.
 * @param {string} type - Type of the geography data type.
 * @param {string} srid - SRID of the geography data type.
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

/**
 * Stringifies a value for the geography data type.
 * @param {*} value - Value to stringify.
 * @param {object} options - Options for the stringification.
 * @returns {string} The stringified value.
 */
GEOGRAPHY.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

/**
 * Creates a new cidr data type.
 */
function CIDR() {
  if (!(this instanceof CIDR)) return new CIDR();
}
inherits(CIDR, ABSTRACT);

CIDR.prototype.key = CIDR.key = 'CIDR';

/**
 * Validates a value for the cidr data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
CIDR.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }

  return true;
};

/**
 * Creates a new inet data type.
 */
function INET() {
  if (!(this instanceof INET)) return new INET();
}
inherits(INET, ABSTRACT);

INET.prototype.key = INET.key = 'INET';

/**
 * Validates a value for the inet data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
INET.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }

  return true;
};

/**
 * Creates a new macaddr data type.
 */
function MACADDR() {
  if (!(this instanceof MACADDR)) return new MACADDR();
}
inherits(MACADDR, ABSTRACT);

MACADDR.prototype.key = MACADDR.key = 'MACADDR';

/**
 * Validates a value for the macaddr data type.
 * @param {*} value - Value to validate.
 * @returns {boolean} Whether the value is valid.
 */
MACADDR.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }

  return true;
};

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
```