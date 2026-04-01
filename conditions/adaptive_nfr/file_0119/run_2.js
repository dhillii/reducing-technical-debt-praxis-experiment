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
 * Base abstract data type class for all Sequelize data types.
 * @constructor
 */
function ABSTRACT() {
  this.dialectTypes = '';
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
 * Lookup table for TEXT length variants to SQL type names.
 * @private
 */
const TEXT_LENGTH_MAP = {
  'tiny': 'TINYTEXT',
  'medium': 'MEDIUMTEXT',
  'long': 'LONGTEXT'
};

function TEXT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TEXT)) return new TEXT(options);
  this.options = options;
  this._length = options.length || '';
}
inherits(TEXT, ABSTRACT);

TEXT.prototype.key = TEXT.key = 'TEXT';

/**
 * Returns SQL type for TEXT, handling length variants.
 * @returns {string} SQL type name
 */
TEXT.prototype.toSql = function toSql() {
  const lengthKey = this._length.toLowerCase();
  return TEXT_LENGTH_MAP[lengthKey] || this.key;
};

TEXT.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }

  return true;
};

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

NUMBER.prototype.validate = function(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};
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

function TINYINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TINYINT)) return new TINYINT(options);
  NUMBER.call(this, options);
}
inherits(TINYINT, INTEGER);

TINYINT.prototype.key = TINYINT.key = 'TINYINT';

function SMALLINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SMALLINT)) return new SMALLINT(options);
  NUMBER.call(this, options);
}
inherits(SMALLINT, INTEGER);

SMALLINT.prototype.key = SMALLINT.key = 'SMALLINT';

function MEDIUMINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MEDIUMINT)) return new MEDIUMINT(options);
  NUMBER.call(this, options);
}
inherits(MEDIUMINT, INTEGER);

MEDIUMINT.prototype.key = MEDIUMINT.key = 'MEDIUMINT';

function BIGINT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BIGINT)) return new BIGINT(options);
  NUMBER.call(this, options);
}
inherits(BIGINT, INTEGER);

BIGINT.prototype.key = BIGINT.key = 'BIGINT';

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

function REAL(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof REAL)) return new REAL(options);
  NUMBER.call(this, options);
}
inherits(REAL, NUMBER);

REAL.prototype.key = REAL.key = 'REAL';

function DOUBLE(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DOUBLE)) return new DOUBLE(options);
  NUMBER.call(this, options);
}
inherits(DOUBLE, NUMBER);

DOUBLE.prototype.key = DOUBLE.key = 'DOUBLE PRECISION';

function DECIMAL(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DECIMAL)) return new DECIMAL(options);
  NUMBER.call(this, options);
}
inherits(DECIMAL, NUMBER);

DECIMAL.prototype.key = DECIMAL.key = 'DECIMAL';
DECIMAL.prototype.toSql = function toSql() {

  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }

  return 'DECIMAL';
};
DECIMAL.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }

  return true;
};

/**
 * Stringifies special floating point values (NaN, Infinity).
 * @private
 * @param {*} value - The value to stringify
 * @returns {*} Stringified special value or original value
 */
function stringifySpecialFloatValue(value) {
  if (isNaN(value)) {
    return "'NaN'";
  } else if (!isFinite(value)) {
    const sign = value < 0 ? '-' : '';
    return "'" + sign + "Infinity'";
  }

  return value;
}

for (const floating of [FLOAT, DOUBLE, REAL]) {
  floating.prototype.escape = false;
  floating.prototype._stringify = function _stringify(value) {
    return stringifySpecialFloatValue(value);
  };
}

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
 * Converts buffer to boolean value.
 * @private
 * @param {Buffer} value - Single byte buffer
 * @returns {boolean|Buffer} Boolean value or original buffer
 */
function bufferToBoolean(value) {
  if (Buffer.isBuffer(value) && value.length === 1) {
    return value[0];
  }
  return value;
}

/**
 * Converts string to boolean value.
 * @private
 * @param {string} value - String representation of boolean
 * @returns {boolean|string} Boolean value or original string
 */
function stringToBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * Converts number to boolean value.
 * @private
 * @param {number} value - Numeric representation of boolean
 * @returns {boolean|number} Boolean value or original number
 */
function numberToBoolean(value) {
  if (value === 1) return true;
  if (value === 0) return false;
  return value;
}

BOOLEAN.prototype._sanitize = function _sanitize(value) {
  if (value !== null && value !== undefined) {
    value = bufferToBoolean(value);

    if (_.isString(value)) {
      value = stringToBoolean(value);
    } else if (_.isNumber(value)) {
      value = numberToBoolean(value);
    }
  }

  return value;
};
BOOLEAN.parse = BOOLEAN.prototype._sanitize;

function TIME() {
  if (!(this instanceof TIME)) return new TIME();
}
inherits(TIME, ABSTRACT);

TIME.prototype.key = TIME.key = 'TIME';
TIME.prototype.toSql = function toSql() {
  return 'TIME';
};

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

DATE.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }

  return value;
};

/**
 * Checks if two date values are equal.
 * @private
 * @param {*} value - Current value
 * @param {*} originalValue - Original value
 * @returns {boolean} True if values differ
 */
function areDatesChanged(value, originalValue) {
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
  return areDatesChanged(value, originalValue);
};

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

DATE.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);

  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

function DATEONLY() {
  if (!(this instanceof DATEONLY)) return new DATEONLY();
}
util.inherits(DATEONLY, ABSTRACT);

DATEONLY.prototype.key = DATEONLY.key = 'DATEONLY';
DATEONLY.prototype.toSql = function() {
  return 'DATE';