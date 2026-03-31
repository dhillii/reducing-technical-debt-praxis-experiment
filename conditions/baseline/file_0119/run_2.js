'use strict';

const util = require('util');
const inherits = require('./utils/inherits');
const _ = require('lodash');
const Wkt = require('terraformer-wkt-parser');
const sequelizeErrors = require('./errors');
const Validator = require('./utils/validator-extras').validator;
const momentTz = require('moment-timezone');
const moment = require('moment');
const Utils = require('./utils');

const warnings = {};

// ============================================================================
// Base Type
// ============================================================================

function ABSTRACT() {}

ABSTRACT.prototype.dialectTypes = '';
ABSTRACT.prototype.toString = function toString(options) {
  return this.toSql(options);
};
ABSTRACT.prototype.toSql = function toSql() {
  return this.key;
};
ABSTRACT.prototype.stringify = function stringify(value, options) {
  return this._stringify ? this._stringify(value, options) : value;
};
ABSTRACT.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};

// ============================================================================
// String Types
// ============================================================================

function createStringType(TypeConstructor, key, sqlTemplate) {
  function StringType(length, binary) {
    const options = typeof length === 'object' && length || {length, binary};
    if (!(this instanceof StringType)) return new StringType(options);
    this.options = options;
    this._binary = options.binary;
    this._length = options.length || 255;
  }
  inherits(StringType, ABSTRACT);
  StringType.prototype.key = StringType.key = key;
  StringType.prototype.toSql = function toSql() {
    return sqlTemplate(this._length, this._binary);
  };
  StringType.prototype.validate = function validate(value) {
    if (Object.prototype.toString.call(value) !== '[object String]') {
      if ((this.options.binary && Buffer.isBuffer(value)) || _.isNumber(value)) {
        return true;
      }
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
    }
    return true;
  };
  Object.defineProperty(StringType.prototype, 'BINARY', {
    get() {
      this._binary = true;
      this.options.binary = true;
      return this;
    }
  });
  return StringType;
}

const STRING = createStringType(STRING, 'STRING', (length, binary) => 
  `VARCHAR(${length})${binary ? ' BINARY' : ''}`
);

const CHAR = createStringType(CHAR, 'CHAR', (length, binary) => 
  `CHAR(${length})${binary ? ' BINARY' : ''}`
);

// ============================================================================
// Text Type
// ============================================================================

function TEXT(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TEXT)) return new TEXT(options);
  this.options = options;
  this._length = options.length || '';
}
inherits(TEXT, ABSTRACT);

TEXT.prototype.key = TEXT.key = 'TEXT';
TEXT.prototype.toSql = function toSql() {
  const lengthMap = {
    'tiny': 'TINYTEXT',
    'medium': 'MEDIUMTEXT',
    'long': 'LONGTEXT'
  };
  return lengthMap[this._length.toLowerCase()] || this.key;
};
TEXT.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

// ============================================================================
// Number Types
// ============================================================================

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
    result += `(${this._length}`;
    if (typeof this._decimals === 'number') {
      result += `,${this._decimals}`;
    }
    result += ')';
  }
  if (this._unsigned) result += ' UNSIGNED';
  if (this._zerofill) result += ' ZEROFILL';
  return result;
};
NUMBER.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(
      util.format('%j is not a valid %s', value, _.toLower(this.key))
    );
  }
  return true;
};
NUMBER.prototype._stringify = function _stringify(number) {
  if (typeof number === 'number' || typeof number === 'boolean' || number === null || number === undefined) {
    return number;
  }
  return typeof number.toString === 'function' ? number.toString() : number;
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

function createIntegerType(TypeConstructor, key) {
  function IntegerType(length) {
    const options = typeof length === 'object' && length || {length};
    if (!(this instanceof IntegerType)) return new IntegerType(options);
    NUMBER.call(this, options);
  }
  inherits(IntegerType, NUMBER);
  IntegerType.prototype.key = IntegerType.key = key;
  IntegerType.prototype.validate = function validate(value) {
    if (!Validator.isInt(String(value))) {
      throw new sequelizeErrors.ValidationError(
        util.format('%j is not a valid %s', value, _.toLower(this.key))
      );
    }
    return true;
  };
  return IntegerType;
}

const INTEGER = createIntegerType(INTEGER, 'INTEGER');
const TINYINT = createIntegerType(TINYINT, 'TINYINT');
const SMALLINT = createIntegerType(SMALLINT, 'SMALLINT');
const MEDIUMINT = createIntegerType(MEDIUMINT, 'MEDIUMINT');
const BIGINT = createIntegerType(BIGINT, 'BIGINT');

function createFloatingType(TypeConstructor, key) {
  function FloatingType(length, decimals) {
    const options = typeof length === 'object' && length || {length, decimals};
    if (!(this instanceof FloatingType)) return new FloatingType(options);
    NUMBER.call(this, options);
  }
  inherits(FloatingType, NUMBER);
  FloatingType.prototype.key = FloatingType.key = key;
  return FloatingType;
}

const FLOAT = createFloatingType(FLOAT, 'FLOAT');
const REAL = createFloatingType(REAL, 'REAL');
const DOUBLE = createFloatingType(DOUBLE, 'DOUBLE PRECISION');

function DECIMAL(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DECIMAL)) return new DECIMAL(options);
  NUMBER.call(this, options);
}
inherits(DECIMAL, NUMBER);

DECIMAL.prototype.key = DECIMAL.key = 'DECIMAL';
DECIMAL.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return `DECIMAL(${[this._precision, this._scale].filter(_.identity).join(',')})`;
  }
  return 'DECIMAL';
};
DECIMAL.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
};

// Setup floating point stringify
[FLOAT, DOUBLE, REAL].forEach(Type => {
  Type.prototype.escape = false;
  Type.prototype._stringify = function _stringify(value) {
    if (isNaN(value)) return "'NaN'";
    if (!isFinite(value)) {
      const sign = value < 0 ? '-' : '';
      return `'${sign}Infinity'`;
    }
    return value;
  };
});

// ============================================================================
// Boolean Type
// ============================================================================

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
BOOLEAN.prototype._sanitize = function _sanitize(value) {
  if (value !== null && value !== undefined) {
    if (Buffer.isBuffer(value) && value.length === 1) {
      value = value[0];
    } else if (_.isString(value)) {
      value = value === 'true' ? true : value === 'false' ? false : value;
    } else if (_.isNumber(value)) {
      value = value === 1 ? true : value === 0 ? false : value;
    }
  }
  return value;
};
BOOLEAN.parse = BOOLEAN.prototype._sanitize;

// ============================================================================
// Time Types
// ============================================================================

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
  if ((!options || !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }
  return value;
};
DATE.prototype._isChanged = function _isChanged(value, originalValue) {
  if (originalValue && !!value && (
    value === originalValue ||
    (value instanceof Date && originalValue instanceof Date && value.getTime() === originalValue.getTime())
  )) {
    return false;
  }
  if (!originalValue && !value && originalValue === value) {
    return false;
  }
  return true;
};
DATE.prototype._applyTimezone = function _applyTimezone(date, options) {
  if (options.timezone) {
    date = momentTz.tz.zone(options.timezone)
      ? momentTz(date).tz(options.timezone)
      : moment(date).utcOffset(options.timezone);
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
DATEONLY.prototype.toSql = function toSql() {
  return 'DATE';
};
DATEONLY.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};
DATEONLY.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value;
};
DATEONLY.prototype._isChanged = function _isChanged(value, originalValue) {
  if (originalValue && !!value && originalValue === value) {
    return false;
  }
  if (!originalValue && !value && originalValue === value) {
    return false;
  }
  return true;
};

// ============================================================================
// JSON Types
// ============================================================================

function HSTORE() {
  if (!(this instanceof HSTORE)) return new HSTORE();
}
inherits(HSTORE, ABSTRACT);

HSTORE.prototype.key = HSTORE.key = 'HSTORE';
HSTORE.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
};

function JSONTYPE() {
  if (!(this instanceof JSONTYPE)) return new JSONTYPE();
}
inherits(JSONTYPE, ABSTRACT);

JSONTYPE.prototype.key = JSONTYPE.key = 'JSON';
JSONTYPE.prototype.validate = function validate() {
  return true;
};
JSONTYPE.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

function JSONB() {
  if (!(this instanceof JSONB)) return new JSONB();
  JSONTYPE.call(this);
}
inherits(JSONB, JSONTYPE);

JSONB.prototype.key = JSONB.key = 'JSONB';

// ============================================================================
// Special Types
// ============================================================================

function NOW() {
  if (!(this instanceof NOW)) return new NOW();
}
inherits(NOW, ABSTRACT);

NOW.prototype.key = NOW.key = 'NOW';

function BLOB(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BLOB)) return new BLOB(options);
  this.options = options;
  this._length = options.length || '';
}
inherits(BLOB, ABSTRACT);

BLOB.prototype.key = BLOB.key = 'BLOB';
BLOB.prototype.toSql = function toSql() {
  const lengthMap = {
    'tiny': 'TINYBLOB',
    'medium': 'MEDIUMBLOB',
    'long': 'LONGBLOB'
  };
  return lengthMap[this._length.toLowerCase()] || this.key;
};
BLOB.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
};
BLOB.prototype.escape = false;
BLOB.prototype._stringify = function _stringify(value) {
  if (!Buffer.isBuffer(value)) {
    value = Array.isArray(value) ? Buffer.from(value) : Buffer.from(value.toString());
  }