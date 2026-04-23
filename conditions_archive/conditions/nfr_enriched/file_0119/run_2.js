* sequelize.define('model', {
 *   column: DataTypes.INTEGER
 * })
 * ```
 * When defining a model you can just as easily pass a string as type, but often using the types defined here is beneficial. For example, using `DataTypes.BLOB`, mean
 * that that column will be returned as an instance of `Buffer` when being fetched by sequelize.
 *
 * To provide a length for the data type, you can invoke it like a function: `INTEGER(2)`
 *
 * Some data types have special properties that can be accessed in order to change the data type.
 * For example, to get an unsigned integer with zerofill you can do `DataTypes.INTEGER.UNSIGNED.ZEROFILL`.
 * The order you access the properties in do not matter, so `DataTypes.INTEGER.ZEROFILL.UNSIGNED` is fine as well.
 *
 * * All number types (`INTEGER`, `BIGINT`, `FLOAT`, `DOUBLE`, `REAL`, `DECIMAL`) expose the properties `UNSIGNED` and `ZEROFILL`
 * * The `CHAR` and `STRING` types expose the `BINARY` property
 *
 *
 * Three of the values provided here (`NOW`, `UUIDV1` and `UUIDV4`) are special default values, that should not be used to define types. Instead they are used as shorthands for
 * defining default values. For example, to get a uuid field with a default value generated following v1 of the UUID standard:
 * ```js`
 * sequelize.define('model',` {
 *   uuid: {
 *     type: DataTypes.UUID,
 *     defaultValue: DataTypes.UUIDV1,
 *     primaryKey: true
 *   }
 * })
 * ```
 * There may be times when you want to generate your own UUID conforming to some other algorithm. This is accomplished
 * using the defaultValue property as well, but instead of specifying one of the supplied UUID types, you return a value
 * from a function.
 * ```js
 * sequelize.define('model', {
 *   uuid: {
 *     type: DataTypes.UUID,
 *     defaultValue: function() {
 *       return generateMyId()
 *     },
 *     primaryKey: true
 *   }
 * })
 * ```
 *
 * @property {function(length=255: integer)} STRING A variable length string
 * @property {function(length=255: integer)} CHAR A fixed length string.
 * @property {function(length: string)} TEXT An unlimited length text column. Available lengths: `tiny`, `medium`, `long`
 * @property {function(length: integer)} TINYINT A 8 bit integer.
 * @property {function(length: integer)} SMALLINT A 16 bit integer.
 * @property {function(length: integer)} MEDIUMINT A 24 bit integer.
 * @property {function(length=255: integer)} INTEGER A 32 bit integer.
 * @property {function(length: integer)} BIGINT A 64 bit integer. Note: an attribute defined as `BIGINT` will be treated like a `string` due this [feature from node-postgres](https://github.com/brianc/node-postgres/pull/353) to prevent precision loss. To have this attribute as a `number`, this is a possible [workaround](https://github.com/sequelize/sequelize/issues/2383#issuecomment-58006083).
 * @property {function(length: integer, decimals: integer)} FLOAT Floating point number (4-byte precision).
 * @property {function(length: integer, decimals: integer)} DOUBLE Floating point number (8-byte precision).
 * @property {function(precision: integer, scale: integer)} DECIMAL Decimal number.
 * @property {function(length: integer, decimals: integer)} REAL Floating point number (4-byte precision).
 * @property {function} BOOLEAN A boolean / tinyint column, depending on dialect
 * @property {function(length: string)} BLOB Binary storage. Available lengths: `tiny`, `medium`, `long`
 * @property {function(values: string[])} ENUM An enumeration. `DataTypes.ENUM('value', 'another value')`.
 * @property {function(length: integer)} DATE A datetime column
 * @property {function} DATEONLY A date only column (no timestamp)
 * @property {function} TIME A time column
 * @property {function} NOW A default value of the current timestamp
 * @property {function} UUID A column storing a unique universal identifier. Use with `UUIDV1` or `UUIDV4` for default values.
 * @property {function} UUIDV1 A default unique universal identifier generated following the UUID v1 standard
 * @property {function} UUIDV4 A default unique universal identifier generated following the UUID v4 standard
 * @property {function} HSTORE A key / value store column. Only available in Postgres.
 * @property {function} JSON A JSON string column. Available in MySQL, Postgres and SQLite
 * @property {function} JSONB A binary storage JSON column. Only available in Postgres.
 * @property {function(type: DataTypes)} ARRAY An array of `type`, e.g. `DataTypes.ARRAY(DataTypes.DECIMAL)`. Only available in Postgres.
 * @property {function(type: DataTypes)} RANGE Range types are data types representing a range of values of some element type (called the range's subtype).
 * Only available in Postgres. See [the Postgres documentation](http://www.postgresql.org/docs/9.4/static/rangetypes.html) for more details
 * @property {function(type: string, srid: string)} GEOMETRY A column storing Geometry information. It is only available in PostgreSQL (with PostGIS) or MySQL.
 * In MySQL, allowable Geometry types are `POINT`, `LINESTRING`, `POLYGON`.
 *
 * GeoJSON is accepted as input and returned as output.
 * In PostGIS, the GeoJSON is parsed using the PostGIS function `ST_GeomFromGeoJSON`.
 * In MySQL it is parsed using the function `GeomFromText`.
 * Therefore, one can just follow the [GeoJSON spec](http://geojson.org/geojson-spec.html) for handling geometry objects.  See the following examples:
 *
 * ```js
 * // Create a new point:
 * const point = { type: 'Point', coordinates: [39.807222,-76.984722]};
 *
 * User.create({username: 'username', geometry: point });
 *
 * // Create a new linestring:
 * const line = { type: 'LineString', 'coordinates': [ [100.0, 0.0], [101.0, 1.0] ] };
 *
 * User.create({username: 'username', geometry: line });
 *
 * // Create a new polygon:
 * const polygon = { type: 'Polygon', coordinates: [
 *                 [ [100.0, 0.0], [101.0, 0.0], [101.0, 1.0],
 *                   [100.0, 1.0], [100.0, 0.0] ]
 *                 ]};
 *
 * User.create({username: 'username', geometry: polygon });

 * // Create a new point with a custom SRID:
 * const point = {
 *   type: 'Point',
 *   coordinates: [39.807222,-76.984722],
 *   crs: { type: 'name', properties: { name: 'EPSG:4326'} }
 * };
 *
 * User.create({username: 'username', geometry: point })
 * ```
 * @property {function(type: string, srid: string)} GEOGRAPHY A geography datatype represents two dimensional spacial objects in an elliptic coord system.
 * @property {function(returnType: DataTypes, fields: string[])} VIRTUAL A virtual value that is not stored in the DB. This could for example be useful if you want to provide a default value in your model that is returned to the user but not stored in the DB.
 *
 * You could also use it to validate a value before permuting and storing it. Checking password length before hashing it for example:
 * ```js
 * sequelize.define('user', {
 *   password_hash: DataTypes.STRING,
 *   password: {
 *     type: DataTypes.VIRTUAL,
 *     set: function (val) {
 *        // Remember to set the data value, otherwise it won't be validated
 *        this.setDataValue('password', val);
 *        this.setDataValue('password_hash', this.salt + val);
 *      },
 *      validate: {
 *         isLongEnough: function (val) {
 *           if (val.length < 7) {
 *             throw new Error("Please choose a longer password")
 *          }
 *       }
 *     }
 *   }
 * })
 * ```
 * In the above code the password is stored plainly in the password field so it can be validated, but is never stored in the DB.
 *
 * VIRTUAL also takes a return type and dependency fields as arguments
 * If a virtual attribute is present in `attributes` it will automatically pull in the extra fields as well.
 * Return type is mostly useful for setups that rely on types like GraphQL.
 * ```js
 * {
 *   active: {
 *     type: new DataTypes.VIRTUAL(DataTypes.BOOLEAN, ['createdAt']),
 *     get: function() {
 *       return this.get('createdAt') > Date.now() - (7 * 24 * 60 * 60 * 1000)
 *     }
 *   }
 * }
 * ```
 */
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