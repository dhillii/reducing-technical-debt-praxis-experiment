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
      .get(function() {
        if (typeof this.get === 'function') {
          return this.get(prop);
        }
        return this[prop];
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
  
  s.base = this.base;
  s.obj = this.obj;
  s.options = utils.clone(this.options);
  s.callQueue = this.callQueue.slice();
  s.methods = utils.clone(this.methods);
  s.methodOptions = utils.clone(this.methodOptions);
  s.statics = utils.clone(this.statics);
  s.query = utils.clone(this.query);
  s.plugins = this.plugins.slice();
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
  s.mapPaths = this.mapPaths.slice();

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
  options = utils.options({
    strict: 'strict' in baseOptions ? baseOptions.strict : true,
    strictQuery: 'strictQuery' in baseOptions ? baseOptions.strictQuery : false,
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
  const isNonPojo = !(utils.isPOJO(value) || value instanceof SchemaTypeOptions);
  const isEmpty = Object.keys(value).length < 1;
  const hasTypeKey = value[this.options.typeKey];
  const isTypeKeyPojo = this.options.typeKey === 'type' && value.type && value.type.type;

  if (isNonPojo) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(fullPath, value);
  } else if (isEmpty) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(fullPath, value);
  } else if (!hasTypeKey || isTypeKeyPojo) {
    this.nested[fullPath] = true;
    this.add(value, fullPath + '.');
  } else {
    this._addPathWithTypeKey(fullPath, value, prefix);
  }
};

Schema.prototype._addPathWithTypeKey = function(fullPath, value, prefix) {
  if (!this.options.typePojoToMixed && utils.isPOJO(value[this.options.typeKey])) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(value[this.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, value, { [this.options.typeKey]: _schema });
    this.path(prefix + fullPath.split('.').pop(), schemaWrappedPath);
  } else {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(fullPath, value);
  }
};

Schema.reserved = Object.create(null);
Schema.prototype.reserved = Schema.reserved;
const reserved = Schema.reserved;

reserved['prototype'] =
reserved.emit =
reserved.listeners =
reserved.on =
reserved.removeListener =
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

Schema.prototype.path = function(path, obj) {
  const cleanPath = _pathToPositionalSyntax(path);
  
  if (obj === undefined) {
    return this._getPathDefinition(path, cleanPath);
  }

  const firstPieceOfPath = path.split('.')[0];
  if (reserved[firstPieceOfPath]) {
    throw new Error('`' + firstPieceOfPath + '` may not be used as a schema pathname');
  }

  if (typeof obj === 'object' && utils.hasUserDefinedProperty(obj, 'ref')) {
    validateRef(obj.ref, path);
  }

  this._setPathInTree(path, obj);
  this._registerPathType(path, obj, cleanPath);

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

  return hasNumericSubpathRegex.test(path)
    ? getPositionalPath(this, path)
    : undefined;
};

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
      const msg = 'Cannot set nested path `' + path + '`. ' +
          'Parent path `' + fullPath + '` already set to type ' + branch[sub].name + '.';
      throw new Error(msg);
    }
    branch = branch[sub];
  }

  branch[last] = utils.clone(obj);
};

Schema.prototype._registerPathType = function(path, obj, cleanPath) {
  this.paths[path] = this.interpretAsType(path, obj, this.options);
  const schemaType = this.paths[path];

  if (schemaType.$isSchemaMap) {
    this._registerMapPath(path, obj, schemaType);
  }

  if (schemaType.$isSingleNested) {
    this._registerSingleNestedPath(path, schemaType);
  } else if (schemaType.$isMongooseDocumentArray) {
    this._registerDocumentArrayPath(schemaType);
  }

  if (schemaType.$isMongooseArray && schemaType.caster instanceof SchemaType) {
    this._registerArraySubpaths(path, schemaType);
  }

  if (schemaType.$