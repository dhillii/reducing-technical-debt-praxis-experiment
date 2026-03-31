'use strict';

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

const queryHooks = require('./helpers/query/applyQueryMiddleware').middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks').middlewareFunctions;
const hookNames = new Set([...queryHooks, ...documentHooks]);

let id = 0;

// ============================================================================
// CONSTANTS AND UTILITIES
// ============================================================================

const RESERVED_PATHS = Object.freeze({
  prototype: 1,
  emit: 1,
  listeners: 1,
  on: 1,
  removeListener: 1,
  collection: 1,
  errors: 1,
  get: 1,
  init: 1,
  isModified: 1,
  isNew: 1,
  populated: 1,
  remove: 1,
  save: 1,
  toObject: 1,
  validate: 1
});

const INDEX_TYPES = Object.freeze(['2d', '2dsphere', 'hashed', 'text']);

const SAFE_DEPRECATION_WARNING = 'Mongoose: The `safe` option for schemas is ' +
  'deprecated. Use the `writeConcern` option instead: ' +
  'http://bit.ly/mongoose-write-concern';

const DEFAULT_OPTIONS = Object.freeze({
  strict: true,
  strictQuery: false,
  bufferCommands: true,
  capped: false,
  versionKey: '__v',
  optimisticConcurrency: false,
  discriminatorKey: '__t',
  minimize: true,
  autoIndex: null,
  shardKey: null,
  read: null,
  validateBeforeSave: true,
  noId: false,
  _id: true,
  noVirtualId: false,
  id: true,
  typeKey: 'type',
  typePojoToMixed: true
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function _pathToPositionalSyntax(path) {
  if (!/\.\d+/.test(path)) {
    return path;
  }
  return path.replace(/\.\d+\./g, '.$.').replace(/\.\d+$/, '.$');
}

function _getPath(schema, path, cleanPath) {
  if (schema.paths.hasOwnProperty(path)) {
    return schema.paths[path];
  }
  if (schema.subpaths.hasOwnProperty(cleanPath)) {
    return schema.subpaths[cleanPath];
  }
  if (schema.singleNestedPaths.hasOwnProperty(cleanPath) && 
      typeof schema.singleNestedPaths[cleanPath] === 'object') {
    return schema.singleNestedPaths[cleanPath];
  }
  return null;
}

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

function _deletePath(schema, name) {
  const pieces = name.split('.');
  const last = pieces.pop();
  let branch = schema.tree;

  for (const piece of pieces) {
    branch = branch[piece];
  }

  delete branch[last];
}

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

function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

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
    schema
      .virtual(alias)
      .get(function(p) {
        return function() {
          if (typeof this.get === 'function') {
            return this.get(p);
          }
          return this[p];
        };
      }(prop))
      .set(function(p) {
        return function(v) {
          return this.$set(p, v);
        };
      }(prop));
  }
}

const setSafe = util.deprecate(function setSafe(options, value) {
  options.safe = value === false ? { w: 0 } : value;
}, SAFE_DEPRECATION_WARNING);

// ============================================================================
// SCHEMA CONSTRUCTOR
// ============================================================================

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
  this.$id = ++id;
  this.mapPaths = [];

  this.s = {
    hooks: new Kareem()
  };

  this.options = this.defaultOptions(options);

  if (Array.isArray(obj)) {
    for (const definition of obj) {
      this.add(definition);
    }
  } else if (obj) {
    this.add(obj);
  }

  const _idSubDoc = obj && obj._id && utils.isObject(obj._id);
  const auto_id = !this.paths['_id'] &&
      (!this.options.noId && this.options._id) && !_idSubDoc;

  if (auto_id) {
    addAutoId(this);
  }

  this.setupTimestamp(this.options.timestamps);
}

Schema.prototype = Object.create(EventEmitter.prototype);
Schema.prototype.constructor = Schema;
Schema.prototype.instanceOfSchema = true;

Object.defineProperty(Schema.prototype, '$schemaType', {
  configurable: false,
  enumerable: false,
  writable: true
});

Object.defineProperty(Schema.prototype, 'childSchemas', {
  configurable: false,
  enumerable: true,
  writable: true
});

Object.defineProperty(Schema.prototype, 'base', {
  configurable: true,
  enumerable: false,
  writable: true,
  value: null
});

Schema.prototype.obj;
Schema.prototype.paths;
Schema.prototype.tree;

// ============================================================================
// SCHEMA METHODS
// ============================================================================

Schema.prototype.clone = function() {
  const Constructor = this.base == null ? Schema : this.base.Schema;
  const s = new Constructor({}, this._userProvidedOptions);
  
  s.base = this.base;
  s.obj = this.obj;
  s.options = utils.clone(this.options);
  s.callQueue = this.callQueue.map(f => f);
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
  s.on('init', v => this.emit('init', v));

  return s;
};

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

Schema.prototype.defaultOptions = function(options) {
  if (options && options.safe === false) {
    options.safe = { w: 0 };
  }

  if (options && options.safe && options.safe.w === 0) {
    options.versionKey = false;
  }

  this._userProvidedOptions = options == null ? {} : utils.clone(options);

  const baseOptions = get(this, 'base.options', {});
  const mergedOptions = utils.options({
    strict: 'strict' in baseOptions ? baseOptions.strict : DEFAULT_OPTIONS.strict,
    strictQuery: 'strictQuery' in baseOptions ? baseOptions.strictQuery : DEFAULT_OPTIONS.strictQuery,
    bufferCommands: DEFAULT_OPTIONS.bufferCommands,
    capped: DEFAULT_OPTIONS.capped,
    versionKey: DEFAULT_OPTIONS.versionKey,
    optimisticConcurrency: DEFAULT_OPTIONS.optimisticConcurrency,
    discriminatorKey: DEFAULT_OPTIONS.discriminatorKey,
    minimize: DEFAULT_OPTIONS.minimize,
    autoIndex: DEFAULT_OPTIONS.autoIndex,
    shardKey: DEFAULT_OPTIONS.shardKey,
    read: DEFAULT_OPTIONS.read,
    validateBeforeSave: DEFAULT_OPTIONS.validateBeforeSave,
    noId: DEFAULT_OPTIONS.noId,
    _id: DEFAULT_OPTIONS._id,
    noVirtualId: DEFAULT_OPTIONS.noVirtualId,
    id: DEFAULT_OPTIONS.id,
    typeKey: DEFAULT_OPTIONS.typeKey,
    typePojoToMixed: 'typePojoToMixed' in baseOptions ? baseOptions.typePojoToMixed : DEFAULT_OPTIONS.typePojoToMixed
  }, utils.clone(options));

  if (mergedOptions.read) {
    mergedOptions.read = readPref(mergedOptions.read);
  }

  if (mergedOptions.optimisticConcurrency && !mergedOptions.versionKey) {
    throw new MongooseError('Must set `versionKey` if using `optimisticConcurrency`');
  }

  return mergedOptions;
};

Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';
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

    if (key === '_id' && obj[key] === false) {
      continue;
    }

    if (obj[key] instanceof VirtualType || getConstructorName(obj[key]) === 'VirtualType') {
      this.virtual(obj[key]);
      continue;
    }

    if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    this._addPath(fullPath, obj[key], prefix);
  }

  const addedKeys = Object.keys(obj).map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

Schema.prototype._addPath = function(fullPath, value, prefix) {
  if (!(utils.isPOJO(value) || value instanceof SchemaTypeOptions)) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(fullPath, value);
  } else if (Object.keys(value).length < 1) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(fullPath, value);
  } else if (!value[this.options.typeKey] || (this.options.typeKey === 'type' && value.type.type)) {
    this.nested[fullPath] = true;
    this.add(value, fullPath + '.');
  } else {
    this._addPathWithTypeKey(fullPath, value, prefix);