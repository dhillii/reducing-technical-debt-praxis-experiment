```javascript
'use strict';

/*!
 * Module dependencies.
 */

const EventEmitter = require('events').EventEmitter;
const Kareem = require('kareem');
const MongooseError = require('./error/mongooseError');
const SchemaType = require('./schematype');
const SchemaTypeOptions = require('./options/SchemaTypeOptions');
const VirtualOptions = require('./options/VirtualOptions');
const VirtualType = require('./virtualtype');
const addAutoId = require('./helpers/schema/addAutoId');
const arrayParentSymbol = require('./helpers/symbols').arrayParentSymbol;
const get = require('./helpers/get');
const getConstructorName = require('./helpers/getConstructorName');
const getIndexes = require('./helpers/schema/getIndexes');
const merge = require('./helpers/schema/merge');
const mpath = require('mpath');
const readPref = require('./driver').get().ReadPreference;
const setupTimestamps = require('./helpers/timestamps/setupTimestamps');
const util = require('util');
const utils = require('./utils');
const validateRef = require('./helpers/populate/validateRef');

const hasNumericSubpathRegex = /\.\d+(\.|$)/;

let MongooseTypes;

const queryHooks = require('./helpers/query/applyQueryMiddleware').
  middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks').middlewareFunctions;
const hookNames = queryHooks.concat(documentHooks).
  reduce((s, hook) => s.add(hook), new Set());

let id = 0;

/**
 * Schema constructor.
 *
 * ####Example:
 *
 *     const child = new Schema({ name: String });
 *     const schema = new Schema({ name: String, age: Number, children: [child] });
 *     const Tree = mongoose.model('Tree', schema);
 *
 *     // setting schema options
 *     new Schema({ name: String }, { _id: false, autoIndex: false })
 *
 * ####Options:
 *
 * - [autoIndex](/docs/guide.html#autoIndex): bool - defaults to null (which means use the connection's autoIndex option)
 * - [autoCreate](/docs/guide.html#autoCreate): bool - defaults to null (which means use the connection's autoCreate option)
 * - [bufferCommands](/docs/guide.html#bufferCommands): bool - defaults to true
 * - [bufferTimeoutMS](/docs/guide.html#bufferTimeoutMS): number - defaults to 10000 (10 seconds). If `bufferCommands` is enabled, the amount of time Mongoose will wait for connectivity to be restablished before erroring out.
 * - [capped](/docs/guide.html#capped): bool - defaults to false
 * - [collection](/docs/guide.html#collection): string - no default
 * - [discriminatorKey](/docs/guide.html#discriminatorKey): string - defaults to `__t`
 * - [id](/docs/guide.html#id): bool - defaults to true
 * - [_id](/docs/guide.html#_id): bool - defaults to true
 * - [minimize](/docs/guide.html#minimize): bool - controls [document#toObject](#document_Document-toObject) behavior when called manually - defaults to true
 * - [read](/docs/guide.html#read): string
 * - [writeConcern](/docs/guide.html#writeConcern): object - defaults to null, use to override [the MongoDB server's default write concern settings](https://docs.mongodb.com/manual/reference/write-concern/)
 * - [shardKey](/docs/guide.html#shardKey): object - defaults to `null`
 * - [strict](/docs/guide.html#strict): bool - defaults to true
 * - [strictQuery](/docs/guide.html#strictQuery): bool - defaults to false
 * - [toJSON](/docs/guide.html#toJSON) - object - no default
 * - [toObject](/docs/guide.html#toObject) - object - no default
 * - [typeKey](/docs/guide.html#typeKey) - string - defaults to 'type'
 * - [typePojoToMixed](/docs/guide.html#typePojoToMixed) - boolean - defaults to true. Determines whether a type set to a POJO becomes a Mixed path or a Subdocument
 * - [useNestedStrict](/docs/guide.html#useNestedStrict) - boolean - defaults to false
 * - [validateBeforeSave](/docs/guide.html#validateBeforeSave) - bool - defaults to `true`
 * - [versionKey](/docs/guide.html#versionKey): string or object - defaults to "__v"
 * - [optimisticConcurrency](/docs/guide.html#optimisticConcurrency): bool - defaults to false. Set to true to enable [optimistic concurrency](https://thecodebarbarian.com/whats-new-in-mongoose-5-10-optimistic-concurrency.html).
 * - [collation](/docs/guide.html#collation): object - defaults to null (which means use no collation)
 * - [selectPopulatedPaths](/docs/guide.html#selectPopulatedPaths): boolean - defaults to `true`
 * - [skipVersioning](/docs/guide.html#skipVersioning): object - paths to exclude from versioning
 * - [timestamps](/docs/guide.html#timestamps): object or boolean - defaults to `false`. If true, Mongoose adds `createdAt` and `updatedAt` properties to your schema and manages those properties for you.
 * - [storeSubdocValidationError](/docs/guide.html#storeSubdocValidationError): boolean - Defaults to true. If false, Mongoose will wrap validation errors in single nested document subpaths into a single validation error on the single nested subdoc's path.
 *
 * ####Options for Nested Schemas:
 * - `excludeIndexes`: bool - defaults to `false`. If `true`, skip building indexes on this schema's paths.
 *
 * ####Note:
 *
 * _When nesting schemas, (`children` in the example above), always declare the child schema first before passing it into its parent._
 *
 * @param {Object|Schema|Array} [definition] Can be one of: object describing schema paths, or schema to copy, or array of objects and schemas
 * @param {Object} [options]
 * @inherits NodeJS EventEmitter http://nodejs.org/api/events.html#events_class_events_eventemitter
 * @event `init`: Emitted after the schema is compiled into a `Model`.
 * @api public
 */

function Schema(obj, options) {
  if (!(this instanceof Schema)) {
    return new Schema(obj, options);
  }

  this.obj = obj;
  this.paths = {};
  this.aliases = {};
  this.subpaths = {};
  this.virtuals = {};
  this.singleNestedPaths = {};
  this.nested = {};
  this.inherits = {};
  this.callQueue = [];
  this._indexes = [];
  this.methods = {};
  this.methodOptions = {};
  this.statics = {};
  this.tree = {};
  this.query = {};
  this.childSchemas = [];
  this.plugins = [];
  // For internal debugging. Do not use this to try to save a schema in MDB.
  this.$id = ++id;
  this.mapPaths = [];

  this.s = {
    hooks: new Kareem()
  };

  this.options = this.defaultOptions(options);

  // build paths
  if (Array.isArray(obj)) {
    for (const definition of obj) {
      this.add(definition);
    }
  } else if (obj) {
    this.add(obj);
  }

  // check if _id's value is a subdocument (gh-2276)
  const _idSubDoc = obj && obj._id && utils.isObject(obj._id);

  // ensure the documents get an auto _id unless disabled
  const auto_id = !this.paths['_id'] &&
      (!this.options.noId && this.options._id) && !_idSubDoc;

  if (auto_id) {
    addAutoId(this);
  }

  this.setupTimestamp(this.options.timestamps);
}

/**
 * Check if a value is a valid alias option
 * @param {*} alias - The alias value to check
 * @returns {boolean}
 */
function isValidAlias(alias) {
  return typeof alias === 'string';
}

/**
 * Check if options object is null or undefined
 * @param {*} options - The options to check
 * @returns {boolean}
 */
function isNullOrUndefined(options) {
  return options == null;
}

/**
 * Check if a path exists in schema
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function hasPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path exists in subpaths
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function hasPathInSubpaths(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path exists in single nested paths
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function hasPathInSingleNestedPaths(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) &&
    typeof schema.singleNestedPaths[cleanPath] === 'object';
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPath(schema, path) {
  return schema.mapPaths.length > 0 &&
    schema.mapPaths.some(mapPath => {
      const _path = mapPath.path;
      const re = new RegExp('^' + _path.replace(/\.\$\*/g, '\\.[^.]+') + '$');
      return re.test(path);
    });
}

/**
 * Check if a path has a mixed parent
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function hasMixedParent(schema, path) {
  const subpaths = path.split(/\./g);
  let currentPath = '';
  
  for (let i = 0; i < subpaths.length; ++i) {
    currentPath = i > 0 ? currentPath + '.' + subpaths[i] : subpaths[i];
    if (schema.paths.hasOwnProperty(currentPath) &&
        schema.paths[currentPath] instanceof MongooseTypes.Mixed) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPath(schema, path) {
  return schema.paths.hasOwnProperty(path) ||
    schema.subpaths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPath(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is nested
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPath(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpath(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPath(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path has numeric subpath
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function hasNumericSubpath(path) {
  return hasNumericSubpathRegex.test(path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(cleanPath) ||
    schema.subpaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a single nested path
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSingleNestedPathInSchema(schema, cleanPath) {
  return schema.singleNestedPaths.hasOwnProperty(cleanPath) ||
    schema.singleNestedPaths.hasOwnProperty(cleanPath);
}

/**
 * Check if a path is a map path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isMapPathInSchema(schema, path) {
  return isMapPath(schema, path);
}

/**
 * Check if a path is a positional syntax path
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isPositionalSyntaxPath(path) {
  return /\.\d+\.|\.\d+$/.test(path);
}

/**
 * Check if a path is an array filter
 * @param {string} piece - The path piece to check
 * @returns {boolean}
 */
function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/**
 * Check if a path is a real path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isRealPathInSchema(schema, path) {
  return schema.paths.hasOwnProperty(path);
}

/**
 * Check if a path is a virtual path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isVirtualPathInSchema(schema, path) {
  return schema.virtuals.hasOwnProperty(path);
}

/**
 * Check if a path is a nested path
 * @param {Schema} schema - The schema to check
 * @param {string} path - The path to check
 * @returns {boolean}
 */
function isNestedPathInSchema(schema, path) {
  return schema.nested.hasOwnProperty(path);
}

/**
 * Check if a path is a subpath
 * @param {Schema} schema - The schema to check
 * @param {string} cleanPath - The clean path to check
 * @returns {boolean}
 */
function isSubpathInSchema(schema, cleanPath) {
  return schema.subpaths.hasOwnProperty(clean