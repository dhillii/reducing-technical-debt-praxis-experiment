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

const HAS_NUMERIC_SUBPATH_REGEX = /\.\d+(\.|$)/;
const RESERVED_PATHS = new Set([
  'prototype', 'emit', 'listeners', 'on', 'removeListener',
  'collection', 'errors', 'get', 'init', 'isModified', 'isNew',
  'populated', 'remove', 'save', 'toObject', 'validate'
]);

let MongooseTypes;
let schemaId = 0;

const queryHooks = require('./helpers/query/applyQueryMiddleware').middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks').middlewareFunctions;
const hookNames = new Set([...queryHooks, ...documentHooks]);

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
  this.$id = ++schemaId;
  this.mapPaths = [];

  this.s = { hooks: new Kareem() };
  this.options = this.defaultOptions(options);

  this._initializePaths(obj);
  this._setupAutoId();
  this.setupTimestamp(this.options.timestamps);
}

Schema.prototype._initializePaths = function(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(definition => this.add(definition));
  } else if (obj) {
    this.add(obj);
  }
};

Schema.prototype._setupAutoId = function() {
  const _idSubDoc = this.obj && this.obj._id && utils.isObject(this.obj._id);
  const shouldAddAutoId = !this.paths['_id'] &&
    (!this.options.noId && this.options._id) && !_idSubDoc;

  if (shouldAddAutoId) {
    addAutoId(this);
  }
};

function aliasFields(schema, paths) {
  paths = paths || Object.keys(schema.paths);
  for (const path of paths) {
    const options = get(schema.paths[path], 'options');
    if (!options || !options.alias) {
      continue;
    }

    const prop = schema.paths[path].path;
    const alias = options.alias;

    if (typeof alias !== 'string') {
      throw new Error(`Invalid value for alias option on ${prop}, got ${alias}`);
    }

    schema.aliases[alias] = prop;
    schema.virtual(alias)
      .get(function() {
        return typeof this.get === 'function' ? this.get(prop) : this[prop];
      })
      .set(function(v) {
        return this.$set(prop, v);
      });
  }
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

Schema.prototype.obj;
Schema.prototype.paths;
Schema.prototype.tree;

Schema.prototype.clone = function() {
  const Constructor = this.base == null ? Schema : this.base.Schema;
  const s = new Constructor({}, this._userProvidedOptions);

  this._copySchemaProperties(s);
  s.childSchemas = gatherChildSchemas(s);
  s.on('init', v => this.emit('init', v));

  return s;
};

Schema.prototype._copySchemaProperties = function(target) {
  target.base = this.base;
  target.obj = this.obj;
  target.options = utils.clone(this.options);
  target.callQueue = this.callQueue.map(f => f);
  target.methods = utils.clone(this.methods);
  target.methodOptions = utils.clone(this.methodOptions);
  target.statics = utils.clone(this.statics);
  target.query = utils.clone(this.query);
  target.plugins = Array.prototype.slice.call(this.plugins);
  target._indexes = utils.clone(this._indexes);
  target.s.hooks = this.s.hooks.clone();
  target.tree = utils.clone(this.tree);
  target.paths = utils.clone(this.paths);
  target.nested = utils.clone(this.nested);
  target.subpaths = utils.clone(this.subpaths);
  target.singleNestedPaths = utils.clone(this.singleNestedPaths);
  target.virtuals = utils.clone(this.virtuals);
  target.$globalPluginsApplied = this.$globalPluginsApplied;
  target.$isRootDiscriminator = this.$isRootDiscriminator;
  target.$implicitlyCreated = this.$implicitlyCreated;
  target.mapPaths = [].concat(this.mapPaths);
  target.aliases = Object.assign({}, this.aliases);

  if (this.discriminatorMapping != null) {
    target.discriminatorMapping = Object.assign({}, this.discriminatorMapping);
  }
  if (this.discriminators != null) {
    target.discriminators = Object.assign({}, this.discriminators);
  }
};

Schema.prototype.pick = function(paths, options) {
  if (!Array.isArray(paths)) {
    throw new MongooseError(`Schema#pick() only accepts an array argument, got "${typeof paths}"`);
  }

  const newSchema = new Schema({}, options || this.options);

  for (const path of paths) {
    if (this.nested[path]) {
      newSchema.add({ [path]: get(this.tree, path) });
    } else {
      const schematype = this.path(path);
      if (schematype == null) {
        throw new MongooseError(`Path \`${path}\` is not in the schema`);
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
    strict: baseOptions.strict ?? true,
    strictQuery: baseOptions.strictQuery ?? false,
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
    typePojoToMixed: baseOptions.typePojoToMixed ?? true
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
  if (['__proto__.', 'constructor.', 'prototype.'].includes(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);

  for (const key of keys) {
    if (utils.specialProperties.has(key)) {
      continue;
    }

    const fullPath = prefix + key;
    this._addPath(key, obj[key], fullPath, prefix);
  }

  const addedKeys = keys.map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

Schema.prototype._addPath = function(key, value, fullPath, prefix) {
  if (value == null) {
    throw new TypeError(`Invalid value for schema path \`${fullPath}\`, got value "${value}"`);
  }

  if (key === '_id' && value === false) {
    return;
  }

  if (value instanceof VirtualType || getConstructorName(value) === 'VirtualType') {
    this.virtual(value);
    return;
  }

  if (Array.isArray(value) && value.length === 1 && value[0] == null) {
    throw new TypeError(`Invalid value for schema Array path \`${fullPath}\`, got value "${value[0]}"`);
  }

  if (!(utils.isPOJO(value) || value instanceof SchemaTypeOptions)) {
    this._setNestedPath(prefix, fullPath, key, value);
  } else if (Object.keys(value).length < 1) {
    this._setNestedPath(prefix, fullPath, key, value);
  } else if (!value[this.options.typeKey] || (this.options.typeKey === 'type' && value.type.type)) {
    this.nested[fullPath] = true;
    this.add(value, fullPath + '.');
  } else {
    this._handleTypeKeyPath(prefix, fullPath, key, value);
  }
};

Schema.prototype._setNestedPath = function(prefix, fullPath, key, value) {
  if (prefix) {
    this.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  this.path(prefix + key, value);
};

Schema.prototype._handleTypeKeyPath = function(prefix, fullPath, key, value) {
  if (!this.options.typePojoToMixed && utils.isPOJO(value[this.options.typeKey])) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(value[this.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, value, { [this.options.typeKey]: _schema });
    this.path(prefix + key, schemaWrappedPath);
  } else {
    this._setNestedPath(prefix, fullPath, key, value);
  }
};

Schema.reserved = Object.create(null);
Schema.prototype.reserved = Schema.reserved;

for (const key of RESERVED_PATHS) {
  Schema.reserved[key] = 1;
}

Schema.prototype.path = function(path, obj) {
  const cleanPath = _pathToPositionalSyntax(path);

  if (obj === undefined) {
    return this._getPathDefinition(path, cleanPath);
  }

  this._validatePathName(path);
  this._validateRef(obj, path);
  this._setPathInTree(path, obj);

  return this;
};

Schema.prototype._getPathDefinition = function(path, cleanPath) {
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

  return HAS_NUMERIC_SUBPATH_REGEX.test(path)
    ? getPositionalPath(this, path)
    : undefined;
};

Schema.prototype._validatePathName = function(path) {
  const firstPieceOfPath = path.split('.')[0];
  if (RESERVED_PATHS.has(firstPieceOfPath)) {
    throw new Error(`\`${firstPieceOfPath}\` may not be used as a schema pathname`);
  }
};

Schema.prototype._validateRef = function(obj, path) {
  if (typeof obj === 'object' && utils.hasUserDefinedProperty(obj, 'ref')) {
    validateRef(obj.ref, path);
  }
};

Schema.prototype._setPathInTree = function(path, obj) {
  const subpaths = path.split(/\./);
  const last = subpaths.pop();
  let branch = this.tree;
  let fullPath = '';

  for (const sub of subpaths) {
    if (utils.specialProperties.has(sub)) {
      throw new Error(`Cannot set special property \`${sub}\` on a schema`);
    }
    fullPath = fullPath += (fullPath.length > 0 ? '.' : '') + sub;
    if (!branch[sub]) {
      this.nested[fullPath] = true;
      branch[sub] = {};
    }
    if (typeof branch[sub] !== 'object') {
      throw new Error(
        `Cannot set nested path \`${path}\`. Parent path \`${fullPath}\` already set to type ${branch[sub].name}.`
      );
    }
    branch = branch[sub];
  }

  branch[last] = utils.clone(obj);
  this.paths[path] = this.interpretAsType(path, obj, this.options);
  this._processSchemaType(path, obj);
};

Schema.prototype._processSchemaType = function(path, obj) {
  const schemaType = this.paths[path];

  if (schemaType.$isSchemaMap) {
    this._processMapType(path, obj, schemaType);
  }

  if (schemaType.$isSingleNested) {
    this._processSingleNestedType(path, schemaType);
  } else if (schemaType.$isMongooseDocumentArray) {
    this._processDocumentArrayType(path, schemaType);
  }

  if (schemaType.$isMongooseArray && schemaType.caster instanceof SchemaType) {
    this._processArrayType(path, schemaType);
  }
};