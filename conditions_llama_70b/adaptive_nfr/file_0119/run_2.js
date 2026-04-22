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

// Define an abstract class for data types
class AbstractDataType {
  /**
   * @param {object} options - Options for the data type
   */
  constructor(options) {
    this.options = options;
  }

  /**
   * @returns {string} - The key for the data type
   */
  get key() {
    throw new Error('Must be implemented by subclass');
  }

  /**
   * @param {object} options - Options for the data type
   * @returns {string} - The SQL representation of the data type
   */
  toSql(options) {
    throw new Error('Must be implemented by subclass');
  }

  /**
   * @param {*} value - The value to validate
   * @returns {boolean} - Whether the value is valid
   */
  validate(value) {
    throw new Error('Must be implemented by subclass');
  }

  /**
   * @param {*} value - The value to stringify
   * @param {object} options - Options for the data type
   * @returns {string} - The string representation of the value
   */
  stringify(value, options) {
    if (this._stringify) {
      return this._stringify(value, options);
    }
    return value;
  }

  /**
   * @param {string} link - The link to the warning
   * @param {string} text - The text of the warning
   */
  static warn(link, text) {
    if (!warnings[text]) {
      warnings[text] = true;
      Utils.warn(`${text}, '\n>> Check:', ${link}`);
    }
  }
}

// Define a class for string data types
class StringDataType extends AbstractDataType {
  /**
   * @param {number} length - The length of the string
   * @param {boolean} binary - Whether the string is binary
   */
  constructor(length, binary) {
    super({ length, binary });
    this._length = length || 255;
    this._binary = binary;
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

// Define a class for char data types
class CharDataType extends StringDataType {
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

// Define a class for text data types
class TextDataType extends AbstractDataType {
  /**
   * @param {string} length - The length of the text
   */
  constructor(length) {
    super({ length });
    this._length = length || '';
  }

  get key() {
    return 'TEXT';
  }

  toSql() {
    const lengthMap = {
      tiny: 'TINYTEXT',
      medium: 'MEDIUMTEXT',
      long: 'LONGTEXT',
    };
    return lengthMap[this._length.toLowerCase()] || this.key;
  }

  validate(value) {
    if (!_.isString(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
    }

    return true;
  }
}

// Define a class for number data types
class NumberDataType extends AbstractDataType {
  /**
   * @param {object} options - Options for the number data type
   */
  constructor(options) {
    super(options);
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

// Define a class for integer data types
class IntegerDataType extends NumberDataType {
  constructor(length) {
    super({ length });
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

// Define a class for tiny int data types
class TinyIntDataType extends IntegerDataType {
  constructor(length) {
    super(length);
  }

  get key() {
    return 'TINYINT';
  }
}

// Define a class for small int data types
class SmallIntDataType extends IntegerDataType {
  constructor(length) {
    super(length);
  }

  get key() {
    return 'SMALLINT';
  }
}

// Define a class for medium int data types
class MediumIntDataType extends IntegerDataType {
  constructor(length) {
    super(length);
  }

  get key() {
    return 'MEDIUMINT';
  }
}

// Define a class for big int data types
class BigIntDataType extends IntegerDataType {
  constructor(length) {
    super(length);
  }

  get key() {
    return 'BIGINT';
  }
}

// Define a class for float data types
class FloatDataType extends NumberDataType {
  constructor(length, decimals) {
    super({ length, decimals });
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

  _stringify(value) {
    if (isNaN(value)) {
      return "'NaN'";
    } else if (!isFinite(value)) {
      const sign = value < 0 ? '-' : '';
      return "'" + sign + "Infinity'";
    }

    return value;
  }
}

// Define a class for real data types
class RealDataType extends NumberDataType {
  constructor(length, decimals) {
    super({ length, decimals });
  }

  get key() {
    return 'REAL';
  }
}

// Define a class for double data types
class DoubleDataType extends NumberDataType {
  constructor(length, decimals) {
    super({ length, decimals });
  }

  get key() {
    return 'DOUBLE PRECISION';
  }
}

// Define a class for decimal data types
class DecimalDataType extends NumberDataType {
  constructor(precision, scale) {
    super({ precision, scale });
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

// Define a class for boolean data types
class BooleanDataType extends AbstractDataType {
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
    return new BooleanDataType()._sanitize(value);
  }
}

// Define a class for time data types
class TimeDataType extends AbstractDataType {
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

// Define a class for date data types
class DateDataType extends AbstractDataType {
  /**
   * @param {string} length - The length of the date
   */
  constructor(length) {
    super({ length });
    this._length = length || '';
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

// Define a class for date only data types
class DateOnlyDataType extends AbstractDataType {
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

// Define a class for hstore data types
class HStoreDataType extends AbstractDataType {
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

// Define a class for json data types
class JsonDataType extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'JSON';
  }

  _stringify(value) {
    return JSON.stringify(value);
  }
}

// Define a class for jsonb data types
class JsonbDataType extends JsonDataType {
  constructor() {
    super();
  }

  get key() {
    return 'JSONB';
  }
}

// Define a class for now data types
class NowDataType extends AbstractDataType {
  constructor() {
    super();
  }

  get key() {
    return 'NOW';
  }
}

// Define a class for blob data types
class BlobDataType extends AbstractDataType {
  /**
   * @param {string} length - The length of the blob
   */
  constructor(length) {
    super({ length });
    this._length = length || '';
  }

  get key() {
    return 'BLOB';
  }

  toSql() {
    const lengthMap = {
      tiny: 'TINYBLOB',
      medium: 'MEDIUMBLOB',
      long: 'LONGBLOB',
    };
    return lengthMap[this._length.toLowerCase()] || this.key;
  }

  validate(value) {
    if (!_.isString(value) && !Buffer.isBuffer(value)) {
      throw new sequelizeErrors.ValidationError(util.format('%j is not a valid blob', value));
    }

    return true;
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

// Define a class for range data types
class RangeDataType extends AbstractDataType {
  /**
   * @param {object} options - Options for the range data type
   */
  constructor(options) {
    super(options);
    this._subtype = options.subtype.key;
  }

  get key() {
    return 'RANGE';
  }

  toSql() {
    const pgRangeSubtypes = {
      integer: 'int4range',
      bigint: 'int8range',
      decimal: 'numrange',
      dateonly: 'daterange',
      date: 'tstzrange',
      datenotz: 'tsrange',
    };
    return pgRangeSubtypes[this._subtype.toLowerCase()];
  }

  toCastType() {
    const pgRangeCastTypes = {
      integer: 'integer',
      bigint: 'bigint',
      decimal: 'numeric',
      dateonly: 'date',
      date: 'timestamptz',
      datenotz: 'timestamp',
    };
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

// Define a class for uuid data types
class UuidDataType extends AbstractDataType {
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

// Define a class for uuidv1 data types
class UuidV1DataType extends UuidDataType {
  constructor() {
    super();
  }

  get key() {
    return 'UUIDV1';
  }
}

// Define a class for uuidv4 data types
class UuidV4DataType extends UuidDataType {
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

// Define a class for virtual data types
class VirtualDataType extends AbstractDataType {
  /**
   * @param {AbstractDataType} returnType - The return type of the virtual data type
   * @param {string[]} fields - The fields of the virtual data type
   */
  constructor(returnType, fields) {
    super();
    this.returnType = returnType;
    this.fields = fields;
  }

  get key() {
    return 'VIRTUAL';
  }
}

// Define a class for enum data types
class EnumDataType extends AbstractDataType {
  /**
   * @param {object} options - Options for the enum data type
   */
  constructor(options) {
    super(options);
    this.values = options.values;
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

// Define a class for array data types
class ArrayDataType extends AbstractDataType {
  /**
   * @param {AbstractDataType} type - The type of the array data type
   */
  constructor(type) {
    super();
    this.type = type;
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
    return obj instanceof ArrayDataType && obj.type instanceof type;
  }
}

// Define a class for geometry data types
class GeometryDataType extends AbstractDataType {
  /**
   * @param {object} options - Options for the geometry data type
   */
  constructor(options) {
    super(options);
    this.type = options.type;
    this.srid = options.srid;
  }

  get key() {
    return 'GEOMETRY';
  }

  _stringify(value, options) {
    return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
  }
}

// Define a class for geography data types
class GeographyDataType extends AbstractDataType {
  /**
   * @param {object} options - Options for the geography data type
   */
  constructor(options) {
    super(options);
    this.type = options.type;
    this.srid = options.srid;
  }

  get key() {
    return 'GEOGRAPHY';
  }

  _stringify(value, options) {
    return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
  }
}

// Define a class for cidr data types
class CidrDataType extends AbstractDataType {
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

// Define a class for inet data types
class InetDataType extends AbstractDataType {
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

// Define a class for macaddr data types
class MacaddrDataType extends AbstractDataType {
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

// Create a DataTypes object
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
  MACADDR: MacaddrDataType,
};

// Add types property to each data type
_.each(DataTypes, (dataType) => {
  dataType.types = {};
});

// Export DataTypes
module.exports = DataTypes;
```