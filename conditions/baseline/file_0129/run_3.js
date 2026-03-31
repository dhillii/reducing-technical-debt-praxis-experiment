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
const queryHooks = require('./helpers/query/applyQueryMiddleware').middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks').middlewareFunctions;
const hookNames = new Set([...queryHooks, ...documentHooks]);

let MongooseTypes;
let id = 0;

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

  this.s = { hooks: new Kareem() };
  this.options = this.defaultOptions(options);

  this._addDefinitions(obj);
  this._setupAutoId();
  this.setupTimestamp(this.options.timestamps);
}

Schema.prototype._addDefinitions = function(obj) {
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
  this._copySchemaState(s);

  s.on('init', v => this.emit('init', v));
  return s;
};

Schema.prototype._copySchemaProperties = function(s) {
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
};

Schema.prototype._copySchemaState = function(s) {
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
  s.aliases = Object.assign({}, this.aliases);

  if (this.discriminatorMapping != null) {
    s.discriminatorMapping = Object.assign({}, this.discriminatorMapping);
  }
  if (this.discriminators != null) {
    s.discriminators = Object.assign({}, this.discriminators);
  }
};

Schema.prototype.pick = function(paths, options) {
  if (!Array.isArray(paths)) {
    throw new MongooseError('Schema#pick() only accepts an array argument, ' +
      `got "${typeof paths}"`);
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
  if (this._isPrototypePollutor(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);
  for (const key of keys) {
    this._addPath(key, obj[key], prefix);
  }

  const addedKeys = keys.map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

Schema.prototype._isPrototypePollutor = function(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
};

Schema.prototype._addPath = function(key, value, prefix) {
  if (utils.specialProperties.has(key)) {
    return;
  }

  const fullPath = prefix + key;

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
    this._setNestedPath(prefix, key, fullPath, value);
  } else if (Object.keys(value).length < 1) {
    this._setNestedPath(prefix, key, fullPath, value);
  } else if (!value[this.options.typeKey] || (this.options.typeKey === 'type' && value.type.type)) {
    this.nested[fullPath] = true;
    this.add(value, fullPath + '.');
  } else {
    this._addTypedPath(prefix, key, value, fullPath);
  }
};

Schema.prototype._setNestedPath = function(prefix, key, fullPath, value) {
  if (prefix) {
    this.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  this.path(prefix + key, value);
};

Schema.prototype._addTypedPath = function(prefix, key, value, fullPath) {
  if (!this.options.typePojoToMixed && utils.isPOJO(value[this.options.typeKey])) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(value[this.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, value, { [this.options.typeKey]: _schema });
    this.path(prefix + key, schemaWrappedPath);
  } else {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(prefix + key, value);
  }
};

Schema.reserved = Object.create(null);
Schema.prototype.reserved = Schema.reserved;

const reserved = Schema.reserved;
['prototype', 'emit', 'listeners', 'on', 'removeListener', 'collection',
  'errors', 'get', 'init', 'isModified', 'isNew', 'populated', 'remove',
  'save', 'toObject', 'validate'].forEach(key => {
  reserved[key] = 1;
});

Schema.prototype.path = function(path, obj) {
  const cleanPath = _pathToPositionalSyntax(path);

  if (obj === undefined) {
    return this._getPathDefinition(path, cleanPath);
  }

  this._validatePathName(path);
  this._validateRef(obj, path);
  this._setPathInTree(path, obj);
  this._registerPath(path, obj);

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

  return hasNumericSubpathRegex.test(path) ? getPositionalPath(this, path) : undefined;
};

Schema.prototype._validatePathName = function(path) {
  const firstPieceOfPath = path.split('.')[0];
  if (reserved[firstPieceOfPath]) {
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
      throw new Error(`Cannot set nested path \`${path}\`. Parent path \`${fullPath}\` already set to type ${branch[sub].name}.`);
    }
    branch = branch[sub];
  }

  branch[last] = utils.clone(obj);
};

Schema.prototype._registerPath = function(path, obj) {
  this.paths[path] = this.interpretAsType(path, obj, this.options);
  const schemaType = this.paths[path];

  this._registerMapPath(path, obj, schemaType);
  this._registerSingleNestedPath(path, schemaType);
  this._registerDocumentArrayPath(path, schemaType);
  this._registerArrayPath(path, schemaType);
};

Schema.prototype._registerMapPath = function(path, obj, schemaType) {
  if (!schemaType.$isSchemaMap) {
    return;
  }