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
function StringDataType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof StringDataType)) return new StringDataType(options);

  this.options = options;
  this._binary = options.binary;
  this._length = options.length || 255;
}
inherits(StringDataType, AbstractDataType);

StringDataType.prototype.key = StringDataType.key = 'STRING';
StringDataType.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};
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

// Define a character data type
function CharDataType(length, binary) {
  const options = typeof length === 'object' && length || {length, binary};

  if (!(this instanceof CharDataType)) return new CharDataType(options);
  StringDataType.apply(this, arguments);
}
inherits(CharDataType, StringDataType);

CharDataType.prototype.key = CharDataType.key = 'CHAR';
CharDataType.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + (this._binary ? ' BINARY' : '');
};

// Define a text data type
function TextDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TextDataType)) return new TextDataType(options);
  this.options = options;
  this._length = options.length || '';
}
inherits(TextDataType, AbstractDataType);

TextDataType.prototype.key = TextDataType.key = 'TEXT';
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
TextDataType.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }

  return true;
};

// Define a number data type
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

NumberDataType.prototype.validate = function(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};
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

// Define an integer data type
function IntegerDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof IntegerDataType)) return new IntegerDataType(options);
  NumberDataType.call(this, options);
}
inherits(IntegerDataType, NumberDataType);

IntegerDataType.prototype.key = IntegerDataType.key = 'INTEGER';
IntegerDataType.prototype.validate = function validate(value) {
  if (!Validator.isInt(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid ' + _.toLower(this.key), value));
  }

  return true;
};

// Define a tiny integer data type
function TinyIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof TinyIntDataType)) return new TinyIntDataType(options);
  NumberDataType.call(this, options);
}
inherits(TinyIntDataType, IntegerDataType);

TinyIntDataType.prototype.key = TinyIntDataType.key = 'TINYINT';

// Define a small integer data type
function SmallIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof SmallIntDataType)) return new SmallIntDataType(options);
  NumberDataType.call(this, options);
}
inherits(SmallIntDataType, IntegerDataType);

SmallIntDataType.prototype.key = SmallIntDataType.key = 'SMALLINT';

// Define a medium integer data type
function MediumIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof MediumIntDataType)) return new MediumIntDataType(options);
  NumberDataType.call(this, options);
}
inherits(MediumIntDataType, IntegerDataType);

MediumIntDataType.prototype.key = MediumIntDataType.key = 'MEDIUMINT';

// Define a big integer data type
function BigIntDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BigIntDataType)) return new BigIntDataType(options);
  NumberDataType.call(this, options);
}
inherits(BigIntDataType, IntegerDataType);

BigIntDataType.prototype.key = BigIntDataType.key = 'BIGINT';

// Define a float data type
function FloatDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof FloatDataType)) return new FloatDataType(options);
  NumberDataType.call(this, options);
}
inherits(FloatDataType, NumberDataType);

FloatDataType.prototype.key = FloatDataType.key = 'FLOAT';
FloatDataType.prototype.validate = function validate(value) {
  if (!Validator.isFloat(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid float', value));
  }

  return true;
};

// Define a real data type
function RealDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof RealDataType)) return new RealDataType(options);
  NumberDataType.call(this, options);
}
inherits(RealDataType, NumberDataType);

RealDataType.prototype.key = RealDataType.key = 'REAL';

// Define a double data type
function DoubleDataType(length, decimals) {
  const options = typeof length === 'object' && length || {length, decimals};
  if (!(this instanceof DoubleDataType)) return new DoubleDataType(options);
  NumberDataType.call(this, options);
}
inherits(DoubleDataType, NumberDataType);

DoubleDataType.prototype.key = DoubleDataType.key = 'DOUBLE PRECISION';

// Define a decimal data type
function DecimalDataType(precision, scale) {
  const options = typeof precision === 'object' && precision || {precision, scale};
  if (!(this instanceof DecimalDataType)) return new DecimalDataType(options);
  NumberDataType.call(this, options);
}
inherits(DecimalDataType, NumberDataType);

DecimalDataType.prototype.key = DecimalDataType.key = 'DECIMAL';
DecimalDataType.prototype.toSql = function toSql() {

  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }

  return 'DECIMAL';
};
DecimalDataType.prototype.validate = function validate(value) {
  if (!Validator.isDecimal(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid decimal', value));
  }

  return true;
};

// Define a boolean data type
function BooleanDataType() {
  if (!(this instanceof BooleanDataType)) return new BooleanDataType();
}
inherits(BooleanDataType, AbstractDataType);

BooleanDataType.prototype.key = BooleanDataType.key = 'BOOLEAN';
BooleanDataType.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};
BooleanDataType.prototype.validate = function validate(value) {
  if (!Validator.isBoolean(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid boolean', value));
  }

  return true;
};

BooleanDataType.prototype._sanitize = function _sanitize(value) {
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
BooleanDataType.parse = BooleanDataType.prototype._sanitize;

// Define a time data type
function TimeDataType() {
  if (!(this instanceof TimeDataType)) return new TimeDataType();
}
inherits(TimeDataType, AbstractDataType);

TimeDataType.prototype.key = TimeDataType.key = 'TIME';
TimeDataType.prototype.toSql = function toSql() {
  return 'TIME';
};

// Define a date data type
function DateDataType(length) {
  const options = typeof length === 'object' && length || {length};

  if (!(this instanceof DateDataType)) return new DateDataType(options);

  this.options = options;
  this._length = options.length || '';
}
inherits(DateDataType, AbstractDataType);

DateDataType.prototype.key = DateDataType.key = 'DATE';
DateDataType.prototype.toSql = function toSql() {
  return 'DATETIME';
};
DateDataType.prototype.validate = function validate(value) {
  if (!Validator.isDate(String(value))) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid date', value));
  }

  return true;
};

DateDataType.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !(value instanceof Date) && !!value) {
    return new Date(value);
  }

  return value;
};

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

  // not changed when set to same empty value
  if (!originalValue && !value && originalValue === value) {
    return false;
  }

  return true;
};

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

DateDataType.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);

  // Z here means current timezone, _not_ UTC
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

// Define a date only data type
function DateOnlyDataType() {
  if (!(this instanceof DateOnlyDataType)) return new DateOnlyDataType();
}
util.inherits(DateOnlyDataType, AbstractDataType);

DateOnlyDataType.prototype.key = DateOnlyDataType.key = 'DATEONLY';
DateOnlyDataType.prototype.toSql = function() {
  return 'DATE';
};

DateOnlyDataType.prototype._stringify = function _stringify(date) {
  return moment(date).format('YYYY-MM-DD');
};

DateOnlyDataType.prototype._sanitize = function _sanitize(value, options) {
  if ((!options || options && !options.raw) && !!value) {
    return moment(value).format('YYYY-MM-DD');
  }

  return value;
};

DateOnlyDataType.prototype._isChanged = function _isChanged(value, originalValue) {
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
function HStoreDataType() {
  if (!(this instanceof HStoreDataType)) return new HStoreDataType();
}
inherits(HStoreDataType, AbstractDataType);

HStoreDataType.prototype.key = HStoreDataType.key = 'HSTORE';
HStoreDataType.prototype.validate = function validate(value) {
  if (!_.isPlainObject(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid hstore', value));
  }

  return true;
};

// Define a json data type
function JsonDataType() {
  if (!(this instanceof JsonDataType)) return new JsonDataType();
}
inherits(JsonDataType, AbstractDataType);

JsonDataType.prototype.key = JsonDataType.key = 'JSON';
JsonDataType.prototype.validate = function validate() {
  return true;
};

JsonDataType.prototype._stringify = function _stringify(value) {
  return JSON.stringify(value);
};

// Define a jsonb data type
function JsonbDataType() {
  if (!(this instanceof JsonbDataType)) return new JsonbDataType();
  JsonDataType.call(this);
}
inherits(JsonbDataType, JsonDataType);

JsonbDataType.prototype.key = JsonbDataType.key = 'JSONB';

// Define a now data type
function NowDataType() {
  if (!(this instanceof NowDataType)) return new NowDataType();
}
inherits(NowDataType, AbstractDataType);

NowDataType.prototype.key = NowDataType.key = 'NOW';

// Define a blob data type
function BlobDataType(length) {
  const options = typeof length === 'object' && length || {length};
  if (!(this instanceof BlobDataType)) return new BlobDataType(options);
  this.options = options;
  this._length = options.length || '';
}
inherits(BlobDataType, AbstractDataType);

BlobDataType.prototype.key = BlobDataType.key = 'BLOB';
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

BlobDataType.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

// Define a range data type
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
RangeDataType.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};
RangeDataType.prototype.toCastType = function toCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};
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

// Define a uuid data type
function UuidDataType() {
  if (!(this instanceof UuidDataType)) return new UuidDataType();
}
inherits(UuidDataType, AbstractDataType);

UuidDataType.prototype.key = UuidDataType.key = 'UUID';
UuidDataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

// Define a uuid v1 data type
function UuidV1DataType() {
  if (!(this instanceof UuidV1DataType)) return new UuidV1DataType();
}
inherits(UuidV1DataType, AbstractDataType);

UuidV1DataType.prototype.key = UuidV1DataType.key = 'UUIDV1';
UuidV1DataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuid', value));
  }

  return true;
};

// Define a uuid v4 data type
function UuidV4DataType() {
  if (!(this instanceof UuidV4DataType)) return new UuidV4DataType();
}
inherits(UuidV4DataType, AbstractDataType);

UuidV4DataType.prototype.key = UuidV4DataType.key = 'UUIDV4';
UuidV4DataType.prototype.validate = function validate(value, options) {
  if (!_.isString(value) || !Validator.isUUID(value, 4) && (!options || !options.acceptStrings)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid uuidv4', value));
  }

  return true;
};

// Define a virtual data type
function VirtualDataType(ReturnType, fields) {
  if (!(this instanceof VirtualDataType)) return new VirtualDataType(ReturnType, fields);
  if (typeof ReturnType === 'function') ReturnType = new ReturnType();

  this.returnType = ReturnType;
  this.fields = fields;
}
inherits(VirtualDataType, AbstractDataType);

VirtualDataType.prototype.key = VirtualDataType.key = 'VIRTUAL';

// Define an enum data type
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
EnumDataType.prototype.validate = function validate(value) {
  if (!_.includes(this.values, value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid choice in %j', value, this.values));
  }

  return true;
};

// Define an array data type
function ArrayDataType(type) {
  const options = _.isPlainObject(type) ? type : {type};
  if (!(this instanceof ArrayDataType)) return new ArrayDataType(options);
  this.type = typeof options.type === 'function' ? new options.type() : options.type;
}
inherits(ArrayDataType, AbstractDataType);

ArrayDataType.prototype.key = ArrayDataType.key = 'ARRAY';
ArrayDataType.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};
ArrayDataType.prototype.validate = function validate(value) {
  if (!_.isArray(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid array', value));
  }

  return true;
};
ArrayDataType.is = function is(obj, type) {
  return obj instanceof ArrayDataType && obj.type instanceof type;
};

// Define a geometry data type
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
GeometryDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

// Define a geography data type
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
GeographyDataType.prototype._stringify = function _stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

// Define a cidr data type
function CidrDataType() {
  if (!(this instanceof CidrDataType)) return new CidrDataType();
}
inherits(CidrDataType, AbstractDataType);

CidrDataType.prototype.key = CidrDataType.key = 'CIDR';

CidrDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIPRange(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid CIDR', value));
  }

  return true;
};

// Define an inet data type
function InetDataType() {
  if (!(this instanceof InetDataType)) return new InetDataType();
}
inherits(InetDataType, AbstractDataType);

InetDataType.prototype.key = InetDataType.key = 'INET';

InetDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isIP(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid INET', value));
  }

  return true;
};

// Define a macaddr data type
function MacaddrDataType() {
  if (!(this instanceof MacaddrDataType)) return new MacaddrDataType();
}
inherits(MacaddrDataType, AbstractDataType);

MacaddrDataType.prototype.key = MacaddrDataType.key = 'MACADDR';

MacaddrDataType.prototype.validate = function validate(value) {
  if (!_.isString(value) || !Validator.isMACAddress(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid MACADDR', value));
  }

  return true;
};

// Define helpers for data types
const helpers = {
  BINARY: [StringDataType, CharDataType],
  UNSIGNED: [NumberDataType, TinyIntDataType, SmallIntDataType, MediumIntDataType, IntegerDataType, BigIntDataType, FloatDataType, DoubleDataType, RealDataType, DecimalDataType],
  ZEROFILL: [NumberDataType, TinyIntDataType, SmallIntDataType, MediumIntDataType, IntegerDataType, BigIntDataType, FloatDataType, DoubleDataType, RealDataType, DecimalDataType],
  PRECISION: [DecimalDataType],
  SCALE: [DecimalDataType]
};

// Export the data types
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