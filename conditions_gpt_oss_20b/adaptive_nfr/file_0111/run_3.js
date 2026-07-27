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

/**
 * Helper predicates for Schema.prototype.add
 */

/**
 * @param {*} val
 * @returns {boolean}
 */
function isSchemaInstance(val) {
  return val instanceof Schema || (val != null && val.instanceOfSchema);
}

/**
 * @param {Object} obj
 * @param {string|null} prefix
 * @returns {boolean}
 */
function isSpecialIdFalse(obj, prefix) {
  return obj._id === false && prefix == null;
}

/**
 * @param {string} prefix
 * @returns {boolean}
 */
function isPrototypePollution(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function isSpecialProperty(key) {
  return utils.specialProperties.has(key);
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isNullish(value) {
  return value == null;
}

/**
 * @param {*} val
 * @returns {boolean}
 */
function isVirtualType(val) {
  return val instanceof VirtualType || get(val, 'constructor.name', null) === 'VirtualType';
}

/**
 * @param {*} val
 * @returns {boolean}
 */
function isInvalidArray(val) {
  return Array.isArray(val) && val.length === 1 && val[0] == null;
}

/**
 * @param {*} val
 * @returns {boolean}
 */
function isNonOptions(val) {
  return !(utils.isPOJO(val) || val instanceof SchemaTypeOptions);
}

/**
 * @param {*} val
 * @returns {boolean}
 */
function isEmptyObject(val) {
  return utils.isPOJO(val) && Object.keys(val).length < 1;
}

/**
 * @param {Object} val
 * @param {string} typeKey
 * @returns {boolean}
 */
function hasNoTypeKey(val, typeKey) {
  return !val[typeKey] || (typeKey === 'type' && val.type && val.type.type);
}

/**
 * @param {Object} val
 * @param {string} typeKey
 * @returns {boolean}
 */
function shouldCreateSubdocument(val, typeKey, options) {
  return !options.typePojoToMixed && utils.isPOJO(val[typeKey]);
}

Schema.prototype.add = function add(obj, prefix) {
  if (isSchemaInstance(obj)) {
    merge(this, obj);
    return this;
  }

  if (isSpecialIdFalse(obj, prefix)) {
    this.options._id = false;
  }

  prefix = prefix || '';

  if (isPrototypePollution(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);

  for (const key of keys) {
    if (isSpecialProperty(key)) {
      continue;
    }

    const fullPath = prefix + key;
    const value = obj[key];

    if (isNullish(value)) {
      throw new TypeError('Invalid value for schema path `' + fullPath + '`, got value "' + value + '"');
    }

    if (key === '_id' && value === false) {
      continue;
    }

    if (isVirtualType(value)) {
      this.virtual(value);
      continue;
    }

    if (isInvalidArray(value)) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath + '`, got value "' + value[0] + '"');
    }

    if (isNonOptions(value)) {
      if (prefix) {
        this.nested[prefix.slice(0, -1)] = true;
      }
      this.path(prefix + key, value);
      continue;
    }

    if (isEmptyObject(value)) {
      if (prefix) {
        this.nested[prefix.slice(0, -1)] = true;
      }
      this.path(fullPath, value);
      continue;
    }

    if (hasNoTypeKey(value, this.options.typeKey)) {
      this.nested[fullPath] = true;
      this.add(value, fullPath + '.');
      continue;
    }

    if (shouldCreateSubdocument(value, this.options.typeKey, this.options)) {
      if (prefix) {
        this.nested[prefix.slice(0, -1)] = true;
      }
      const opts = { typePojoToMixed: false };
      const _schema = new Schema(value[this.options.typeKey], opts);
      const schemaWrappedPath = Object.assign({}, value, { [this.options.typeKey]: _schema });
      this.path(prefix + key, schemaWrappedPath);
    } else {
      if (prefix) {
        this.nested[prefix.slice(0, -1)] = true;
      }
      this.path(prefix + key, value);
    }
  }

  const addedKeys = keys.map(k => prefix ? prefix + k : k);
  aliasFields(this, addedKeys);
  return this;
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
    let schematype = _getPath(this, path, cleanPath);
    if (schematype != null) {
      return schematype;
    }

    // Look for maps
    const mapPath = getMapPath(this, path);
    if (mapPath != null) {
      return mapPath;
    }

    // Look if a parent of this path is mixed
    schematype = this.hasMixedParent(cleanPath);
    if (schematype != null) {
      return schematype;
    }

    // subpaths?
    return hasNumericSubpathRegex.test(path)
      ? getPositionalPath(this, path)
      : undefined;
  }

  // some path names conflict with document methods
  const firstPieceOfPath = path.split('.')[0];
  if (reserved[firstPieceOfPath]) {
    throw new Error('`' + firstPieceOfPath + '` may not be used as a schema pathname');
  }

  if (typeof obj === 'object' && utils.hasUserDefinedProperty(obj, 'ref')) {
    validateRef(obj.ref, path);
  }

  // update the tree
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

  this.paths[path] = this.interpretAsType(path, obj, this.options);
  const schemaType = this.paths[path];

  if (schemaType.$isSchemaMap) {
    // Maps can have arbitrary keys, so `$*` is internal shorthand for "any key"
    // The '$' is to imply this path should never be stored in MongoDB so we
    // can easily build a regexp out of this path, and '*' to imply "any key."
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

    this.paths[mapPath] = this.interpretAsType(mapPath,
      _mapType, this.options);
    this.mapPaths.push(this.paths[mapPath]);
    schemaType.$__schemaType = this.paths[mapPath];
  }

  if (schemaType.$isSingleNested) {
    for (const key of Object.keys(schemaType.schema.paths)) {
      this.singleNestedPaths[path + '.' + key] = schemaType.schema.paths[key];
    }
    for (const key of Object.keys(schemaType.schema.singleNestedPaths)) {
      this.singleNestedPaths[path + '.' + key] =
        schemaType.schema.singleNestedPaths[key];
    }
    for (const key of Object.keys(schemaType.schema.subpaths)) {
      this.singleNestedPaths[path + '.' + key] =
        schemaType.schema.subpaths[key];
    }
    for (const key of Object.keys(schemaType.schema.nested)) {
      this.singleNestedPaths[path + '.' + key] = 'nested';
    }

    Object.defineProperty(schemaType.schema, 'base', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: this.base
    });

    schemaType.caster.base = this.base;
    this.childSchemas.push({
      schema: schemaType.schema,
      model: schemaType.caster
    });
  } else if (schemaType.$isMongooseDocumentArray) {
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
  }

  if (schemaType.$isMongooseArray && schemaType.caster instanceof SchemaType) {
    let arrayPath = path;
    let _schemaType = schemaType;

    const toAdd = [];
    while (_schemaType.$isMongooseArray) {
      arrayPath = arrayPath + '.$';

      // Skip arrays of document arrays
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

    for (const _schemaType of toAdd) {
      this.subpaths[_schemaType.path] = _schemaType;
    }
  }

  if (schemaType.$isMongooseDocumentArray) {
    for (const key of Object.keys(schemaType.schema.paths)) {
      const _schemaType = schemaType.schema.paths[key];
      this.subpaths[path + '.' + key] = _schemaType;
      if (typeof _schemaType === 'object' && _schemaType != null) {
        _schemaType.$isUnderneathDocArray = true;
      }
    }
    for (const key of Object.keys(schemaType.schema.subpaths)) {
      const _schemaType = schemaType.schema.subpaths[key];
      this.subpaths[path + '.' + key] = _schemaType;
      if (typeof _schemaType === 'object' && _schemaType != null) {
        _schemaType.$isUnderneathDocArray = true;
      }
    }
    for (const key of Object.keys(schemaType.schema.singleNestedPaths)) {
      const _schemaType = schemaType.schema.singleNestedPaths[key];
      this.subpaths[path + '.' + key] = _schemaType;
      if (typeof _schemaType === 'object' && _schemaType != null) {
        _schemaType.$isUnderneathDocArray = true;
      }
    }
  }

  return this;
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
    if (obj.path === path) {
      return obj;
    }
    const clone = obj.clone();
    clone.path = path;
    return clone;
  }

  // If this schema has an associated Mongoose object, use the Mongoose object's
  // copy of SchemaTypes re: gh-7158 gh-6933
  const MongooseTypes = this.base != null ? this.base.Schema.Types : Schema.Types;

  if (!utils.isPOJO(obj) && !(obj instanceof SchemaTypeOptions)) {
    const constructorName = utils.getFunctionName(obj.constructor);
    if (constructorName !== 'Object') {
      const oldObj = obj;
      obj = {};
      obj[options.typeKey] = oldObj;
    }
  }

  // Get the type making sure to allow keys named "type"
  // and default to mixed if not specified.
  // { type: { type: String, default: 'freshcut' } }
  let type = obj[options.typeKey] && (options.typeKey !== 'type' || !obj.type.type)
    ? obj[options.typeKey]
    : {};
  let name;

  if (utils.isPOJO(type) || type === 'mixed') {
    return new MongooseTypes.Mixed(path, obj);
  }

  if (Array.isArray(type) || type === Array || type === 'array' || type === MongooseTypes.Array) {
    // if it was specified through { type } look for `cast`
    let cast = (type === Array || type === 'array')
      ? obj.cast || obj.of
      : type[0];

    if (cast && cast.instanceOfSchema) {
      if (!(cast instanceof Schema)) {
        throw new TypeError('Schema for array path `' + path +
          '` is from a different copy of the Mongoose module. Please make sure you\'re using the same version ' +
          'of Mongoose everywhere with `npm list mongoose`.');
      }
      return new MongooseTypes.DocumentArray(path, cast, obj);
    }
    if (cast &&
        cast[options.typeKey] &&
        cast[options.typeKey].instanceOfSchema) {
      if (!(cast[options.typeKey] instanceof Schema)) {
        throw new TypeError('Schema for array path `' + path +
          '` is from a different copy of the Mongoose module. Please make sure you\'re using the same version ' +
          'of Mongoose everywhere with `npm list mongoose`.');
      }
      return new MongooseTypes.DocumentArray(path, cast[options.typeKey], obj, cast);
    }

    if (Array.isArray(cast)) {
      return new MongooseTypes.Array(path, this.interpretAsType(path, cast, options), obj);
    }

    if (typeof cast === 'string') {
      cast = MongooseTypes[cast.charAt(0).toUpperCase() + cast.substring(1)];
    } else if (cast && (!cast[options.typeKey] || (options.typeKey === 'type' && cast.type.type))
        && utils.isPOJO(cast)) {
      if (Object.keys(cast).length) {
        // The `minimize` and `typeKey` options propagate to child schemas
        // declared inline, like `{ arr: [{ val: { $type: String } }] }`.
        // See gh-3560
        const childSchemaOptions = { minimize: options.minimize };
        if (options.typeKey) {
          childSchemaOptions.typeKey = options.typeKey;
        }
        // propagate 'strict' option to child schema
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

        const childSchema = new Schema(cast, childSchemaOptions);
        childSchema.$implicitlyCreated = true;
        return new MongooseTypes.DocumentArray(path, childSchema, obj);
      } else {
        // Special case: empty object becomes mixed
        return new MongooseTypes.Array(path, MongooseTypes.Mixed, obj);
      }
    }

    if (cast) {
      type = cast[options.typeKey] && (options.typeKey !== 'type' || !cast.type.type)
        ? cast[options.typeKey]
        : cast;

      name = typeof type === 'string'
        ? type
        : type.schemaName || utils.getFunctionName(type);

      // For Jest 26+, see #10296
      if (name === 'ClockDate') {
        name = 'Date';
      }

      if (!MongooseTypes.hasOwnProperty(name)) {
        throw new TypeError('Invalid schema configuration: ' +
          `\`${name}\` is not a valid type within the array \`${path}\`.` +
          'See http://bit.ly/mongoose-schematypes for a list of valid schema types.');
      }
    }

    return new MongooseTypes.Array(path, cast || MongooseTypes.Mixed, obj, options);
  }

  if (type && type.instanceOfSchema) {
    return new MongooseTypes.Embedded(type, path, obj);
  }

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
      if (val.$isMongooseDocumentArray) {
        val = val.$embeddedSchemaType;
      } else if (val instanceof MongooseTypes.Array) {
        // StringSchema, NumberSchema, etc
        val = val.caster;
      } else {
        val = undefined;
      }
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
 *     toySchema.pre(/^find/, function(this.getFilter());
 *
 * @param {String|RegExp} The method name or regular expression to match method name
 * @param {Object} [options]
 * @param {Boolean} [options.document] If `name` is a hook for both document and query middleware, set to `true` to run on document middleware. For example, set `options.document` to `true` to apply this hook to Document#deleteOne() rather than Query#deleteOne().
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
 * If a hash of name/fn pairs is passed as the only argument, each name

... (rest of file unchanged)