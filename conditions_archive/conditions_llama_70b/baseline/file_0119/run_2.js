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

class ABSTRACT {
  constructor() {}

  get dialectTypes() {
    return '';
  }

  toString(options) {
    return this.toSql(options);
  }

  toSql() {
    return this.key;
  }

  static warn(link, text) {
    if (!warnings[text]) {
      warnings[text] = true;
      Utils.warn(`${text}, '\n>> Check:', ${link}`);
    }
  }

  stringify(value, options) {
    if (this._stringify) {
      return this._stringify(value, options);
    }
    return value;
  }
}

class STRING extends ABSTRACT {
  constructor(length, binary) {
    super();
    const options = typeof length === 'object' && length || { length, binary };

    this.options = options;
    this._binary = options.binary;
    this._length = options.length || 255;
  }

  get key() {
    return 'STRING';
  }

  toSql() {
    return `VARCHAR(${this._length})${this._binary ? ' BINARY' : ''}`;
  }

  validate(value) {
    if (Object.prototype.toString.call(value) !== '[object String]') {
      if (this.options.binary && Buffer.isBuffer(value) || _.isNumber(value)) {
        return true;
      }
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
    }

    return true;
  }

  get BINARY() {
    this._binary = true;
    this.options.binary = true;
    return this;
  }
}

inherits(STRING, ABSTRACT);

class CHAR extends STRING {
  constructor(length, binary) {
    super(length, binary);
  }

  get key() {
    return 'CHAR';
  }

  toSql() {
    return `CHAR(${this._length})${this._binary ? ' BINARY' : ''}`;
  }
}

inherits(CHAR, STRING);

class TEXT extends ABSTRACT {
  constructor(length) {
    super();
    const options = typeof length === 'object' && length || { length };
    this.options = options;
    this._length = options.length || '';
  }

  get key() {
    return 'TEXT';
  }

  toSql() {
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
  }

  validate(value) {
    if (!_.isString(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
    }

    return true;
  }
}

inherits(TEXT, ABSTRACT);

class NUMBER extends ABSTRACT {
  constructor(options) {
    super();
    this.options = options;
    this._length = options.length;
    this._zerofill = options.zerofill;
    this._decimals = options.decimals;
    this._precision = options.precision;
    this._scale = options.scale;
    this._unsigned = options.unsigned;
  }

  get key() {
    return 'NUMBER';
  }

  toSql() {
    let result = this.key;
    if (this._length) {
      result += `(${this._length}`;
      if (typeof this._decimals === 'number') {
        result += `,${this._decimals}`;
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
  }

  validate(value) {
    if (!Validator.isFloat(String(value))) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
    }

    return true;
  }

  _stringify(number) {
    if (typeof number === 'number' || typeof number === 'boolean' || number === null || number === undefined) {
      return number;
    }

    if (typeof number.toString === 'function') {
      return number.toString();
    }

    return number;
  }

  get UNSIGNED() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }

  get ZEROFILL() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
}

inherits(NUMBER, ABSTRACT);

class INTEGER extends NUMBER {
  constructor(length) {
    super(typeof length === 'object' && length || { length });
  }

  get key() {
    return 'INTEGER';
  }

  validate(value) {
    if (!Validator.isInt(String(value))) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
    }

    return true;
  }
}

inherits(INTEGER, NUMBER);

class TINYINT extends INTEGER {
  constructor(length) {
    super(length);
  }

  get key() {
    return 'TINYINT';
  }
}

inherits(TINYINT, INTEGER);

class SMALLINT extends INTEGER {
  constructor(length) {
    super(length);
  }

  get key() {
    return 'SMALLINT';
  }
}

inherits(SMALLINT, INTEGER);

class MEDIUMINT extends INTEGER {
  constructor(length) {
    super(length);
  }

  get key() {
    return 'MEDIUMINT';
  }
}

inherits(MEDIUMINT, INTEGER);

class BIGINT extends INTEGER {
  constructor(length) {
    super(length);
  }

  get key() {
    return 'BIGINT';
  }
}

inherits(BIGINT, INTEGER);

class FLOAT extends NUMBER {
  constructor(length, decimals) {
    super(typeof length === 'object' && length || { length, decimals });
  }

  get key() {
    return 'FLOAT';
  }

  validate(value) {
    if (!Validator.isFloat(String(value))) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
    }

    return true;
  }
}

inherits(FLOAT, NUMBER);

class REAL extends NUMBER {
  constructor(length, decimals) {
    super(typeof length === 'object' && length || { length, decimals });
  }

  get key() {
    return 'REAL';
  }
}

inherits(REAL, NUMBER);

class DOUBLE extends NUMBER {
  constructor(length, decimals) {
    super(typeof length === 'object' && length || { length, decimals });
  }

  get key() {
    return 'DOUBLE PRECISION';
  }
}

inherits(DOUBLE, NUMBER);

class DECIMAL extends NUMBER {
  constructor(precision, scale) {
    super(typeof precision === 'object' && precision || { precision, scale });
  }

  get key() {
    return 'DECIMAL';
  }

  toSql() {
    if (this._precision || this._scale) {
      return `DECIMAL(${[this._precision, this._scale].filter(_.identity).join(',')})`;
    }

    return 'DECIMAL';
  }

  validate(value) {
    if (!Validator.isDecimal(String(value))) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
    }

    return true;
  }
}

inherits(DECIMAL, NUMBER);

for (const floating of [FLOAT, DOUBLE, REAL]) {
  floating.prototype.escape = false;
  floating.prototype._stringify = function _stringify(value) {
    if (isNaN(value)) {
      return "'NaN'";
    } else if (!isFinite(value)) {
      const sign = value < 0 ? '-' : '';
      return "'" + sign + "Infinity'";
    }

    return value;
  };
}

class BOOLEAN extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'BOOLEAN';
  }

  toSql() {
    return 'TINYINT(1)';
  }

  validate(value) {
    if (!Validator.isBoolean(String(value))) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
    }

    return true;
  }

  _sanitize(value) {
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
  }

  static parse(value) {
    return this.prototype._sanitize(value);
  }
}

inherits(BOOLEAN, ABSTRACT);

class TIME extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'TIME';
  }

  toSql() {
    return 'TIME';
  }
}

inherits(TIME, ABSTRACT);

class DATE extends ABSTRACT {
  constructor(length) {
    super();
    const options = typeof length === 'object' && length || { length };

    this.options = options;
    this._length = options.length || '';
  }

  get key() {
    return 'DATE';
  }

  toSql() {
    return 'DATETIME';
  }

  validate(value) {
    if (!Validator.isDate(String(value))) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
    }

    return true;
  }

  _sanitize(value, options) {
    if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
      return new Date(value);
    }

    return value;
  }

  _isChanged(value, originalValue) {
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
  }

  _applyTimezone(date, options) {
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

  _stringify(date, options) {
    date = this._applyTimezone(date, options);

    // Z here means current timezone, _not_ UTC
    return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
  }
}

inherits(DATE, ABSTRACT);

class DATEONLY extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'DATEONLY';
  }

  toSql() {
    return 'DATE';
  }

  _stringify(date) {
    return moment(date).format('YYYY-MM-DD');
  }

  _sanitize(value, options) {
    if ((!options || options && !options.raw) && !!value) {
      return moment(value).format('YYYY-MM-DD');
    }

    return value;
  }

  _isChanged(value, originalValue) {
    if (originalValue && !!value && originalValue === value) {
      return false;
    }

    // not changed when set to same empty value
    if (!originalValue && !value && originalValue === value) {
      return false;
    }

    return true;
  }
}

inherits(DATEONLY, ABSTRACT);

class HSTORE extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'HSTORE';
  }

  validate(value) {
    if (!_.isPlainObject(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
    }

    return true;
  }
}

inherits(HSTORE, ABSTRACT);

class JSONTYPE extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'JSON';
  }

  validate() {
    return true;
  }

  _stringify(value) {
    return JSON.stringify(value);
  }
}

inherits(JSONTYPE, ABSTRACT);

class JSONB extends JSONTYPE {
  constructor() {
    super();
  }

  get key() {
    return 'JSONB';
  }
}

inherits(JSONB, JSONTYPE);

class NOW extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'NOW';
  }
}

inherits(NOW, ABSTRACT);

class BLOB extends ABSTRACT {
  constructor(length) {
    super();
    const options = typeof length === 'object' && length || { length };

    this.options = options;
    this._length = options.length || '';
  }

  get key() {
    return 'BLOB';
  }

  toSql() {
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
  }

  validate(value) {
    if (!_.isString(value) && !Buffer.isBuffer(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
    }

    return true;
  }

  get escape() {
    return false;
  }

  _stringify(value) {
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

  _hexify(hex) {
    return "X'" + hex + "'";
  }
}

inherits(BLOB, ABSTRACT);

class RANGE extends ABSTRACT {
  constructor(subtype) {
    super();
    const options = _.isPlainObject(subtype) ? subtype : { subtype };

    if (!options.subtype) options.subtype = new INTEGER();

    if (_.isFunction(options.subtype)) {
      options.subtype = new options.subtype();
    }

    this._subtype = options.subtype.key;
    this.options = options;
  }

  get key() {
    return 'RANGE';
  }

  toSql() {
    return pgRangeSubtypes[this._subtype.toLowerCase()];
  }

  toCastType() {
    return pgRangeCastTypes[this._subtype.toLowerCase()];
  }

  validate(value) {
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
}

inherits(RANGE, ABSTRACT);

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

class UUID extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'UUID';
  }

  validate(value, options) {
    if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
    }

    return true;
  }
}

inherits(UUID, ABSTRACT);

class UUIDV1 extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'UUIDV1';
  }

  validate(value, options) {
    if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
    }

    return true;
  }
}

inherits(UUIDV1, ABSTRACT);

class UUIDV4 extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'UUIDV4';
  }

  validate(value, options) {
    if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
    }

    return true;
  }
}

inherits(UUIDV4, ABSTRACT);

class VIRTUAL extends ABSTRACT {
  constructor(ReturnType, fields) {
    super();
    if (typeof ReturnType === 'function') ReturnType = new ReturnType();

    this.returnType = ReturnType;
    this.fields = fields;
  }

  get key() {
    return 'VIRTUAL';
  }
}

inherits(VIRTUAL, ABSTRACT);

class ENUM extends ABSTRACT {
  constructor(value) {
    super();
    const options = typeof value === 'object' && !Array.isArray(value) && value || {
      values: Array.prototype.slice.call(arguments).reduce((result, element) => {
        return result.concat(Array.isArray(element) ? element : [element]);
      }, [])
    };
    this.values = options.values;
    this.options = options;
  }

  get key() {
    return 'ENUM';
  }

  validate(value) {
    if (!_.includes(this.values, value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
    }

    return true;
  }
}

inherits(ENUM, ABSTRACT);

class ARRAY extends ABSTRACT {
  constructor(type) {
    super();
    const options = _.isPlainObject(type) ? type : { type };

    this.type = typeof options.type === 'function' ? new options.type() : options.type;
  }

  get key() {
    return 'ARRAY';
  }

  toSql() {
    return this.type.toSql() + '[]';
  }

  validate(value) {
    if (!_.isArray(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
    }

    return true;
  }

  static is(obj, type) {
    return obj instanceof ARRAY && obj.type instanceof type;
  }
}

inherits(ARRAY, ABSTRACT);

const helpers = {
  BINARY: [STRING, CHAR],
  UNSIGNED: [NUMBER, TINYINT, SMALLINT, MEDIUMINT, INTEGER, BIGINT, FLOAT, DOUBLE, REAL, DECIMAL],
  ZEROFILL: [NUMBER, TINYINT, SMALLINT, MEDIUMINT, INTEGER, BIGINT, FLOAT, DOUBLE, REAL, DECIMAL],
  PRECISION: [DECIMAL],
  SCALE: [DECIMAL]
};

class GEOMETRY extends ABSTRACT {
  constructor(type, srid) {
    super();
    const options = _.isPlainObject(type) ? type : { type, srid };

    this.options = options;
    this.type = options.type;
    this.srid = options.srid;
  }

  get key() {
    return 'GEOMETRY';
  }

  get escape() {
    return false;
  }

  _stringify(value, options) {
    return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
  }
}

inherits(GEOMETRY, ABSTRACT);

class GEOGRAPHY extends ABSTRACT {
  constructor(type, srid) {
    super();
    const options = _.isPlainObject(type) ? type : { type, srid };

    this.options = options;
    this.type = options.type;
    this.srid = options.srid;
  }

  get key() {
    return 'GEOGRAPHY';
  }

  get escape() {
    return false;
  }

  _stringify(value, options) {
    return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
  }
}

inherits(GEOGRAPHY, ABSTRACT);

class CIDR extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'CIDR';
  }

  validate(value) {
    if (!_.isString(value) || !Validator.isIPRange(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
    }

    return true;
  }
}

inherits(CIDR, ABSTRACT);

class INET extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'INET';
  }

  validate(value) {
    if (!_.isString(value) || !Validator.isIP(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
    }

    return true;
  }
}

inherits(INET, ABSTRACT);

class MACADDR extends ABSTRACT {
  constructor() {
    super();
  }

  get key() {
    return 'MACADDR';
  }

  validate(value) {
    if (!_.isString(value) || !Validator.isMACAddress(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
    }

    return true;
  }
}

inherits(MACADDR, ABSTRACT);

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

const DataTypes = {
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