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

/*!
 * Create virtual properties with alias field
 */
function aliasFields(schema, paths) {
  paths = paths || Object.keys(schema.paths);
  for (const path of paths) {
    const options = get(schema.paths[path], 'options');
    if (options == null) {
      continue;
    }

    const prop = schema.paths[path].path;
    const alias = options.alias;

    if (!alias) {
      continue;
    }

    if (typeof alias !== 'string') {
      throw new Error('Invalid value for alias option on ' + prop + ', got ' + alias);
    }

    schema.aliases[alias] = prop;

    schema.
      virtual(alias).
      get((function(p) {
        return function() {
          if (typeof this.get === 'function') {
            return this.get(p);
          }
          return this[p];
        };
      })(prop)).
      set((function(p) {
        return function(v) {
          return this.$set(p, v);
        };
      })(prop));
  }
}

/*!
 * Inherit from EventEmitter.
 */
Schema.prototype = Object.create(EventEmitter.prototype);
Schema.prototype.constructor = Schema;
Schema.prototype.instanceOfSchema = true;

/*!
 * ignore
 */

Object.defineProperty(Schema.prototype, '$schemaType', {
  configurable: false,
  enumerable: false,
  writable: true
});

/**
 * Array of child schemas (from document arrays and single nested subdocs)
 * and their corresponding compiled models. Each element of the array is
 * an object with 2 properties: `schema` and `model`.
 *
 * This property is typically only useful for plugin authors and advanced users.
 * You do not need to interact with this property at all to use mongoose.
 *
 * @api public
 * @property childSchemas
 * @memberOf Schema
 * @instance
 */

Object.defineProperty(Schema.prototype, 'childSchemas', {
  configurable: false,
  enumerable: true,
  writable: true
});

/**
 * The original object passed to the schema constructor
 *
 * ####Example:
 *
 *     const schema = new Schema({ a: String }).add({ b: String });
 *     schema.obj; // { a: String }
 *
 * @api public
 * @property obj
 * @memberOf Schema
 * @instance
 */

Schema.prototype.obj;

/**
 * The paths defined on this schema. The keys are the top-level paths
 * in this schema, and the values are instances of the SchemaType class.
 *
 * ####Example:
 *     const schema = new Schema({ name: String }, { _id: false });
 *     schema.paths; // { name: SchemaString { ... } }
 *
 *     schema.add({ age: Number });
 *     schema.paths; // { name: SchemaString { ... }, age: SchemaNumber { ... } }
 *
 * @api public
 * @property paths
 * @memberOf Schema
 * @instance
 */

Schema.prototype.paths;

/**
 * Schema as a tree
 *
 * ####Example:
 *     {
 *         '_id'     : ObjectId
 *       , 'nested'  : {
 *             'key' : String
 *         }
 *     }
 *
 * @api private
 * @property tree
 * @memberOf Schema
 * @instance
 */

Schema.prototype.tree;

/**
 * Returns a deep copy of the schema
 *
 * ####Example:
 *
 *     const schema = new Schema({ name: String });
 *     const clone = schema.clone();
 *     clone === schema; // false
 *     clone.path('name'); // SchemaString { ... }
 *
 * @return {Schema} the cloned schema
 * @api public
 * @memberOf Schema
 * @instance
 */

Schema.prototype.clone = function() {
  const Constructor = this.base == null ? Schema : this.base.Schema;

  const s = new Constructor({}, this._userProvidedOptions);
  s.base = this.base;
  s.obj = this.obj;
  s.options = utils.clone(this.options);
  s.callQueue = this.callQueue.map(function(f) { return f; });
  s.methods = utils.clone(this.methods);
  s.methodOptions = utils.clone(this.methodOptions);
  s.statics = utils.clone(this.statics);
  s.query = utils.clone(this.query);
  s.plugins = Array.prototype.slice.call(this.plugins);
  s._indexes = utils.clone(this._indexes);
  s.s.hooks = this.s.hooks.clone();

  s.tree = utils.clone(this.tree);
  s.paths = utils.clone(this.paths);
  s.nested = utils.clone(this.nested);
  s.subpaths = utils.clone(this.subpaths);
  s.singleNestedPaths = utils.clone(this.singleNestedPaths);
  s.childSchemas = gatherChildSchemas(s);

  s.virtuals = utils.clone(this.virtuals);
  s.$globalPluginsApplied = this.$globalPluginsApplied;
  s.$isRootDiscriminator = this.$isRootDiscriminator;
  s.$implicitlyCreated = this.$implicitlyCreated;
  s.mapPaths = [].concat(this.mapPaths);

  if (this.discriminatorMapping != null) {
    s.discriminatorMapping = Object.assign({}, this.discriminatorMapping);
  }
  if (this.discriminators != null) {
    s.discriminators = Object.assign({}, this.discriminators);
  }

  s.aliases = Object.assign({}, this.aliases);

  // Bubble up `init` for backwards compat
  s.on('init', v => this.emit('init', v));

  return s;
};

/**
 * Returns a new schema that has the picked `paths` from this schema.
 *
 * This method is analagous to [Lodash's `pick()` function](https://lodash.com/docs/4.17.15#pick) for Mongoose schemas.
 *
 * ####Example:
 *
 *     const schema = Schema({ name: String, age: Number });
 *     // Creates a new schema with the same `name` path as `schema`,
 *     // but no `age` path.
 *     const newSchema = schema.pick(['name']);
 *
 *     newSchema.path('name'); // SchemaString { ... }
 *     newSchema.path('age'); // undefined
 *
 * @param {Array} paths list of paths to pick
 * @param {Object} [options] options to pass to the schema constructor. Defaults to `this.options` if not set.
 * @return {Schema}
 * @api public
 */

Schema.prototype.pick = function(paths, options) {
  const newSchema = new Schema({}, options || this.options);
  if (!Array.isArray(paths)) {
    throw new MongooseError('Schema#pick() only accepts an array argument, ' +
      'got "' + typeof paths + '"');
  }

  for (const path of paths) {
    if (this.nested[path]) {
      newSchema.add({ [path]: get(this.tree, path) });
    } else {
      const schematype = this.path(path);
      if (schematype == null) {
        throw new MongooseError('Path `' + path + '` is not in the schema');
      }
      newSchema.add({ [path]: schematype });
    }
  }

  return newSchema;
};

/**
 * Returns default options for this schema, merged with `options`.
 *
 * @param {Object} options
 * @return {Object}
 * @api private
 */

Schema.prototype.defaultOptions = function(options) {
  if (options && options.safe === false) {
    options.safe = { w: 0 };
  }

  if (options && options.safe && options.safe.w === 0) {
    // if you turn off safe writes, then versioning goes off as well
    options.versionKey = false;
  }

  this._userProvidedOptions = options == null ? {} : utils.clone(options);

  const baseOptions = get(this, 'base.options', {});
  options = utils.options({
    strict: 'strict' in baseOptions ? baseOptions.strict : true,
    strictQuery: 'strictQuery' in baseOptions ? baseOptions.strictQuery : false,
    bufferCommands: true,
    capped: false, // { size, max, autoIndexId }
    versionKey: '__v',
    optimisticConcurrency: false,
    discriminatorKey: '__t',
    minimize: true,
    autoIndex: null,
    shardKey: null,
    read: null,
    validateBeforeSave: true,
    // the following are only applied at construction time
    noId: false, // deprecated, use { _id: false }
    _id: true,
    noVirtualId: false, // deprecated, use { id: false }
    id: true,
    typeKey: 'type',
    typePojoToMixed: 'typePojoToMixed' in baseOptions ? baseOptions.typePojoToMixed : true
  }, utils.clone(options));

  if (options.read) {
    options.read = readPref(options.read);
  }

  if (options.optimisticConcurrency && !options.versionKey) {
    throw new MongooseError('Must set `versionKey` if using `optimisticConcurrency`');
  }

  return options;
};

/**
 * Adds key path / schema type pairs to this schema.
 *
 * ####Example:
 *
 *     const ToySchema = new Schema();
 *     ToySchema.add({ name: 'string', color: 'string', price: 'number' });
 *
 *     const TurboManSchema = new Schema();
 *     // You can also `add()` another schema and copy over all paths, virtuals,
 *     // getters, setters, indexes, methods, and statics.
 *     TurboManSchema.add(ToySchema).add({ year: Number });
 *
 * @param {Object|Schema} obj plain object with paths to add, or another schema
 * @param {String} [prefix] path to prefix the newly added paths with
 * @return {Schema} the Schema instance
 * @api public
 */

Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  // Special case: setting top-level `_id` to false should convert to disabling
  // the `_id` option. This behavior never worked before 5.4.11 but numerous
  // codebases use it (see gh-7516, gh-7512).
  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';
  // avoid prototype pollution
  if (prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.') {
    return this;
  }

  const keys = Object.keys(obj);

  for (const key of keys) {
    if (utils.specialProperties.has(key)) {
      continue;
    }

    const fullPath = prefix + key;

    if (obj[key] == null) {
      throw new TypeError('Invalid value for schema path `' + fullPath +
        '`, got value "' + obj[key] + '"');
    }
    // Retain `_id: false` but don't set it as a path, re: gh-8274.
    if (key === '_id' && obj[key] === false) {
      continue;
    }
    if (obj[key] instanceof VirtualType || get(obj[key], 'constructor.name', null) === 'VirtualType') {
      this.virtual(obj[key]);
      continue;
    }

    if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    this._addPathToSchema(key, fullPath, obj, prefix);
  }

  const addedKeys = Object.keys(obj).
    map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

/**
 * Internal helper to add a path to the schema.
 * @private
 */
Schema.prototype._addPathToSchema = function(key, fullPath, obj, prefix) {
  if (this._isNonPojoPath(obj[key])) {
    this._handleNonPojoPath(key, fullPath, obj, prefix);
  } else if (this._isEmptyObjectPath(obj[key])) {
    this._handleEmptyObjectPath(key, fullPath, obj, prefix);
  } else if (this._isNestedObjectPath(obj[key])) {
    this._handleNestedObjectPath(key, fullPath, obj, prefix);
  } else {
    this._handleTypeKeyPath(key, fullPath, obj, prefix);
  }
};

/**
 * Check if path is non-POJO (SchemaType, Schema instance, etc).
 * @private
 */
Schema.prototype._isNonPojoPath = function(value) {
  return !(utils.isPOJO(value) || value instanceof SchemaTypeOptions);
};

/**
 * Check if path is empty object.
 * @private
 */
Schema.prototype._isEmptyObjectPath = function(value) {
  return utils.isPOJO(value) && Object.keys(value).length < 1;
};

/**
 * Check if path is nested object without type key.
 * @private
 */
Schema.prototype._isNestedObjectPath = function(value) {
  if (!utils.isPOJO(value) && !(value instanceof SchemaTypeOptions)) {
    return false;
  }
  return !value[this.options.typeKey] || (this.options.typeKey === 'type' && value.type.type);
};

/**
 * Handle non-POJO path addition.
 * @private
 */
Schema.prototype._handleNonPojoPath = function(key, fullPath, obj, prefix) {
  if (prefix) {
    this.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  this.path(prefix + key, obj[key]);
};

/**
 * Handle empty object path addition.
 * @private
 */
Schema.prototype._handleEmptyObjectPath = function(key, fullPath, obj, prefix) {
  if (prefix) {
    this.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  this.path(fullPath, obj[key]); // mixed type
};

/**
 * Handle nested object path addition.
 * @private
 */
Schema.prototype._handleNestedObjectPath = function(key, fullPath, obj, prefix) {
  this.nested[fullPath] = true;
  this.add(obj[key], fullPath + '.');
};

/**
 * Handle type key path addition.
 * @private
 */
Schema.prototype._handleTypeKeyPath = function(key, fullPath, obj, prefix) {
  if (!this.options.typePojoToMixed && utils.isPOJO(obj[key][this.options.typeKey])) {
    this._handlePojoTypeKey(key, fullPath, obj, prefix);
  } else {
    this._handleRegularTypeKey(key, fullPath, obj, prefix);
  }
};

/**
 * Handle POJO as type key value.
 * @private
 */
Schema.prototype._handlePojoTypeKey = function(key, fullPath, obj, prefix) {
  if (prefix) {
    this.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  const opts = { typePojoToMixed: false };
  const _schema = new Schema(obj[key][this.options.typeKey], opts);
  const schemaWrappedPath = Object.assign({}, obj[key], { [this.options.typeKey]: _schema });
  this.path(prefix + key, schemaWrappedPath);
};

/**
 * Handle regular type key path.
 * @private
 */
Schema.prototype._handleRegularTypeKey = function(key, fullPath, obj, prefix) {
  if (prefix) {
    this.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  this.path(prefix + key, obj[key]);
};

/**
 * Reserved document keys.
 *
 * Keys in this object are names that are rejected in schema declarations
 * because they conflict with Mongoose functionality. If you create a schema
 * using `new Schema()` with one of these property names, Mongoose will throw
 * an error.
 *
 * - _posts
 * - _pres
 * - collection
 * - emit
 * - errors
 * - get
 * - init
 * - isModified
 * - isNew
 * - listeners
 * - modelName
 * - on
 * - once
 * - populated
 * - prototype
 * - remove
 * - removeListener
 * - save
 * - schema
 * - toObject
 * - validate
 *
 * _NOTE:_ Use of these terms as method names is permitted, but play at your own risk, as they may be existing mongoose document methods you are stomping on.
 *
 *      const schema = new Schema(..);
 *      schema.methods.init = function () {} // potentially breaking
 */

Schema.reserved = Object.create(null);
Schema.prototype.reserved = Schema.reserved;
const reserved = Schema.reserved;
// Core object
reserved['prototype'] =
// EventEmitter
reserved.emit =
reserved.listeners =
reserved.on =
reserved.removeListener =
// document properties and functions
reserved.collection =
reserved.errors =
reserved.get =
reserved.init =
reserved.isModified =
reserved.isNew =
reserved.populated =
reserved.remove =
reserved.save =
reserved.toObject =
reserved.validate = 1;

/**
 * Gets/sets schema paths.
 *
 * Sets a path (if arity 2)
 * Gets a path (if arity 1)
 *
 * ####Example
 *
 *     schema.path('name') // returns a SchemaType
 *     schema.path('name', Number) // changes the schemaType of `name` to Number
 *
 * @param {String} path
 * @param {Object} constructor
 * @api public
 */

Schema.prototype.path = function(path, obj) {
  // Convert to '.$' to check subpaths re: gh-6405
  const cleanPath = _pathToPositionalSyntax(path);
  if (obj === undefined) {
    return this._getPathForReading(path, cleanPath);
  }

  this._validatePathName(path);
  this._validatePathRef(obj, path);
  this._setPathInTree(path, obj);
  this._processSchemaType(path, obj);

  return this;
};

/**
 * Get path for reading (when obj is undefined).
 * @private
 */
Schema.prototype._getPathForReading = function(path, cleanPath) {
  let schematype = _getPath(this, path, cleanPath);
  if (schematype != null) {
    return schematype;
  }

  const mapPath = getMapPath(this, path);
  if (mapPath != null) {
    return mapPath;
  }

  schematype = this.hasMixedParent(cleanPath);
  if (schematype != null) {
    return schematype;
  }

  return hasNumericSubpathRegex.test(path)
    ? getPositionalPath(this, path)
    : undefined;
};

/**
 * Validate path name against reserved words.
 * @private
 */
Schema.prototype._validatePathName = function(path) {
  const firstPieceOfPath = path.split('.')[0];
  if (reserved[firstPieceOfPath]) {
    throw new Error('`' + firstPieceOfPath + '` may not be used as a schema pathname');
  }
};

/**
 * Validate path ref if present.
 * @private
 */
Schema.prototype._validatePathRef = function(obj, path) {
  if (typeof obj === 'object' && utils.hasUserDefinedProperty(obj, 'ref')) {
    validateRef(obj.ref, path);
  }
};

/**
 * Set path in tree structure.
 * @private
 */
Schema.prototype._setPathInTree = function(path, obj) {
  const subpaths = path.split(/\./);
  const last = subpaths.pop();
  let branch = this.tree;
  let fullPath = '';

  for (const sub of subpaths) {
    if (utils.specialProperties.has(sub)) {
      throw new Error('Cannot set special property `' + sub + '` on a schema');
    }
    fullPath = fullPath += (fullPath.length > 0 ? '.' : '') + sub;
    if (!branch[sub]) {
      this.nested[fullPath] = true;
      branch[sub] = {};
    }
    if (typeof branch[sub] !== 'object') {
      const msg = 'Cannot set nested path `' + path + '`. '
          + 'Parent path `'
          + fullPath
          + '` already set to type ' + branch[sub].name
          + '.';
      throw new Error(msg);
    }
    branch = branch[sub];
  }

  branch[last] = utils.clone(obj);
};

/**
 * Process schema type after setting in tree.
 * @private
 */
Schema.prototype._processSchemaType = function(path, obj) {
  this.paths[path] = this.interpretAsType(path, obj, this.options);
  const schemaType = this.paths[path];

  this._processMapType(path, obj, schemaType);
  this._processSingleNestedType(path, schemaType);
  this._processDocumentArrayType(path, schemaType);
  this._processMongooseArrayType(path, schemaType);
};

/**
 * Process map type schema.
 * @private
 */
Schema.prototype._processMapType = function(path, obj, schemaType) {
  if (!schemaType.$isSchemaMap) {
    return;
  }

  const mapPath = path + '.$*';
  let _mapType = { type: {} };
  if (utils.hasUserDefinedProperty(obj, 'of')) {
    const isInlineSchema = utils.isPOJO(obj.of) &&
      Object.keys(obj.of).length > 0 &&
      !utils.hasUserDefinedProperty(obj.of, this.options.typeKey);
    _mapType = isInlineSchema ? new Schema(obj.of) : obj.of;
  }
  if (utils.hasUserDefinedProperty(obj, 'ref')) {
    _mapType = { type: _mapType, ref: obj.ref };
  }

  this.paths[mapPath] = this.interpretAsType(mapPath, _mapType, this.options);
  this.mapPaths.push(this.paths[mapPath]);
  schemaType.$__schemaType = this.paths[mapPath];
};

/**
 * Process single nested type schema.
 * @private
 */
Schema.prototype._processSingleNestedType = function(path, schemaType) {
  if (!schemaType.$isSingleNested) {
    return;
  }

  this._addSingleNestedPaths(path, schemaType.schema);
  this._setSingleNestedBase(schemaType);
  this.childSchemas.push({
    schema: schemaType.schema,
    model: schemaType.caster
  });
};

/**
 * Add single nested paths to schema.
 * @private
 */
Schema.prototype._addSingleNestedPaths = function(path, nestedSchema) {
  for (const key of Object.keys(nestedSchema.paths)) {
    this.singleNestedPaths[path + '.' + key] = nestedSchema.paths[key];
  }
  for (const key of Object.keys(nestedSchema.singleNestedPaths)) {
    this.singleNestedPaths[path + '.' + key] = nestedSchema.singleNestedPaths[key];
  }
  for (const key of Object.keys(nestedSchema.subpaths)) {
    this.singleNestedPaths[path + '.' + key] = nestedSchema.subpaths[key];
  }
  for (const key of Object.keys(nestedSchema.nested)) {
    this.singleNestedPaths[path + '.' + key] = 'nested';
  }
};

/**
 * Set base for single nested schema.
 * @private
 */
Schema.prototype._setSingleNestedBase = function(schemaType) {
  Object.defineProperty(schemaType.schema, 'base', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: this.base
  });
  schemaType.caster.base = this.base;
};

/**
 * Process document array type schema.
 * @private
 */
Schema.prototype._processDocumentArrayType = function(path, schemaType) {
  if (!schemaType.$isMongooseDocumentArray) {
    return;
  }

  Object.defineProperty(schemaType.schema, 'base', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: this.base
  });

  schemaType.casterConstructor.base = this.base;
  this.childSchemas.push({
    schema: schemaType.schema,
    model: schemaType.casterConstructor
  });
};

/**
 * Process mongoose array type schema.
 * @private
 */
Schema.prototype._processMongooseArrayType = function(path, schemaType) {
  if (!schemaType.$isMongooseArray || !(schemaType.caster instanceof SchemaType)) {
    return;
  }

  let arrayPath = path;
  let _schemaType = schemaType;
  const toAdd = [];

  while (_schemaType.$isMongooseArray) {
    arrayPath = arrayPath + '.$';

    if (_schemaType.$isMongooseDocumentArray) {
      _schemaType.$embeddedSchemaType._arrayPath = arrayPath;
      _schemaType.$embeddedSchemaType._arrayParentPath = path;
      _schemaType = _schemaType.$embeddedSchemaType.clone();
    } else {
      _schemaType.caster._arrayPath = arrayPath;
      _schemaType.caster._arrayParentPath = path;
      _schemaType = _schemaType.caster.clone();
    }

    _schemaType.path = arrayPath;
    toAdd.push(_schemaType);
  }

  for (const _st of toAdd) {
    this.subpaths[_st.path] = _st;
  }

  this._processDocArraySubpaths(path, schemaType);
};

/**
 * Process document array subpaths.
 * @private
 */
Schema.prototype._processDocArraySubpaths = function(path, schemaType) {
  if (!schemaType.$isMongooseDocumentArray) {
    return;
  }

  this._addDocArrayPaths(path, schemaType.schema.paths);
  this._addDocArrayPaths(path, schemaType.schema.subpaths);
  this._addDocArrayPaths(path, schemaType.schema.singleNestedPaths);
};

/**
 * Add document array paths to subpaths.
 * @private
 */
Schema.prototype._addDocArrayPaths = function(path, pathsObj) {
  for (const key of Object.keys(pathsObj)) {
    const _schemaType = pathsObj[key];
    this.subpaths[path + '.' + key] = _schemaType;
    if (typeof _schemaType === 'object' && _schemaType != null) {
      _schemaType.$isUnderneathDocArray = true;
    }
  }
};

/*!
 * ignore
 */

function gatherChildSchemas(schema) {
  const childSchemas = [];

  for (const path of Object.keys(schema.paths)) {
    const schematype = schema.paths[path];
    if (schematype.$isMongooseDocumentArray || schematype.$isSingleNested) {
      childSchemas.push({ schema: schematype.schema, model: schematype.caster });
    }
  }

  return childSchemas;
}

/*!
 * ignore
 */

function _getPath(schema, path, cleanPath) {
  if (schema.paths.hasOwnProperty(path)) {
    return schema.paths[path];
  }
  if (schema.subpaths.hasOwnProperty(cleanPath)) {
    return schema.subpaths[cleanPath];
  }
  if (schema.singleNestedPaths.hasOwnProperty(cleanPath) && typeof schema.singleNestedPaths[cleanPath] === 'object') {
    return schema.singleNestedPaths[cleanPath];
  }

  return null;
}

/*!
 * ignore
 */

function _pathToPositionalSyntax(path) {
  if (!/\.\d+/.test(path)) {
    return path;
  }
  return path.replace(/\.\d+\./g, '.$.').replace(/\.\d+$/, '.$');
}

/*!
 * ignore
 */

function getMapPath(schema, path) {
  if (schema.mapPaths.length === 0) {
    return null;
  }
  for (const val of schema.mapPaths) {
    const _path = val.path;
    const re = new RegExp('^' + _path.replace(/\.\$\*/g, '\\.[^.]+') + '$');
    if (re.test(path)) {
      return schema.paths[_path];
    }
  }

  return null;
}

/**
 * The Mongoose instance this schema is associated with
 *
 * @property base
 * @api private
 */

Object.defineProperty(Schema.prototype, 'base', {
  configurable: true,
  enumerable: false,
  writable: true,
  value: null
});

/**
 * Converts type arguments into Mongoose Types.
 *
 * @param {String} path
 * @param {Object} obj constructor
 * @api private
 */

Schema.prototype.interpretAsType = function(path, obj, options) {
  if (obj instanceof SchemaType) {
    return this._interpretSchemaType(path, obj);
  }

  const MongooseTypes = this.base != null ? this.base.Schema.Types : Schema.Types;

  if (!utils.isPOJO(obj) && !(obj instanceof SchemaTypeOptions)) {
    obj = this._wrapNonPojoType(obj, options);
  }

  return this._interpretTypeKey(path, obj, options, MongooseTypes);
};

/**
 * Interpret existing SchemaType instance.
 * @private
 */
Schema.prototype._interpretSchemaType = function(path, obj) {
  if (obj.path === path) {
    return obj;
  }
  const clone = obj.clone();
  clone.path = path;
  return clone;
};

/**
 * Wrap non-POJO type in object.
 * @private
 */
Schema.prototype._wrapNonPojoType = function(obj, options) {
  const constructorName = utils.getFunctionName(obj.constructor);
  if (constructorName !== 'Object') {
    const wrapped = {};
    wrapped[options.typeKey] = obj;
    return wrapped;
  }
  return obj;
};

/**
 * Interpret type key from object.
 * @private
 */
Schema.prototype._interpretTypeKey = function(path, obj, options, MongooseTypes) {
  let type = obj[options.typeKey] && (options.typeKey !== 'type' || !obj.type.type)
    ? obj[options.typeKey]
    : {};

  if (utils.isPOJO(type) || type === 'mixed') {
    return new MongooseTypes.Mixed(path, obj);
  }

  if (this._isArrayType(type)) {
    return this._interpretArrayType(path, type, obj, options, MongooseTypes);
  }

  if (type && type.instanceOfSchema) {
    return new MongooseTypes.Embedded(type, path, obj);
  }

  return this._interpretNamedType(path, type, obj, MongooseTypes);
};

/**
 * Check if type is array.
 * @private
 */
Schema.prototype._isArrayType = function(type) {
  return Array.isArray(type) || type === Array || type === 'array' || type === Schema.Types.Array;
};

/**
 * Interpret array type.
 * @private
 */
Schema.prototype._interpretArrayType = function(path, type, obj, options, MongooseTypes) {
  let cast = this._getArrayCast(type, obj);

  if (this._isCastSchema(cast)) {
    return new MongooseTypes.DocumentArray(path, cast, obj);
  }

  if (this._isCastSchemaInTypeKey(cast, options)) {
    return new MongooseTypes.DocumentArray(path, cast[options.typeKey], obj, cast);
  }

  if (Array.isArray(cast)) {
    return new MongooseTypes.Array(path, this.interpretAsType(path, cast, options), obj);
  }

  if (typeof cast === 'string') {
    cast = MongooseTypes[cast.charAt(0).toUpperCase() + cast.substring(1)];
  } else if (this._isCastPojoType(cast, options)) {
    return this._interpretCastPojoArray(path, cast, obj, options, MongooseTypes);
  }

  if (cast) {
    const name = this._getTypeName(cast, options);
    if (!MongooseTypes.hasOwnProperty(name)) {
      throw new TypeError('Invalid schema configuration: ' +
        `\`${name}\` is not a valid type within the array \`${path}\`.` +
        'See http://bit.ly/mongoose-schematypes for a list of valid schema types.');
    }
  }

  return new MongooseTypes.Array(path, cast || MongooseTypes.Mixed, obj, options);
};

/**
 * Get cast type for array.
 * @private
 */
Schema.prototype._getArrayCast = function(type, obj) {
  return (type === Array || type === 'array')
    ? obj.cast || obj.of
    : type[0];
};

/**
 * Check if cast is schema instance.
 * @private
 */
Schema.prototype._isCastSchema = function(cast) {
  if (!cast || !cast.instanceOfSchema) {
    return false;
  }
  if (!(cast instanceof Schema)) {
    throw new TypeError('Schema for array path is from a different copy of the Mongoose module. Please make sure you\'re using the same version ' +
      'of Mongoose everywhere with `npm list mongoose`.');
  }
  return true;
};

/**
 * Check if cast has schema in type key.
 * @private
 */
Schema.prototype._isCastSchemaInTypeKey = function(cast, options) {
  if (!cast || !cast[options.typeKey] || !cast[options.typeKey].instanceOfSchema) {
    return false;
  }
  if (!(cast[options.typeKey] instanceof Schema)) {
    throw new TypeError('Schema for array path is from a different copy of the Mongoose module. Please make sure you\'re using the same version ' +
      'of Mongoose everywhere with `npm list mongoose`.');
  }
  return true;
};

/**
 * Check if cast is POJO type.
 * @private
 */
Schema.prototype._isCastPojoType = function(cast, options) {
  return cast && (!cast[options.typeKey] || (options.typeKey === 'type' && cast.type.type))
    && utils.isPOJO(cast);
};

/**
 * Interpret cast POJO as array.
 * @private
 */
Schema.prototype._interpretCastPojoArray = function(path, cast, obj, options, MongooseTypes) {
  if (Object.keys(cast).length < 1) {
    return new MongooseTypes.Array(path, MongooseTypes.Mixed, obj);
  }

  const childSchemaOptions = this._buildChildSchemaOptions(options);
  const childSchema = new Schema(cast, childSchemaOptions);
  childSchema.$implicitlyCreated = true;
  return new MongooseTypes.DocumentArray(path, childSchema, obj);
};

/**
 * Build options for child schema.
 * @private
 */
Schema.prototype._buildChildSchemaOptions = function(options) {
  const childSchemaOptions = { minimize: options.minimize };
  if (options.typeKey) {
    childSchemaOptions.typeKey = options.typeKey;
  }
  if (options.hasOwnProperty('strict')) {
    childSchemaOptions.strict = options.strict;
  }
  if (options.hasOwnProperty('typePojoToMixed')) {
    childSchemaOptions.typePojoToMixed = options.typePojoToMixed;
  }

  if (this._userProvidedOptions.hasOwnProperty('_id')) {
    childSchemaOptions._id = this._userProvidedOptions._id;
  } else if (Schema.Types.DocumentArray.defaultOptions &&
      Schema.Types.DocumentArray.defaultOptions._id != null) {
    childSchemaOptions._id = Schema.Types.DocumentArray.defaultOptions._id;
  }

  return childSchemaOptions;
};

/**
 * Get type name from type value.
 * @private
 */
Schema.prototype._getTypeName = function(type, options) {
  let name;

  if (Buffer.isBuffer(type)) {
    name = 'Buffer';
  } else if (typeof type === 'function' || typeof type === 'object') {
    name = type.schemaName || utils.getFunctionName(type);
  } else {
    name = type == null ? '' + type : type.toString();
  }

  if (name) {
    name = name.charAt(0).toUpperCase() + name.substring(1);
  }
  // Special case re: gh-7049 because the bson `ObjectID` class' capitalization
  // doesn't line up with Mongoose's.
  if (name === 'ObjectID') {
    name = 'ObjectId';
  }
  // For Jest 26+, see #10296
  if (name === 'ClockDate') {
    name = 'Date';
  }

  return name;
};

/**
 * Interpret named type.
 * @private
 */
Schema.prototype._interpretNamedType = function(path, type, obj, MongooseTypes) {
  const name = this._getTypeName(type, this.options);

  if (MongooseTypes[name] == null) {
    throw new TypeError(`Invalid schema configuration: \`${name}\` is not ` +
      `a valid type at path \`${path}\`. See ` +
      'http://bit.ly/mongoose-schematypes for a list of valid schema types.');
  }

  return new MongooseTypes[name](path, obj);
};

/**
 * Iterates the schemas paths similar to Array#forEach.
 *
 * The callback is passed the pathname and the schemaType instance.
 *
 * ####Example:
 *
 *     const userSchema = new Schema({ name: String, registeredAt: Date });
 *     userSchema.eachPath((pathname, schematype) => {
 *       // Prints twice:
 *       // name SchemaString { ... }
 *       // registeredAt SchemaDate { ... }
 *       console.log(pathname, schematype);
 *     });
 *
 * @param {Function} fn callback function
 * @return {Schema} this
 * @api public
 */

Schema.prototype.eachPath = function(fn) {
  const keys = Object.keys(this.paths);
  const len = keys.length;

  for (let i = 0; i < len; ++i) {
    fn(keys[i], this.paths[keys[i]]);
  }

  return this;
};

/**
 * Returns an Array of path strings that are required by this schema.
 *
 * ####Example:
 *     const s = new Schema({
 *       name: { type: String, required: true },
 *       age: { type: String, required: true },
 *       notes: String
 *     });
 *     s.requiredPaths(); // [ 'age', 'name' ]
 *
 * @api public
 * @param {Boolean} invalidate refresh the cache
 * @return {Array}
 */

Schema.prototype.requiredPaths = function requiredPaths(invalidate) {
  if (this._requiredpaths && !invalidate) {
    return this._requiredpaths;
  }

  const paths = Object.keys(this.paths);
  let i = paths.length;
  const ret = [];

  while (i--) {
    const path = paths[i];
    if (this.paths[path].isRequired) {
      ret.push(path);
    }
  }
  this._requiredpaths = ret;
  return this._requiredpaths;
};

/**
 * Returns indexes from fields and schema-level indexes (cached).
 *
 * @api private
 * @return {Array}
 */

Schema.prototype.indexedPaths = function indexedPaths() {
  if (this._indexedpaths) {
    return this._indexedpaths;
  }
  this._indexedpaths = this.indexes();
  return this._indexedpaths;
};

/**
 * Returns the pathType of `path` for this schema.
 *
 * Given a path, returns whether it is a real, virtual, nested, or ad-hoc/undefined path.
 *
 * ####Example:
 *     const s = new Schema({ name: String, nested: { foo: String } });
 *     s.virtual('foo').get(() => 42);
 *     s.pathType('name'); // "real"
 *     s.pathType('nested'); // "nested"
 *     s.pathType('foo'); // "virtual"
 *     s.pathType('fail'); // "adhocOrUndefined"
 *
 * @param {String} path
 * @return {String}
 * @api public
 */

Schema.prototype.pathType = function(path) {
  // Convert to '.$' to check subpaths re: gh-6405
  const cleanPath = _pathToPositionalSyntax(path);

  if (this.paths.hasOwnProperty(path)) {
    return 'real';
  }
  if (this.virtuals.hasOwnProperty(path)) {
    return 'virtual';
  }
  if (this.nested.hasOwnProperty(path)) {
    return 'nested';
  }
  if (this.subpaths.hasOwnProperty(cleanPath) || this.subpaths.hasOwnProperty(path)) {
    return 'real';
  }

  const singleNestedPath = this.singleNestedPaths.hasOwnProperty(cleanPath) || this.singleNestedPaths.hasOwnProperty(path);
  if (singleNestedPath) {
    return singleNestedPath === 'nested' ? 'nested' : 'real';
  }

  // Look for maps
  const mapPath = getMapPath(this, path);
  if (mapPath != null) {
    return 'real';
  }

  if (/\.\d+\.|\.\d+$/.test(path)) {
    return getPositionalPathType(this, path);
  }
  return 'adhocOrUndefined';
};

/**
 * Returns true iff this path is a child of a mixed schema.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

Schema.prototype.hasMixedParent = function(path) {
  const subpaths = path.split(/\./g);
  path = '';
  for (let i = 0; i < subpaths.length; ++i) {
    path = i > 0 ? path + '.' + subpaths[i] : subpaths[i];
    if (this.paths.hasOwnProperty(path) &&
        this.paths[path] instanceof MongooseTypes.Mixed) {
      return this.paths[path];
    }
  }

  return null;
};

/**
 * Setup updatedAt and createdAt timestamps to documents if enabled
 *
 * @param {Boolean|Object} timestamps timestamps options
 * @api private
 */
Schema.prototype.setupTimestamp = function(timestamps) {
  return setupTimestamps(this, timestamps);
};

/*!
 * ignore. Deprecated re: #6405
 */

function getPositionalPathType(self, path) {
  const subpaths = path.split(/\.(\d+)\.|\.(\d+)$/).filter(Boolean);
  if (subpaths.length < 2) {
    return self.paths.hasOwnProperty(subpaths[0]) ?
      self.paths[subpaths[0]] :
      'adhocOrUndefined';
  }

  let val = self.path(subpaths[0]);
  let isNested = false;
  if (!val) {
    return 'adhocOrUndefined';
  }

  const last = subpaths.length - 1;

  for (let i = 1; i < subpaths.length; ++i) {
    isNested = false;
    const subpath = subpaths[i];

    if (i === last && val && !/\D/.test(subpath)) {
      val = _getPositionalValue(val);
      break;
    }

    // ignore if its just a position segment: path.0.subpath
    if (!/\D/.test(subpath)) {
      // Nested array
      if (val instanceof MongooseTypes.Array && i !== last) {
        val = val.caster;
      }
      continue;
    }

    if (!(val && val.schema)) {
      val = undefined;
      break;
    }

    const type = val.schema.pathType(subpath);
    isNested = (type === 'nested');
    val = val.schema.path(subpath);
  }

  self.subpaths[path] = val;
  if (val) {
    return 'real';
  }
  if (isNested) {
    return 'nested';
  }
  return 'adhocOrUndefined';
}

/**
 * Get positional value from schema type.
 * @private
 */
function _getPositionalValue(val) {
  if (val.$isMongooseDocumentArray) {
    return val.$embeddedSchemaType;
  }
  if (val instanceof MongooseTypes.Array) {
    return val.caster;
  }
  return undefined;
}

/*!
 * ignore
 */

function getPositionalPath(self, path) {
  getPositionalPathType(self, path);
  return self.subpaths[path];
}

/**
 * Adds a method call to the queue.
 *
 * ####Example:
 *
 *     schema.methods.print = function() { console.log(this); };
 *     schema.queue('print', []); // Print the doc every one is instantiated
 *
 *     const Model = mongoose.model('Test', schema);
 *     new Model({ name: 'test' }); // Prints '{"_id": ..., "name": "test" }'
 *
 * @param {String} name name of the document method to call later
 * @param {Array} args arguments to pass to the method
 * @api public
 */

Schema.prototype.queue = function(name, args) {
  this.callQueue.push([name, args]);
  return this;
};

/**
 * Defines a pre hook for the model.
 *
 * ####Example
 *
 *     const toySchema = new Schema({ name: String, created: Date });
 *
 *     toySchema.pre('save', function(next) {
 *       if (!this.created) this.created = new Date;
 *       next();
 *     });
 *
 *     toySchema.pre('validate', function(next) {
 *       if (this.name !== 'Woody') this.name = 'Woody';
 *       next();
 *     });
 *
 *     // Equivalent to calling `pre()` on `find`, `findOne`, `findOneAndUpdate`.
 *     toySchema.pre(/^find/, function(next) {
 *       console.log(this.getFilter());
 *     });
 *
 *     // Equivalent to calling `pre()` on `updateOne`, `findOneAndUpdate`.
 *     toySchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
 *       console.log(this.getFilter());
 *     });
 *
 *     toySchema.pre('deleteOne', function() {
 *       // Runs when you call `Toy.deleteOne()`
 *     });
 *
 *     toySchema.pre('deleteOne', { document: true }, function() {
 *       // Runs when you call `doc.deleteOne()`
 *     });
 *
 * @param {String|RegExp} The method name or regular expression to match method name
 * @param {Object} [options]
 * @param {Boolean} [options.document] If `name` is a hook for both document and query middleware, set to `true` to run on document middleware. For example, set `options.document` to `true` to apply this hook to `Document#deleteOne()` rather than `Query#deleteOne()`.
 * @param {Boolean} [options.query] If `name` is a hook for both document and query middleware, set to `true` to run on query middleware.
 * @param {Function} callback
 * @api public
 */

Schema.prototype.pre = function(name) {
  if (name instanceof RegExp) {
    const remainingArgs = Array.prototype.slice.call(arguments, 1);
    for (const fn of hookNames) {
      if (name.test(fn)) {
        this.pre.apply(this, [fn].concat(remainingArgs));
      }
    }
    return this;
  }
  if (Array.isArray(name)) {
    const remainingArgs = Array.prototype.slice.call(arguments, 1);
    for (const el of name) {
      this.pre.apply(this, [el].concat(remainingArgs));
    }
    return this;
  }
  this.s.hooks.pre.apply(this.s.hooks, arguments);
  return this;
};

/**
 * Defines a post hook for the document
 *
 *     const schema = new Schema(..);
 *     schema.post('save', function (doc) {
 *       console.log('this fired after a document was saved');
 *     });
 *
 *     schema.post('find', function(docs) {
 *       console.log('this fired after you ran a find query');
 *     });
 *
 *     schema.post(/Many$/, function(res) {
 *       console.log('this fired after you ran `updateMany()` or `deleteMany()`);
 *     });
 *
 *     const Model = mongoose.model('Model', schema);
 *
 *     const m = new Model(..);
 *     m.save(function(err) {
 *       console.log('this fires after the `post` hook');
 *     });
 *
 *     m.find(function(err, docs) {
 *       console.log('this fires after the post find hook');
 *     });
 *
 * @param {String|RegExp} The method name or regular expression to match method name
 * @param {Object} [options]
 * @param {Boolean} [options.document] If `name` is a hook for both document and query middleware, set to `true` to run on document middleware.
 * @param {Boolean} [options.query] If `name` is a hook for both document and query middleware, set to `true` to run on query middleware.
 * @param {Function} fn callback
 * @see middleware http://mongoosejs.com/docs/middleware.html
 * @see kareem http://npmjs.org/package/kareem
 * @api public
 */

Schema.prototype.post = function(name) {
  if (name instanceof RegExp) {
    const remainingArgs = Array.prototype.slice.call(arguments, 1);
    for (const fn of hookNames) {
      if (name.test(fn)) {
        this.post.apply(this, [fn].concat(remainingArgs));
      }
    }
    return this;
  }
  if (Array.isArray(name)) {
    const remainingArgs = Array.prototype.slice.call(arguments, 1);
    for (const el of name) {
      this.post.apply(this, [el].concat(remainingArgs));
    }
    return this;
  }
  this.s.hooks.post.apply(this.s.hooks, arguments);
  return this;
};

/**
 * Registers a plugin for this schema.
 *
 * ####Example:
 *
 *     const s = new Schema({ name: String });
 *     s.plugin(schema => console.log(schema.path('name').path));
 *     mongoose.model('Test', s); // Prints 'name'
 *
 * @param {Function} plugin callback
 * @param {Object} [opts]
 * @see plugins
 * @api public
 */

Schema.prototype.plugin = function(fn, opts) {
  if (typeof fn !== 'function') {
    throw new Error('First param to `schema.plugin()` must be a function, ' +
      'got "' + (typeof fn) + '"');
  }

  if (opts && opts.deduplicate) {
    for (const plugin of this.plugins) {
      if (plugin.fn === fn) {
        return this;
      }
    }
  }
  this.plugins.push({ fn: fn, opts: opts });

  fn(this, opts);
  return this;
};

/**
 * Adds an instance method to documents constructed from Models compiled from this schema.
 *
 * ####Example
 *
 *     const schema = kittySchema = new Schema(..);
 *
 *     schema.method('meow', function () {
 *       console.log('meeeeeoooooooooooow');
 *     })
 *
 *     const Kitty = mongoose.model('Kitty', schema);
 *
 *     const fizz = new Kitty;
 *     fizz.meow(); // meeeeeooooooooooooow
 *
 * If a hash of name/fn pairs is passed as the only argument, each name/fn pair will be added as methods.
 *
 *     schema.method({
 *         purr: function () {}
 *       , scratch: function () {}
 *     });
 *
 *     // later
 *     fizz.purr();
 *     fizz.scratch();
 *
 * NOTE: `Schema.method()` adds instance methods to the `Schema.methods` object. You can also add instance methods directly to the `Schema.methods` object as seen in the [guide](/docs/guide.html#methods)
 *
 * @param {String|Object} method name
 * @param {Function} [fn]
 * @api public
 */

Schema.prototype.method = function(name, fn, options) {
  if (typeof name !== 'string') {
    for (const i in name) {
      this.methods[i] = name[i];
      this.methodOptions[i] = utils.clone(options);
    }
  } else {
    this.methods[name] = fn;
    this.methodOptions[name] = utils.clone(options);
  }
  return this;
};

/**
 * Adds static "class" methods to Models compiled from this schema.
 *
 * ####Example
 *
 *     const schema = new Schema(..);
 *     // Equivalent to `schema.statics.findByName = function(name) {}`;
 *     schema.static('findByName', function(name) {
 *       return this.find({ name: name });
 *     });
 *
 *     const Drink = mongoose.model('Drink', schema);
 *     await Drink.findByName('LaCroix');
 *
 * If a hash of name/fn pairs is passed as the only argument, each name/fn pair will be added as statics.
 *
 * @param {String|Object} name
 * @param {Function} [fn]
 * @api public
 * @see Statics /docs/guide.html#statics
 */

Schema.prototype.static = function(name, fn) {
  if (typeof name !== 'string') {
    for (const i in name) {
      this.statics[i] = name[i];
    }
  } else {
    this.statics[name] = fn;
  }
  return this;
};

/**
 * Defines an index (most likely compound) for this schema.
 *
 * ####Example
 *
 *     schema.index({ first: 1, last: -1 })
 *
 * @param {Object} fields
 * @param {Object} [options] Options to pass to [MongoDB driver's `createIndex()` function](http://mongodb.github.io/node-mongodb-native/2.0/api/Collection.html#createIndex)
 * @param {String | number} [options.expires=null] Mongoose-specific syntactic sugar, uses [ms](https://www.npmjs.com/package/ms) to convert `expires` option into seconds for the `expireAfterSeconds` in the above link.
 * @api public
 */

Schema.prototype.index = function(fields, options) {
  fields || (fields = {});
  options || (options = {});

  if (options.expires) {
    utils.expires(options);
  }

  this._indexes.push([fields, options]);
  return this;
};

/**
 * Sets a schema option.
 *
 * ####Example
 *
 *     schema.set('strict'); // 'true' by default
 *     schema.set('strict', false); // Sets 'strict' to false
 *     schema.set('strict'); // 'false'
 *
 * @param {String} key option name
 * @param {Object} [value] if not passed, the current option value is returned
 * @see Schema ./
 * @api public
 */

Schema.prototype.set = function(key, value, _tags) {
  if (arguments.length === 1) {
    return this.options[key];
  }

  switch (key) {
    case 'read':
      this._setReadOption(value, _tags);
      break;
    case 'safe':
      this._setSafeOption(value);
      break;
    case 'timestamps':
      this._setTimestampsOption(value);
      break;
    case '_id':
      this._setIdOption(value);
      break;
    default:
      this.options[key] = value;
      this._userProvidedOptions[key] = this.options[key];
      break;
  }

  return this;
};

/**
 * Set read option.
 * @private
 */
Schema.prototype._setReadOption = function(value, _tags) {
  this.options.read = readPref(value, _tags);
  this._userProvidedOptions.read = this.options.read;
};

/**
 * Set safe option.
 * @private
 */
Schema.prototype._setSafeOption = function(value) {
  setSafe(this.options, value);
  this._userProvidedOptions.safe = this.options.safe;
};

/**
 * Set timestamps option.
 * @private
 */
Schema.prototype._setTimestampsOption = function(value) {
  this.setupTimestamp(value);
  this.options.timestamps = value;
  this._userProvidedOptions.timestamps = this.options.timestamps;
};

/**
 * Set _id option.
 * @private
 */
Schema.prototype._setIdOption = function(value) {
  this.options._id = value;
  this._userProvidedOptions._id = this.options._id;

  if (value && !this.paths['_id']) {
    addAutoId(this);
  } else if (!value && this.paths['_id'] != null && this.paths['_id'].auto) {
    this.remove('_id');
  }
};

/*!
 * ignore
 */

const safeDeprecationWarning = 'Mongoose: The `safe` option for schemas is ' +
  'deprecated. Use the `writeConcern` option instead: ' +
  'http://bit.ly/mongoose-write-concern';

const setSafe = util.deprecate(function setSafe(options, value) {
  options.safe = value === false ?
    { w: 0 } :
    value;
}, safeDeprecationWarning);

/**
 * Gets a schema option.
 *
 * ####Example:
 *
 *     schema.get('strict'); // true
 *     schema.set('strict', false);
 *     schema.get('strict'); // false
 *
 * @param {String} key option name
 * @api public
 * @return {Any} the option's value
 */

Schema.prototype.get = function(key) {
  return this.options[key];
};

/**
 * The allowed index types
 *
 * @receiver Schema
 * @static indexTypes
 * @api public
 */

const indexTypes = '2d 2dsphere hashed text'.split(' ');

Object.defineProperty(Schema, 'indexTypes', {
  get: function() {
    return indexTypes;
  },
  set: function() {
    throw new Error('Cannot overwrite Schema.indexTypes');
  }
});

/**
 * Returns a list of indexes that this schema declares, via `schema.index()` or by `index: true` in a path's options.
 * Indexes are expressed as an array `[spec, options]`.
 *
 * ####Example:
 *
 *     const userSchema = new Schema({
 *       email: { type: String, required: true, unique: true },
 *       registeredAt: { type: Date, index: true }
 *     });
 *
 *     // [ [ { email: 1 }, { unique: true, background: true } ],
 *     //   [ { registeredAt: 1 }, { background: true } ] ]
 *     userSchema.indexes();
 *
 * [Plugins](/docs/plugins.html) can use the return value of this function to modify a schema's indexes.
 * For example, the below plugin makes every index unique by default.
 *
 *     function myPlugin(schema) {
 *       for (const index of schema.indexes()) {
 *         if (index[1].unique === undefined) {
 *           index[1].unique = true;
 *         }
 *       }
 *     }
 *
 * @api public
 * @return {Array} list of indexes defined in the schema
 */

Schema.prototype.indexes = function() {
  return getIndexes(this);
};

/**
 * Creates a virtual type with the given name.
 *
 * @param {String} name
 * @param {Object} [options]
 * @param {String|Model} [options.ref] model name or model instance. Marks this as a [populate virtual](populate.html#populate-virtuals).
 * @param {String|Function} [options.localField] Required for populate virtuals. See [populate virtual docs](populate.html#populate-virtuals) for more information.
 * @param {String|Function} [options.foreignField] Required for populate virtuals. See [populate virtual docs](populate.html#populate-virtuals) for more information.
 * @param {Boolean|Function} [options.justOne=false] Only works with populate virtuals. If [truthy](https://masteringjs.io/tutorials/fundamentals/truthy), will be a single doc or `null`. Otherwise, the populate virtual will be an array.
 * @param {Boolean} [options.count=false] Only works with populate virtuals. If [truthy](https://masteringjs.io/tutorials/fundamentals/truthy), this populate virtual will contain the number of documents rather than the documents themselves when you `populate()`.
 * @param {Function|null} [options.get=null] Adds a [getter](/docs/tutorials/getters-setters.html) to this virtual to transform the populated doc.
 * @return {VirtualType}
 */

Schema.prototype.virtual = function(name, options) {
  if (name instanceof VirtualType || getConstructorName(name) === 'VirtualType') {
    return this.virtual(name.path, name.options);
  }

  options = new VirtualOptions(options);

  if (utils.hasUserDefinedProperty(options, ['ref', 'refPath'])) {
    return this._createReferenceVirtual(name, options);
  }

  return this._createRegularVirtual(name, options);
};

/**
 * Create reference virtual.
 * @private
 */
Schema.prototype._createReferenceVirtual = function(name, options) {
  if (options.localField == null) {
    throw new Error('Reference virtuals require `localField` option');
  }

  if (options.foreignField == null) {
    throw new Error('Reference virtuals require `foreignField` option');
  }

  this._setupReferenceVirtualInit(name, options);
  const virtual = this.virtual(name);
  virtual.options = options;

  this._setupReferenceVirtualSetter(virtual, name, options);

  if (typeof options.get === 'function') {
    virtual.get(options.get);
  }

  return virtual;
};

/**
 * Setup init hook for reference virtual.
 * @private
 */
Schema.prototype._setupReferenceVirtualInit = function(name, options) {
  this.pre('init', function(obj) {
    if (mpath.has(name, obj)) {
      const _v = mpath.get(name, obj);
      if (!this.$$populatedVirtuals) {
        this.$$populatedVirtuals = {};
      }

      this.$$populatedVirtuals[name] = this._getPopulatedVirtualValue(_v, options);
      mpath.unset(name, obj);
    }
  });
};

/**
 * Get populated virtual value.
 * @private
 */
Schema.prototype._getPopulatedVirtualValue = function(_v, options) {
  if (options.justOne || options.count) {
    return Array.isArray(_v) ? _v[0] : _v;
  }
  return Array.isArray(_v) ? _v : _v == null ? [] : [_v];
};

/**
 * Setup setter for reference virtual.
 * @private
 */
Schema.prototype._setupReferenceVirtualSetter = function(virtual, name, options) {
  virtual.set(function(_v) {
    if (!this.$$populatedVirtuals) {
      this.$$populatedVirtuals = {};
    }

    if (options.justOne || options.count) {
      this.$$populatedVirtuals[name] = Array.isArray(_v) ? _v[0] : _v;

      if (typeof this.$$populatedVirtuals[name] !== 'object') {
        this.$$populatedVirtuals[name] = options.count ? _v : null;
      }
    } else {
      this.$$populatedVirtuals[name] = Array.isArray(_v) ? _v : _v == null ? [] : [_v];
      this.$$populatedVirtuals[name] = this.$$populatedVirtuals[name].filter(function(doc) {
        return doc && typeof doc === 'object';
      });
    }
  });
};

/**
 * Create regular virtual.
 * @private
 */
Schema.prototype._createRegularVirtual = function(name, options) {
  const virtuals = this.virtuals;
  const parts = name.split('.');

  if (this.pathType(name) === 'real') {
    throw new Error('Virtual path "' + name + '"' +
      ' conflicts with a real path in the schema');
  }

  virtuals[name] = parts.reduce(function(mem, part, i) {
    mem[part] || (mem[part] = (i === parts.length - 1)
      ? new VirtualType(options, name)
      : {});
    return mem[part];
  }, this.tree);

  this._setupDocArrayVirtualWorkaround(name, parts);

  return virtuals[name];
};

/**
 * Setup workaround for virtual under document array.
 * @private
 */
Schema.prototype._setupDocArrayVirtualWorkaround = function(name, parts) {
  let cur = parts[0];
  for (let i = 0; i < parts.length - 1; ++i) {
    if (this.paths[cur] != null && this.paths[cur].$isMongooseDocumentArray) {
      const remnant = parts.slice(i + 1).join('.');
      const v = this.paths[cur].schema.virtual(remnant);
      v.get((v, virtual, doc) => {
        const parent = doc.__parentArray[arrayParentSymbol];
        const path = cur + '.' + doc.__index + '.' + remnant;
        return parent.get(path);
      });
      break;
    }

    cur += '.' + parts[i + 1];
  }
};

/**
 * Returns the virtual type with the given `name`.
 *
 * @param {String} name
 * @return {VirtualType}
 */

Schema.prototype.virtualpath = function(name) {
  return this.virtuals.hasOwnProperty(name) ? this.virtuals[name] : null;
};

/**
 * Removes the given `path` (or [`paths`]).
 *
 * ####Example:
 *
 *     const schema = new Schema({ name: String, age: Number });
 *     schema.remove('name');
 *     schema.path('name'); // Undefined
 *     schema.path('age'); // SchemaNumber { ... }
 *
 * @param {String|Array} path
 * @return {Schema} the Schema instance
 * @api public
 */
Schema.prototype.remove = function(path) {
  if (typeof path === 'string') {
    path = [path];
  }
  if (Array.isArray(path)) {
    path.forEach(function(name) {
      this._removePath(name);
    }, this);
  }
  return this;
};

/**
 * Remove a single path from schema.
 * @private
 */
Schema.prototype._removePath = function(name) {
  if (this.path(name) == null && !this.nested[name]) {
    return;
  }
  if (this.nested[name]) {
    this._removeNestedPath(name);
    return;
  }

  delete this.paths[name];
  _deletePath(this, name);
};

/**
 * Remove nested path and all its children.
 * @private
 */
Schema.prototype._removeNestedPath = function(name) {
  const allKeys = Object.keys(this.paths).concat(Object.keys(this.nested));
  for (const path of allKeys) {
    if (path.startsWith(name + '.')) {
      delete this.paths[path];
      delete this.nested[path];
      _deletePath(this, path);
    }
  }

  delete this.nested[name];
  _deletePath(this, name);
};

/*!
 * ignore
 */

function _deletePath(schema, name) {
  const pieces = name.split('.');
  const last = pieces.pop();

  let branch = schema.tree;

  for (const piece of pieces) {
    branch = branch[piece];
  }

  delete branch[last];
}

/**
 * Loads an ES6 class into a schema. Maps [setters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/set) + [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get), [static methods](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/static),
 * and [instance methods](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes#Class_body_and_method_definitions)
 * to schema [virtuals](/docs/guide.html#virtuals),
 * [statics](/docs/guide.html#statics), and
 * [methods](/docs/guide.html#methods).
 *
 * ####Example:
 *
 * ```javascript
 * const md5 = require('md5');
 * const userSchema = new Schema({ email: String });
 * class UserClass {
 *   // `gravatarImage` becomes a virtual
 *   get gravatarImage() {
 *     const hash = md5(this.email.toLowerCase());
 *     return `https://www.gravatar.com/avatar/${hash}`;
 *   }
 *
 *   // `getProfileUrl()` becomes a document method
 *   getProfileUrl() {
 *     return `https://mysite.com/${this.email}`;
 *   }
 *
 *   // `findByEmail()` becomes a static
 *   static findByEmail(email) {
 *     return this.findOne({ email });
 *   }
 * }
 *
 * // `schema` will now have a `gravatarImage` virtual, a `getProfileUrl()` method,
 * // and a `findByEmail()` static
 * userSchema.loadClass(UserClass);
 * ```
 *
 * @param {Function} model
 * @param {Boolean} [virtualsOnly] if truthy, only pulls virtuals from the class, not methods or statics
 */
Schema.prototype.loadClass = function(model, virtualsOnly) {
  if (this._shouldSkipLoadClass(model)) {
    return this;
  }

  this.loadClass(Object.getPrototypeOf(model), virtualsOnly);

  if (!virtualsOnly) {
    this._loadStaticMethods(model);
  }

  this._loadInstanceMethods(model, virtualsOnly);

  return this;
};

/**
 * Check if should skip loading class.
 * @private
 */
Schema.prototype._shouldSkipLoadClass = function(model) {
  return model === Object.prototype ||
      model === Function.prototype ||
      model.prototype.hasOwnProperty('$isMongooseModelPrototype');
};

/**
 * Load static methods from class.
 * @private
 */
Schema.prototype._loadStaticMethods = function(model) {
  Object.getOwnPropertyNames(model).forEach(function(name) {
    if (name.match(/^(length|name|prototype|constructor|__proto__)$/)) {
      return;
    }
    const prop = Object.getOwnPropertyDescriptor(model, name);
    if (prop.hasOwnProperty('value')) {
      this.static(name, prop.value);
    }
  }, this);
};

/**
 * Load instance methods and virtuals from class.
 * @private
 */
Schema.prototype._loadInstanceMethods = function(model, virtualsOnly) {
  Object.getOwnPropertyNames(model.prototype).forEach(function(name) {
    if (name.match(/^(constructor)$/)) {
      return;
    }
    const method = Object.getOwnPropertyDescriptor(model.prototype, name);
    if (!virtualsOnly && typeof method.value === 'function') {
      this.method(name, method.value);
    }
    if (typeof method.get === 'function') {
      if (this.virtuals[name]) {
        this.virtuals[name].getters = [];
      }
      this.virtual(name).get(method.get);
    }
    if (typeof method.set === 'function') {
      if (this.virtuals[name]) {
        this.virtuals[name].setters = [];
      }
      this.virtual(name).set(method.set);
    }
  }, this);
};

/*!
 * ignore
 */

Schema.prototype._getSchema = function(path) {
  const _this = this;
  const pathschema = _this.path(path);
  const resultPath = [];

  if (pathschema) {
    pathschema.$fullPath = path;
    return pathschema;
  }

  function search(parts, schema) {
    let p = parts.length + 1;
    let foundschema;
    let trypath;

    while (p--) {
      trypath = parts.slice(0, p).join('.');
      foundschema = schema.path(trypath);
      if (foundschema) {
        resultPath.push(trypath);
        return _this._processFoundSchema(foundschema, parts, p, schema);
      }
    }
  }

  // look for arrays
  const parts = path.split('.');
  for (let i = 0; i < parts.length; ++i) {
    if (parts[i] === '$' || isArrayFilter(parts[i])) {
      // Re: gh-5628, because `schema.path()` doesn't take $ into account.
      parts[i] = '0';
    }
  }
  return search(parts, _this);
};

/**
 * Process found schema in _getSchema.
 * @private
 */
Schema.prototype._processFoundSchema = function(foundschema, parts, p, schema) {
  if (foundschema.caster) {
    return this._processCasterSchema(foundschema, parts, p);
  }
  if (foundschema.$isSchemaMap) {
    return this._processMapSchema(foundschema, parts, p);
  }

  foundschema.$fullPath = parts.slice(0, p).join('.');
  return foundschema;
};

/**
 * Process caster schema in _getSchema.
 * @private
 */
Schema.prototype._processCasterSchema = function(foundschema, parts, p) {
  // array of Mixed?
  if (foundschema.caster instanceof MongooseTypes.Mixed) {
    foundschema.caster.$fullPath = parts.slice(0, p).join('.');
    return foundschema.caster;
  }

  // Now that we found the array, we need to check if there
  // are remaining document paths to look up for casting.
  // Also we need to handle array.$.path since schema.path
  // doesn't work for that.
  // If there is no foundschema.schema we are dealing with
  // a path like array.$
  if (p !== parts.length && foundschema.schema) {
    return this._processArrayRemainder(foundschema, parts, p);
  }

  return foundschema;
};

/**
 * Process array remainder in _getSchema.
 * @private
 */
Schema.prototype._processArrayRemainder = function(foundschema, parts, p) {
  if (parts[p] === '$' || isArrayFilter(parts[p])) {
    if (p + 1 === parts.length) {
      // comments.$
      return foundschema;
    }
    // comments.$.comments.$.title
    const ret = this._getSchema(parts.slice(p + 1).join('.'));
    if (ret) {
      ret.$isUnderneathDocArray = ret.$isUnderneathDocArray ||
        !foundschema.schema.$isSingleNested;
    }
    return ret;
  }
  // this is the last path of the selector
  const ret = this._getSchema(parts.slice(p).join('.'));
  if (ret) {
    ret.$isUnderneathDocArray = ret.$isUnderneathDocArray ||
      !foundschema.schema.$isSingleNested;
  }
  return ret;
};

/**
 * Process map schema in _getSchema.
 * @private
 */
Schema.prototype._processMapSchema = function(foundschema, parts, p) {
  if (p + 1 >= parts.length) {
    return foundschema;
  }
  const ret = this._getSchema(parts.slice(p + 1).join('.'));
  return ret;
};

/*!
 * ignore
 */

Schema.prototype._getPathType = function(path) {
  const _this = this;
  const pathschema = _this.path(path);

  if (pathschema) {
    return 'real';
  }

  function search(parts, schema) {
    let p = parts.length + 1,
        foundschema,
        trypath;

    while (p--) {
      trypath = parts.slice(0, p).join('.');
      foundschema = schema.path(trypath);
      if (foundschema) {
        return _this._processPathTypeFoundSchema(foundschema, parts, p, schema);
      } else if (p === parts.length && schema.nested[trypath]) {
        return { schema: schema, pathType: 'nested' };
      }
    }
    return { schema: foundschema || schema, pathType: 'undefined' };
  }

  // look for arrays
  return search(path.split('.'), _this);
};

/**
 * Process found schema in _getPathType.
 * @private
 */
Schema.prototype._processPathTypeFoundSchema = function(foundschema, parts, p, schema) {
  if (foundschema.caster) {
    return this._processPathTypeCaster(foundschema, parts, p);
  }
  return { schema: foundschema, pathType: 'real' };
};

/**
 * Process caster in _getPathType.
 * @private
 */
Schema.prototype._processPathTypeCaster = function(foundschema, parts, p) {
  // array of Mixed?
  if (foundschema.caster instanceof MongooseTypes.Mixed) {
    return { schema: foundschema, pathType: 'mixed' };
  }

  // Now that we found the array, we need to check if there
  // are remaining document paths to look up for casting.
  // Also we need to handle array.$.path since schema.path
  // doesn't work for that.
  // If there is no foundschema.schema we are dealing with
  // a path like array.$
  if (p !== parts.length && foundschema.schema) {
    return this._processPathTypeArrayRemainder(foundschema, parts, p);
  }

  return {
    schema: foundschema,
    pathType: foundschema.$isSingleNested ? 'nested' : 'array'
  };
};

/**
 * Process array remainder in _getPathType.
 * @private
 */
Schema.prototype._processPathTypeArrayRemainder = function(foundschema, parts, p) {
  if (parts[p] === '$' || isArrayFilter(parts[p])) {
    if (p === parts.length - 1) {
      return { schema: foundschema, pathType: 'nested' };
    }
    // comments.$.comments.$.title
    return this._getPathType(parts.slice(p + 1).join('.'));
  }
  // this is the last path of the selector
  return this._getPathType(parts.slice(p).join('.'));
};

/*!
 * ignore
 */

function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/*!
 * Module exports.
 */

module.exports = exports = Schema;

// require down here because of reference issues

/**
 * The various built-in Mongoose Schema Types.
 *
 * ####Example:
 *
 *     const mongoose = require('mongoose');
 *     const ObjectId = mongoose.Schema.Types.ObjectId;
 *
 * ####Types:
 *
 * - [String](/docs/schematypes.html#strings)
 * - [Number](/docs/schematypes.html#numbers)
 * - [Boolean](/docs/schematypes.html#booleans) | Bool
 * - [Array](/docs/schematypes.html#arrays)
 * - [Buffer](/docs/schematypes.html#buffers)
 * - [Date](/docs/schematypes.html#dates)
 * - [ObjectId](/docs/schematypes.html#objectids) | Oid
 * - [Mixed](/docs/schematypes.html#mixed)
 *
 * Using this exposed access to the `Mixed` SchemaType, we can use them in our schema.
 *
 *     const Mixed = mongoose.Schema.Types.Mixed;
 *     new mongoose.Schema({ _user: Mixed })
 *
 * @api public
 */

Schema.Types = MongooseTypes = require('./schema/index');

/*!
 * ignore
 */

exports.ObjectId = MongooseTypes.ObjectId;