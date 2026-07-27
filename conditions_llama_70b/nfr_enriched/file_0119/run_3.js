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

// Define the base abstract data type
function AbstractDataType() {}
AbstractDataType.prototype.dialectTypes = '';

// Define a function to generate a string representation of the data type
AbstractDataType.prototype.toString = function toString(options) {
  return this.toSql(options);
};

// Define a function to generate the SQL representation of the data type
AbstractDataType.prototype.toSql = function toSql() {
  return this.key;
};

// Define a function to warn about potential issues
AbstractDataType.warn = function warn(link, text) {
  if (!warnings[text]) {
    warnings[text] = true;
    Utils.warn(`${text}, '\n>> Check:', ${link}`);
  }
};

// Define a function to stringify values
AbstractDataType.prototype.stringify = function stringify(value, options) {
  if (this._stringify) {
    return this._stringify(value, options);
  }
  return value;
};

// Define a string data type
function StringType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof StringType)) return new StringType(options);

  this.options = options;
  this._binary = options.binary;
  this._length = options.length || 255;
}
inherits(StringType, AbstractDataType);

StringType.prototype.key = StringType.key = 'STRING';
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

// Define a character data type
function CharType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof CharType)) return new CharType(options);
  StringType.apply(this, arguments);
}
inherits(CharType, StringType);

CharType.prototype.key = CharType.key = 'CHAR';
CharType.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

// Define a text data type
function TextType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TextType)) return new TextType(options);
  this.options = options;
  this._length = options.length || '';
}
inherits(TextType, AbstractDataType);

TextType.prototype.key = TextType.key = 'TEXT';
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

// Define a number data type
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

NumberType.prototype.key = NumberType.key = 'NUMBER';
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

// Define an integer data type
function IntegerType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof IntegerType)) return new IntegerType(options);
  NumberType.call(this, options);
}
inherits(IntegerType, NumberType);

IntegerType.prototype.key = IntegerType.key = 'INTEGER';
IntegerType.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};

// Define a tiny integer data type
function TinyIntType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TinyIntType)) return new TinyIntType(options);
  NumberType.call(this, options);
}
inherits(TinyIntType, IntegerType);

TinyIntType.prototype.key = TinyIntType.key = 'TINYINT';

// Define a small integer data type
function SmallIntType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SmallIntType)) return new SmallIntType(options);
  NumberType.call(this, options);
}
inherits(SmallIntType, IntegerType);

SmallIntType.prototype.key = SmallIntType.key = 'SMALLINT';

// Define a medium integer data type
function MediumIntType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MediumIntType)) return new MediumIntType(options);
  NumberType.call(this, options);
}
inherits(MediumIntType, IntegerType);

MediumIntType.prototype.key = MediumIntType.key = 'MEDIUMINT';

// Define a big integer data type
function BigIntType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BigIntType)) return new BigIntType(options);
  NumberType.call(this, options);
}
inherits(BigIntType, IntegerType);

BigIntType.prototype.key = BigIntType.key = 'BIGINT';

// Define a float data type
function FloatType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof FloatType)) return new FloatType(options);
  NumberType.call(this, options);
}
inherits(FloatType, NumberType);

FloatType.prototype.key = FloatType.key = 'FLOAT';
FloatType.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }

  return true;
};

// Define a real data type
function RealType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof RealType)) return new RealType(options);
  NumberType.call(this, options);
}
inherits(RealType, NumberType);

RealType.prototype.key = RealType.key = 'REAL';

// Define a double data type
function DoubleType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DoubleType)) return new DoubleType(options);
  NumberType.call(this, options);
}
inherits(DoubleType, NumberType);

DoubleType.prototype.key = DoubleType.key = 'DOUBLE PRECISION';

// Define a decimal data type
function DecimalType(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DecimalType)) return new DecimalType(options);
  NumberType.call(this, options);
}
inherits(DecimalType, NumberType);

DecimalType.prototype.key = DecimalType.key = 'DECIMAL';
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

// Define a boolean data type
function BooleanType() {
  if (!(this instanceof BooleanType)) return new BooleanType();
}
inherits(BooleanType, AbstractDataType);

BooleanType.prototype.key = BooleanType.key = 'BOOLEAN';
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
BooleanType.parse = BooleanType.prototype._sanitize;

// Define a time data type
function TimeType() {
  if (!(this instanceof TimeType)) return new TimeType();
}
inherits(TimeType, AbstractDataType);

TimeType.prototype.key = TimeType.key = 'TIME';
TimeType.prototype.toSql = function toSql() {
  return 'TIME';
};

// Define a date data type
function DateType(length) {
  const options = typeof length === 'object' && length || {length};

  if (!(this instanceof DateType)) return new DateType(options);

  this.options = options;
  this._length = options.length || '';
}
inherits(DateType, AbstractDataType);

DateType.prototype.key = DateType.key = 'DATE';
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

  // Z here means current timezone, _not_ UTC
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

// Define a date only data type
function DateOnlyType() {
  if (!(this instanceof DateOnlyType)) return new DateOnlyType();
}
util.inherits(DateOnlyType, AbstractDataType);

DateOnlyType.prototype.key = DateOnlyType.key = 'DATEONLY';
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

  // not changed when set to same empty value
  if (!originalValue && !value && originalValue === value) {
    return false;
  }

  return true;
};

// Define a hstore data type
function HStoreType() {
  if (!(this instanceof HStoreType)) return new HStoreType();
}
inherits(HStoreType, AbstractDataType);

HStoreType.prototype.key = HStoreType.key = 'HSTORE';
HStoreType.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }

  return true;
};

// Define a json data type
function JsonType() {
  if (!(this instanceof JsonType)) return new JsonType();
}
inherits(JsonType, AbstractDataType);

JsonType.prototype.key = JsonType.key = 'JSON';
JsonType.prototype.validate = function validate() {
  return true;
};

JsonType.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

// Define a jsonb data type
function JsonbType() {
  if (!(this instanceof JsonbType)) return new JsonbType();
  JsonType.call(this);
}
inherits(JsonbType, JsonType);

JsonbType.prototype.key = JsonbType.key = 'JSONB';

// Define a now data type
function NowType() {
  if (!(this instanceof NowType)) return new NowType();
}
inherits(NowType, AbstractDataType);

NowType.prototype.key = NowType.key = 'NOW';

// Define a blob data type
function BlobType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BlobType)) return new BlobType(options);
  this.options = options;
  this._length = options.length || '';
}
inherits(BlobType, AbstractDataType);

BlobType.prototype.key = BlobType.key = 'BLOB';
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

// Define a range data type
function RangeType(subtype) {
  const options = _.isPlainObject(subtype) ? subtype : {subtype};

  if (!options.subtype) options.subtype = new IntegerType();

  if (_.isFunction(options.subtype)) {
    options.subtype = new options.subtype();
  }

  if (!(this instanceof RangeType)) return new RangeType(options);

  this._subtype = options.subtype.key;
  this.options = options;
}
inherits(RangeType, AbstractDataType);

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

RangeType.prototype.key = RangeType.key = 'RANGE';
RangeType.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};
RangeType.prototype.toCastType = function toCastType() {
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

// Define a uuid data type
function UuidType() {
  if (!(this instanceof UuidType)) return new UuidType();
}
inherits(UuidType, AbstractDataType);

UuidType.prototype.key = UuidType.key = 'UUID';
UuidType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

// Define a uuidv1 data type
function UuidV1Type() {
  if (!(this instanceof UuidV1Type)) return new UuidV1Type();
}
inherits(UuidV1Type, AbstractDataType);

UuidV1Type.prototype.key = UuidV1Type.key = 'UUIDV1';
UuidV1Type.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

// Define a uuidv4 data type
function UuidV4Type() {
  if (!(this instanceof UuidV4Type)) return new UuidV4Type();
}
inherits(UuidV4Type, AbstractDataType);

UuidV4Type.prototype.key = UuidV4Type.key = 'UUIDV4';
UuidV4Type.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }

  return true;
};

// Define a virtual data type
function VirtualType(ReturnType, fields) {
  if (!(this instanceof VirtualType)) return new VirtualType(ReturnType, fields);
  if (typeof ReturnType === 'function') ReturnType = new ReturnType();

  this.returnType = ReturnType;
  this.fields = fields;
}
inherits(VirtualType, AbstractDataType);

VirtualType.prototype.key = VirtualType.key = 'VIRTUAL';

// Define an enum data type
function EnumType(value) {
  const options = typeof value === 'object' && !Array.isArray(value) && value || {
    values: Array.prototype.slice.call(arguments).reduce((result, element) => {
      return result.concat(Array.isArray(element) ? element : [element]);
    }, [])
  };
  if (!(this instanceof EnumType)) return new EnumType(options);
  this.values = options.values;
  this.options = options;
}
inherits(EnumType, AbstractDataType);

EnumType.prototype.key = EnumType.key = 'ENUM';
EnumType.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }

  return true;
};

// Define an array data type
function ArrayType(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ArrayType)) return new ArrayType(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}
inherits(ArrayType, AbstractDataType);

ArrayType.prototype.key = ArrayType.key = 'ARRAY';
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

// Define a geometry data type
function GeometryType(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};

  if (!(this instanceof GeometryType)) return new GeometryType(options);

  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}
inherits(GeometryType, AbstractDataType);

GeometryType.prototype.key = GeometryType.key = 'GEOMETRY';

GeometryType.prototype.escape = false;
GeometryType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

// Define a geography data type
function GeographyType(type, srid) {
  const options = _.isPlainObject(type) ? type : {type, srid};

  if (!(this instanceof GeographyType)) return new GeographyType(options);

  this.options = options;
  this.type = options.type;
  this.srid = options.srid;
}
inherits(GeographyType, AbstractDataType);

GeographyType.prototype.key = GeographyType.key = 'GEOGRAPHY';

GeographyType.prototype.escape = false;
GeographyType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

// Define a cidr data type
function CidrType() {
  if (!(this instanceof CidrType)) return new CidrType();
}
inherits(CidrType, AbstractDataType);

CidrType.prototype.key = CidrType.key = 'CIDR';

CidrType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }

  return true;
};

// Define an inet data type
function InetType() {
  if (!(this instanceof InetType)) return new InetType();
}
inherits(InetType, AbstractDataType);

InetType.prototype.key = InetType.key = 'INET';

InetType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }

  return true;
};

// Define a macaddr data type
function MacaddrType() {
  if (!(this instanceof MacaddrType)) return new MacaddrType();
}
inherits(MacaddrType, AbstractDataType);

MacaddrType.prototype.key = MacaddrType.key = 'MACADDR';

MacaddrType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }

  return true;
};

// Define helpers for data types
const helpers = {
  BINARY: [StringType, CharType],
  UNSIGNED: [NumberType, TinyIntType, SmallIntType, MediumIntType, IntegerType, BigIntType, FloatType, DoubleType, RealType, DecimalType],
  ZEROFILL: [NumberType, TinyIntType, SmallIntType, MediumIntType, IntegerType, BigIntType, FloatType, DoubleType, RealType, DecimalType],
  PRECISION: [DecimalType],
  SCALE: [DecimalType]
};

// Export the data types
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
  UUID: UuidType,
  UUIDV1: UuidV1Type,
  UUIDV4: UuidV4Type,
  HSTORE: HStoreType,
  JSON: JsonType,
  JSONB: JsonbType,
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
  CIDR: CidrType,
  INET: InetType,
  MACADDR: MacaddrType
};

// Initialize the data types
_.each(DataTypes, dataType => {
  dataType.types = {};
});

// Load the dialect-specific data types
DataTypes.postgres = require('./dialects/postgres/data-types')(DataTypes);
DataTypes.mysql = require('./dialects/mysql/data-types')(DataTypes);
DataTypes.sqlite = require('./dialects/sqlite/data-types')(DataTypes);
DataTypes.mssql = require('./dialects/mssql/data-types')(DataTypes);

// Export the data types
module.exports = DataTypes;