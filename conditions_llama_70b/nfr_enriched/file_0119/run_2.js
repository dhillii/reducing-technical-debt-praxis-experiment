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

// Abstract data type
function AbstractDataType() {}
AbstractDataType.prototype.dialectTypes = '';
AbstractDataType.prototype.toString = function toString(options) {
  return this.toSql(options);
};
AbstractDataType.prototype.toSql = function toSql() {
  return this.key;
};
AbstractDataType.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};
AbstractDataType.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};

// String data type
function StringType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};
  this.options = options;
  this._binary = options.binary;
  this._length = options.length || 255;
}
inherits(StringType, AbstractDataType);
StringType.prototype.key = 'STRING';
StringType.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};
StringType.prototype.validate = function validate(value) {
  if (Object.prototype.toString.call(value) !== '[object String]') {
    if (this.options.binary && Buffer.isBuffer(value) || _.isNumber(value)) {
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

// Char data type
function CharType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};
  StringType.call(this, options);
}
inherits(CharType, StringType);
CharType.prototype.key = 'CHAR';
CharType.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

// Text data type
function TextType(length) {
  const options = typeof length === 'object' && length || {length};
  this.options = options;
  this._length = options.length || '';
}
inherits(TextType, AbstractDataType);
TextType.prototype.key = 'TEXT';
TextType.prototype.toSql = function toSql() {
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
TextType.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }
  return true;
};

// Number data type
function NumberType(options) {
  this.options = options;
  this._length = options.length;
  this._zerofill = options.zerofill;
  this._decimals = options.decimals;
  this._precision = options.precision;
  this._scale = options.scale;
  this._unsigned = options.unsigned;
}
inherits(NumberType, AbstractDataType);
NumberType.prototype.key = 'NUMBER';
NumberType.prototype.toSql = function toSql() {
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
NumberType.prototype.validate = function(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};
NumberType.prototype._stringify = function _stringify(number) {
  if (typeof number === 'number' || typeof number === 'boolean' || number === null || number === undefined) {
    return number;
  }
  if (typeof number.toString === 'function') {
    return number.toString();
  }
  return number;
};
Object.defineProperty(NumberType.prototype, 'UNSIGNED', {
  get() {
    this._unsigned = true;
    this.options.unsigned = true;
    return this;
  }
});
Object.defineProperty(NumberType.prototype, 'ZEROFILL', {
  get() {
    this._zerofill = true;
    this.options.zerofill = true;
    return this;
  }
});

// Integer data type
function IntegerType(length) {
  const options = typeof length === 'object' && length || {length};
  NumberType.call(this, options);
}
inherits(IntegerType, NumberType);
IntegerType.prototype.key = 'INTEGER';
IntegerType.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }
  return true;
};

// TinyInt data type
function TinyIntType(length) {
  const options = typeof length === 'object' && length || {length};
  IntegerType.call(this, options);
}
inherits(TinyIntType, IntegerType);
TinyIntType.prototype.key = 'TINYINT';

// SmallInt data type
function SmallIntType(length) {
  const options = typeof length === 'object' && length || {length};
  IntegerType.call(this, options);
}
inherits(SmallIntType, IntegerType);
SmallIntType.prototype.key = 'SMALLINT';

// MediumInt data type
function MediumIntType(length) {
  const options = typeof length === 'object' && length || {length};
  IntegerType.call(this, options);
}
inherits(MediumIntType, IntegerType);
MediumIntType.prototype.key = 'MEDIUMINT';

// BigInt data type
function BigIntType(length) {
  const options = typeof length === 'object' && length || {length};
  IntegerType.call(this, options);
}
inherits(BigIntType, IntegerType);
BigIntType.prototype.key = 'BIGINT';

// Float data type
function FloatType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  NumberType.call(this, options);
}
inherits(FloatType, NumberType);
FloatType.prototype.key = 'FLOAT';
FloatType.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }
  return true;
};

// Real data type
function RealType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  NumberType.call(this, options);
}
inherits(RealType, NumberType);
RealType.prototype.key = 'REAL';

// Double data type
function DoubleType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  NumberType.call(this, options);
}
inherits(DoubleType, NumberType);
DoubleType.prototype.key = 'DOUBLE PRECISION';

// Decimal data type
function DecimalType(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  NumberType.call(this, options);
}
inherits(DecimalType, NumberType);
DecimalType.prototype.key = 'DECIMAL';
DecimalType.prototype.toSql = function toSql() {
  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }
  return 'DECIMAL';
};
DecimalType.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }
  return true;
};

// Boolean data type
function BooleanType() {}
inherits(BooleanType, AbstractDataType);
BooleanType.prototype.key = 'BOOLEAN';
BooleanType.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};
BooleanType.prototype.validate = function validate(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }
  return true;
};
BooleanType.prototype._sanitize = function _sanitize(value) {
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
BooleanType.parse = BooleanType.prototype._sanitize;

// Time data type
function TimeType() {}
inherits(TimeType, AbstractDataType);
TimeType.prototype.key = 'TIME';
TimeType.prototype.toSql = function toSql() {
  return 'TIME';
};

// Date data type
function DateType(length) {
  const options = typeof length === 'object' && length || {length};
  this.options = options;
  this._length = options.length || '';
}
inherits(DateType, AbstractDataType);
DateType.prototype.key = 'DATE';
DateType.prototype.toSql = function toSql() {
  return 'DATETIME';
};
DateType.prototype.validate = function validate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }
  return true;
};
DateType.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }
  return value;
};
DateType.prototype._isChanged = function _isChanged(value, originalValue) {
  if (originalValue && !!value && (value === originalValue || (value instanceof Date && originalValue instanceof Date && value.getTime() === originalValue.getTime()))) {
    return false;
  }
  if (!originalValue && !value && originalValue === value) {
    return false;
  }
  return true;
};
DateType.prototype._applyTimezone = function _applyTimezone(date, options) {
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
DateType.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

// DateOnly data type
function DateOnlyType() {}
util.inherits(DateOnlyType, AbstractDataType);
DateOnlyType.prototype.key = 'DATEONLY';
DateOnlyType.prototype.toSql = function() {
  return 'DATE';
};
DateOnlyType.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};
DateOnlyType.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value;
};
DateOnlyType.prototype._isChanged = function _isChanged(value, originalValue) {
  if (originalValue && !!value && originalValue === value) {
    return false;
  }
  if (!originalValue && !value && originalValue === value) {
    return false;
  }
  return true;
};

// HStore data type
function HStoreType() {}
inherits(HStoreType, AbstractDataType);
HStoreType.prototype.key = 'HSTORE';
HStoreType.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }
  return true;
};

// JSONType data type
function JSONType() {}
inherits(JSONType, AbstractDataType);
JSONType.prototype.key = 'JSON';
JSONType.prototype.validate = function validate() {
  return true;
};
JSONType.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

// JSONB data type
function JSONBType() {
  JSONType.call(this);
}
inherits(JSONBType, JSONType);
JSONBType.prototype.key = 'JSONB';

// Now data type
function NowType() {}
inherits(NowType, AbstractDataType);
NowType.prototype.key = 'NOW';

// Blob data type
function BlobType(length) {
  const options = typeof length === 'object' && length || {length};
  this.options = options;
  this._length = options.length || '';
}
inherits(BlobType, AbstractDataType);
BlobType.prototype.key = 'BLOB';
BlobType.prototype.toSql = function toSql() {
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
BlobType.prototype.validate = function validate(value) {
  if (!_.isString(value) && !Buffer.isBuffer(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
  }
  return true;
};
BlobType.prototype.escape = false;
BlobType.prototype._stringify = function _stringify(value) {
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
BlobType.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

// Range data type
function RangeType(subtype) {
  const options = _.isPlainObject(subtype) ? subtype : {subtype};
  if (!options.subtype) options.subtype = new IntegerType();
  if (_.isFunction(options.subtype)) {
    options.subtype = new options.subtype();
  }
  this._subtype = options.subtype.key;
  this.options = options;
}
inherits(RangeType, AbstractDataType);
RangeType.prototype.key = 'RANGE';
RangeType.prototype.toSql = function toSql() {
  const pgRangeSubtypes = {
    integer: 'int4range',
    bigint: 'int8range',
    decimal: 'numrange',
    dateonly: 'daterange',
    date: 'tstzrange',
    datenotz: 'tsrange'
  };
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};
RangeType.prototype.toCastType = function toCastType() {
  const pgRangeCastTypes = {
    integer: 'integer',
    bigint: 'bigint',
    decimal: 'numeric',
    dateonly: 'date',
    date: 'timestamptz',
    datenotz: 'timestamp'
  };
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};
RangeType.prototype.validate = function validate(value) {
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

// UUID data type
function UUIDType() {}
inherits(UUIDType, AbstractDataType);
UUIDType.prototype.key = 'UUID';
UUIDType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

// UUIDV1 data type
function UUIDV1Type() {}
inherits(UUIDV1Type, AbstractDataType);
UUIDV1Type.prototype.key = 'UUIDV1';
UUIDV1Type.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }
  return true;
};

// UUIDV4 data type
function UUIDV4Type() {}
inherits(UUIDV4Type, AbstractDataType);
UUIDV4Type.prototype.key = 'UUIDV4';
UUIDV4Type.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }
  return true;
};

// Virtual data type
function VirtualType(ReturnType, fields) {
  if (typeof ReturnType === 'function') ReturnType = new ReturnType();
  this.returnType = ReturnType;
  this.fields = fields;
}
inherits(VirtualType, AbstractDataType);
VirtualType.prototype.key = 'VIRTUAL';

// Enum data type
function EnumType(value) {
  const options = typeof value === 'object' && !Array.isArray(value) && value || {
    values: Array.prototype.slice.call(arguments).reduce((result, element) => {
      return result.concat(Array.isArray(element) ? element : [element]);
    }, [])
  };
  this.values = options.values;
  this.options = options;
}
inherits(EnumType, AbstractDataType);
EnumType.prototype.key = 'ENUM';
EnumType.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }
  return true;
};

// Array data type
function ArrayType(type) {
  const options = _.isPlainObject(type) ? type : {type};
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}
inherits(ArrayType, AbstractDataType);
ArrayType.prototype.key = 'ARRAY';
ArrayType.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};
ArrayType.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }
  return true;
};
ArrayType.is = function is(obj, type) {
  return obj instanceof ArrayType && obj.type instanceof type;
};

// Geometry data type
function GeometryType(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};
  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}
inherits(GeometryType, AbstractDataType);
GeometryType.prototype.key = 'GEOMETRY';
GeometryType.prototype.escape = false;
GeometryType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

// Geography data type
function GeographyType(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};
  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}
inherits(GeographyType, AbstractDataType);
GeographyType.prototype.key = 'GEOGRAPHY';
GeographyType.prototype.escape = false;
GeographyType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

// CIDR data type
function CIDRType() {}
inherits(CIDRType, AbstractDataType);
CIDRType.prototype.key = 'CIDR';
CIDRType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }
  return true;
};

// INET data type
function INETType() {}
inherits(INETType, AbstractDataType);
INETType.prototype.key = 'INET';
INETType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }
  return true;
};

// MACADDR data type
function MACADDRType() {}
inherits(MACADDRType, AbstractDataType);
MACADDRType.prototype.key = 'MACADDR';
MACADDRType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }
  return true;
};

const DataTypes = module.exports = {
  ABSTRACT: AbstractDataType,
  STRING: StringType,
  CHAR: CharType,
  TEXT: TextType,
  NUMBER: NumberType,
  TINYINT: TinyIntType,
  SMALLINT: SmallIntType,
  MEDIUMINT: MediumIntType,
  INTEGER: IntegerType,
  BIGINT: BigIntType,
  FLOAT: FloatType,
  TIME: TimeType,
  DATE: DateType,
  DATEONLY: DateOnlyType,
  BOOLEAN: BooleanType,
  NOW: NowType,
  BLOB: BlobType,
  DECIMAL: DecimalType,
  NUMERIC: DecimalType,
  UUID: UUIDType,
  UUIDV1: UUIDV1Type,
  UUIDV4: UUIDV4Type,
  HSTORE: HStoreType,
  JSON: JSONType,
  JSONB: JSONBType,
  VIRTUAL: VirtualType,
  ARRAY: ArrayType,
  NONE: VirtualType,
  ENUM: EnumType,
  RANGE: RangeType,
  REAL: RealType,
  DOUBLE: DoubleType,
  'DOUBLE PRECISION': DoubleType,
  GEOMETRY: GeometryType,
  GEOGRAPHY: GeographyType,
  CIDR: CIDRType,
  INET: INETType,
  MACADDR: MACADDRType
};

_.each(DataTypes, dataType => {
  dataType.types = {};
});

DataTypes.postgres = require('./dialects/postgres/data-types')(DataTypes);
DataTypes.mysql = require('./dialects/mysql/data-types')(DataTypes);
DataTypes.sqlite = require('./dialects/sqlite/data-types')(DataTypes);
DataTypes.mssql = require('./dialects/mssql/data-types')(DataTypes);

module.exports = DataTypes;