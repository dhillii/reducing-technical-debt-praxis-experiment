```javascript
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
  TypeConstructor.prototype.key = TypeConstructor.key = key;
  TypeConstructor.prototype.toSql = function toSql() {
    return sqlTemplate(this._length, this._binary);
  };
}

function STRING(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};
  if (!(this instanceof STRING)) return new STRING(options);
  this.options = options;
  this._binary = options.binary;
  this._length = options.length || 255;
}
inherits(STRING, ABSTRACT);

createStringType(STRING, 'STRING', (len, binary) => 
  `VARCHAR(${len})${binary ? ' BINARY' : ''}`
);

STRING.prototype.validate = function validate(value) {
  if (Object.prototype.toString.call(value) !== '[object String]') {
    if ((this.options.binary && Buffer.isBuffer(value)) || _.isNumber(value)) {
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

createStringType(CHAR, 'CHAR', (len, binary) => 
  `CHAR(${len})${binary ? ' BINARY' : ''}`
);

// ============================================================================
// Text Types
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
  if (typeof number === 'number' || typeof number === 'boolean' || 
      number === null || number === undefined) {
    return number;
  }
  return typeof number.toString === 'function' ? number.toString() : number;
};

['UNSIGNED', 'ZEROFILL'].forEach(prop => {
  Object.defineProperty(NUMBER.prototype, prop, {
    get() {
      const key = `_${prop.toLowerCase()}`;
      this[key] = true;
      this.options[prop.toLowerCase()] = true;
      return this;
    }
  });
});

// ============================================================================
// Integer Types
// ============================================================================

function createIntegerType(TypeConstructor, key, parentType = NUMBER) {
  return function(length) {
    const options = typeof length === 'object' && length || {length};
    if (!(this instanceof TypeConstructor)) return new TypeConstructor(options);
    parentType.call(this, options);
  };
}

function INTEGER(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof INTEGER)) return new INTEGER(options);
  NUMBER.call(this, options);
}
inherits(INTEGER, NUMBER);

INTEGER.prototype.key = INTEGER.key = 'INTEGER';
INTEGER.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(
      util.format('%j is not a valid %s', value, _.toLower(this.key))
    );
  }
  return true;
};

const integerTypes = [
  {Constructor: TINYINT, key: 'TINYINT'},
  {Constructor: SMALLINT, key: 'SMALLINT'},
  {Constructor: MEDIUMINT, key: 'MEDIUMINT'},
  {Constructor: BIGINT, key: 'BIGINT'}
];

integerTypes.forEach(({Constructor, key}) => {
  function Type(length) {
    const options = typeof length === 'object' && length || {length};
    if (!(this instanceof Type)) return new Type(options);
    NUMBER.call(this, options);
  }
  inherits(Type, INTEGER);
  Type.prototype.key = Type.key = key;
  Constructor.prototype = Type.prototype;
  Constructor.key = key;
  
  // Assign to global scope
  if (key === 'TINYINT') Object.assign(TINYINT, Type);
  else if (key === 'SMALLINT') Object.assign(SMALLINT, Type);
  else if (key === 'MEDIUMINT') Object.assign(MEDIUMINT, Type);
  else if (key === 'BIGINT') Object.assign(BIGINT, Type);
});

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

// ============================================================================
// Floating Point Types
// ============================================================================

function createFloatingType(TypeConstructor, key) {
  return function(length, decimals) {
    const options = typeof length === 'object' && length || {length, decimals};
    if (!(this instanceof TypeConstructor)) return new TypeConstructor(options);
    NUMBER.call(this, options);
  };
}

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

// Apply special stringify to floating types
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

// ============================================================================
// Date/Time Types
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
    (value instanceof Date && originalValue instanceof Date && 
     value.getTime() === originalValue.getTime())
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
util.inherits(DATEONLY,