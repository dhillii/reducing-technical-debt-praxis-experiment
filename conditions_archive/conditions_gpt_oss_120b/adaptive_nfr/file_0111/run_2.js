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
const queryHooks = require('./helpers/query/applyQueryMiddleware').middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks').middlewareFunctions;
const hookNames = queryHooks.concat(documentHooks).reduce((s, hook) => s.add(hook), new Set());
let id = 0;

/**
 * Schema constructor.
 *
 * @param {Object|Schema|Array} [definition]
 * @param {Object} [options]
 * @inherits NodeJS EventEmitter http://nodejs.org/api/events.html#events_class_events_eventemitter
 * @event `init`
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
  this.$id = ++id;
  this.mapPaths = [];
  this.s = { hooks: new Kareem() };
  this.options = this.defaultOptions(options);
  if (Array.isArray(obj)) {
    for (const definition of obj) this.add(definition);
  } else if (obj) {
    this.add(obj);
  }
  const _idSubDoc = obj && obj._id && utils.isObject(obj._id);
  const auto_id = !this.paths['_id'] && (!this.options.noId && this.options._id) && !_idSubDoc;
  if (auto_id) addAutoId(this);
  this.setupTimestamp(this.options.timestamps);
}

/*!
 * Create virtual properties with alias field
 */
function aliasFields(schema, paths) {
  paths = paths || Object.keys(schema.paths);
  for (const path of paths) {
    const options = get(schema.paths[path], 'options');
    if (!options) continue;
    const prop = schema.paths[path].path;
    const alias = options.alias;
    if (!alias) continue;
    if (typeof alias !== 'string') {
      throw new Error('Invalid value for alias option on ' + prop + ', got ' + alias);
    }
    schema.aliases[alias] = prop;
    schema.virtual(alias)
      .get((function (p) {
        return function () {
          return typeof this.get === 'function' ? this.get(p) : this[p];
        };
      })(prop))
      .set((function (p) {
        return function (v) {
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

/**
 * Returns a deep copy of the schema
 * @return {Schema}
 * @api public
 */
Schema.prototype.clone = function () {
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

/**
 * Returns a new schema that has the picked `paths` from this schema.
 * @param {Array} paths
 * @param {Object} [options]
 * @return {Schema}
 * @api public
 */
Schema.prototype.pick = function (paths, options) {
  const newSchema = new Schema({}, options || this.options);
  if (!Array.isArray(paths)) {
    throw new MongooseError('Schema#pick() only accepts an array argument, got "' + typeof paths + '"');
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
 * @param {Object} options
 * @return {Object}
 * @api private
 */
Schema.prototype.defaultOptions = function (options) {
  if (options && options.safe === false) options.safe = { w: 0 };
  if (options && options.safe && options.safe.w === 0) options.versionKey = false;
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
  if (options.read) options.read = readPref(options.read);
  if (options.optimisticConcurrency && !options.versionKey) {
    throw new MongooseError('Must set `versionKey` if using `optimisticConcurrency`');
  }
  return options;
};

/**
 * Guard: is schema instance?
 * @param {*} obj
 * @returns {boolean}
 */
function isSchemaInstance(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
}

/**
 * Guard: is top‑level `_id` set to false?
 * @param {*} obj
 * @param {string} prefix
 * @returns {boolean}
 */
function isTopLevelIdFalse(obj, prefix) {
  return obj._id === false && prefix == null;
}

/**
 * Guard: prototype pollution prefix?
 * @param {string} prefix
 * @returns {boolean}
 */
function isPrototypePollution(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

/**
 * Guard: special property?
 * @param {string} key
 * @returns {boolean}
 */
function isSpecialProperty(key) {
  return utils.specialProperties.has(key);
}

/**
 * Guard: invalid value for schema path?
 * @param {*} value
 * @returns {boolean}
 */
function isInvalidValue(value) {
  return value == null;
}

/**
 * Guard: virtual type?
 * @param {*} val
 * @returns {boolean}
 */
function isVirtualType(val) {
  return val instanceof VirtualType || get(val, 'constructor.name', null) === 'VirtualType';
}

/**
 * Guard: array with single null element?
 * @param {*} val
 * @returns {boolean}
 */
function isArrayInvalid(val) {
  return Array.isArray(val) && val.length === 1 && val[0] == null;
}

/**
 * Guard: plain object or SchemaTypeOptions?
 * @param {*} val
 * @returns {boolean}
 */
function isNonPOJOOrOptions(val) {
  return !(utils.isPOJO(val) || val instanceof SchemaTypeOptions);
}

/**
 * Guard: empty object?
 * @param {Object} obj
 * @returns {boolean}
 */
function isEmptyObject(obj) {
  return Object.keys(obj).length < 1;
}

/**
 * Guard: missing type key?
 * @param {Object} obj
 * @param {Object} options
 * @returns {boolean}
 */
function isMissingTypeKey(obj, options) {
  return !obj[options.typeKey] || (options.typeKey === 'type' && obj.type && obj.type.type);
}

/**
 * Guard: type key present and POJO?
 * @param {Object} obj
 * @param {Object} options
 * @returns {boolean}
 */
function isPojoWithTypeKey(obj, options) {
  return utils.isPOJO(obj[options.typeKey]);
}

/**
 * Adds key path / schema type pairs to this schema.
 * @param {Object|Schema} obj
 * @param {String} [prefix]
 * @return {Schema}
 * @api public
 */
Schema.prototype.add = function add(obj, prefix) {
  if (isSchemaInstance(obj)) {
    merge(this, obj);
    return this;
  }
  if (isTopLevelIdFalse(obj, prefix)) this.options._id = false;
  prefix = prefix || '';
  if (isPrototypePollution(prefix)) return this;
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (isSpecialProperty(key)) continue;
    const fullPath = prefix + key;
    if (isInvalidValue(obj[key])) {
      throw new TypeError('Invalid value for schema path `' + fullPath + '`, got value "' + obj[key] + '"');
    }
    if (key === '_id' && obj[key] === false) continue;
    if (isVirtualType(obj[key])) {
      this.virtual(obj[key]);
      continue;
    }
    if (isArrayInvalid(obj[key])) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath + '`, got value "' + obj[key][0] + '"');
    }
    if (isNonPOJOOrOptions(obj[key])) {
      handleNonPOJOOrOption(this, prefix, key, obj[key]);
    } else if (isEmptyObject(obj[key])) {
      handleEmptyObject(this, prefix, key, obj[key]);
    } else if (isMissingTypeKey(obj[key], this.options)) {
      this.nested[fullPath] = true;
      this.add(obj[key], fullPath + '.');
    } else {
      handleWithTypeKey(this, prefix, key, obj[key]);
    }
  }
  const addedKeys = Object.keys(obj).map(key => (prefix ? prefix + key : key));
  aliasFields(this, addedKeys);
  return this;
};

/**
 * Handles non‑POJO values or SchemaTypeOptions.
 * @param {Schema} schema
 * @param {string} prefix
 * @param {string} key
 * @param {*} value
 */
function handleNonPOJOOrOption(schema, prefix, key, value) {
  if (prefix) schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  schema.path(prefix + key, value);
}

/**
 * Handles empty object (interpreted as Mixed).
 * @param {Schema} schema
 * @param {string} prefix
 * @param {string} key
 * @param {Object} value
 */
function handleEmptyObject(schema, prefix, key, value) {
  if (prefix) schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  schema.path(prefix + key, value);
}

/**
 * Handles objects that contain a type key.
 * @param {Schema} schema
 * @param {string} prefix
 * @param {string} key
 * @param {Object} value
 */
function handleWithTypeKey(schema, prefix, key, value) {
  const fullPath = prefix + key;
  if (!schema.options.typePojoToMixed && isPojoWithTypeKey(value, schema.options)) {
    if (prefix) schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(value[schema.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, value, { [schema.options.typeKey]: _schema });
    schema.path(fullPath, schemaWrappedPath);
  } else {
    if (prefix) schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    schema.path(fullPath, value);
  }
}

/**
 * Reserved document keys.
 */
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

/**
 * Gets/sets schema paths.
 * @param {String} path
 * @param {Object} [obj]
 * @api public
 */
Schema.prototype.path = function (path, obj) {
  const cleanPath = _pathToPositionalSyntax(path);
  if (obj === undefined) return getPathForRead(this, path, cleanPath);
  if (isReservedFirstPiece(path)) throw new Error('`' + path.split('.')[0] + '` may not be used as a schema pathname');
  if (typeof obj === 'object' && utils.hasUserDefinedProperty(obj, 'ref')) validateRef(obj.ref, path);
  return setPath(this, path, obj, cleanPath);
};

/**
 * Guard: first piece of path is reserved?
 * @param {string} path
 * @returns {boolean}
 */
function isReservedFirstPiece(path) {
  const first = path.split('.')[0];
  return reserved[first];
}

/**
 * Retrieves a path for read operations.
 * @param {Schema} schema
 * @param {string} path
 * @param {string} cleanPath
 * @returns {*}
 */
function getPathForRead(schema, path, cleanPath) {
  let schematype = _getPath(schema, path, cleanPath);
  if (schematype != null) return schematype;
  const mapPath = getMapPath(schema, path);
  if (mapPath != null) return mapPath;
  schematype = schema.hasMixedParent(cleanPath);
  if (schematype != null) return schematype;
  return hasNumericSubpathRegex.test(path) ? getPositionalPath(schema, path) : undefined;
}

/**
 * Sets a path for write operations.
 * @param {Schema} schema
 * @param {string} path
 * @param {Object} obj
 * @param {string} cleanPath
 * @returns {Schema}
 */
function setPath(schema, path, obj, cleanPath) {
  const subpaths = path.split('.');
  const last = subpaths.pop();
  let branch = schema.tree;
  let fullPath = '';
  for (const sub of subpaths) {
    if (utils.specialProperties.has(sub)) throw new Error('Cannot set special property `' + sub + '` on a schema');
    fullPath = fullPath.length ? `${fullPath}.${sub}` : sub;
    if (!branch[sub]) {
      schema.nested[fullPath] = true;
      branch[sub] = {};
    }
    if (typeof branch[sub] !== 'object') {
      throw new Error('Cannot set nested path `' + path + '`. Parent path `' + fullPath + '` already set to type ' + branch[sub].name + '.');
    }
    branch = branch[sub];
  }
  branch[last] = utils.clone(obj);
  schema.paths[path] = schema.interpretAsType(path, obj, schema.options);
  const schemaType = schema.paths[path];
  if (schemaType.$isSchemaMap) handleSchemaMap(schema, path, obj, schemaType);
  if (schemaType.$isSingleNested) handleSingleNested(schema, path, schemaType);
  else if (schemaType.$isMongooseDocumentArray) handleDocumentArray(schema, path, schemaType);
  if (schemaType.$isMongooseArray && schemaType.caster instanceof SchemaType) handleMongooseArray(schema, path, schemaType);
  if (schemaType.$isMongooseDocumentArray) handleDocArraySubpaths(schema, path, schemaType);
  return schema;
}

/**
 * Handles schema map paths.
 */
function handleSchemaMap(schema, path, obj, schemaType) {
  const mapPath = path + '.$*';
  let _mapType = { type: {} };
  if (utils.hasUserDefinedProperty(obj, 'of')) {
    const isInline = utils.isPOJO(obj.of) && Object.keys(obj.of).length > 0 && !utils.hasUserDefinedProperty(obj.of, schema.options.typeKey);
    _mapType = isInline ? new Schema(obj.of) : obj.of;
  }
  if (utils.hasUserDefinedProperty(obj, 'ref')) _mapType = { type: _mapType, ref: obj.ref };
  schema.paths[mapPath] = schema.interpretAsType(mapPath, _mapType, schema.options);
  schema.mapPaths.push(schema.paths[mapPath]);
  schemaType.$__schemaType = schema.paths[mapPath];
}

/**
 * Handles single nested paths.
 */
function handleSingleNested(schema, path, schemaType) {
  for (const key of Object.keys(schemaType.schema.paths)) {
    schema.singleNestedPaths[`${path}.${key}`] = schemaType.schema.paths[key];
  }
  for (const key of Object.keys(schemaType.schema.singleNestedPaths)) {
    schema.singleNestedPaths[`${path}.${key}`] = schemaType.schema.singleNestedPaths[key];
  }
  for (const key of Object.keys(schemaType.schema.subpaths)) {
    schema.singleNestedPaths[`${path}.${key}`] = schemaType.schema.subpaths[key];
  }
  for (const key of Object.keys(schemaType.schema.nested)) {
    schema.singleNestedPaths[`${path}.${key}`] = 'nested';
  }
  Object.defineProperty(schemaType.schema, 'base', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: schema.base
  });
  schemaType.caster.base = schema.base;
  schema.childSchemas.push({ schema: schemaType.schema, model: schemaType.caster });
}

/**
 * Handles document array paths.
 */
function handleDocumentArray(schema, path, schemaType) {
  Object.defineProperty(schemaType.schema, 'base', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: schema.base
  });
  schemaType.casterConstructor.base = schema.base;
  schema.childSchemas.push({ schema: schemaType.schema, model: schemaType.casterConstructor });
}

/**
 * Handles mongoose array paths.
 */
function handleMongooseArray(schema, path, schemaType) {
  let arrayPath = path;
  let _schemaType = schemaType;
  const toAdd = [];
  while (_schemaType.$isMongooseArray) {
    arrayPath = `${arrayPath}.$`;
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
  for (const t of toAdd) schema.subpaths[t.path] = t;
}

/**
 * Handles subpaths for document arrays.
 */
function handleDocArraySubpaths(schema, path, schemaType) {
  for (const key of Object.keys(schemaType.schema.paths)) {
    const _schemaType = schemaType.schema.paths[key];
    schema.subpaths[`${path}.${key}`] = _schemaType;
    if (typeof _schemaType === 'object' && _schemaType != null) _schemaType.$isUnderneathDocArray = true;
  }
  for (const key of Object.keys(schemaType.schema.subpaths)) {
    const _schemaType = schemaType.schema.subpaths[key];
    schema.subpaths[`${path}.${key}`] = _schemaType;
    if (typeof _schemaType === 'object' && _schemaType != null) _schemaType.$isUnderneathDocArray = true;
  }
  for (const key of Object.keys(schemaType.schema.singleNestedPaths)) {
    const _schemaType = schemaType.schema.singleNestedPaths[key];
    schema.subpaths[`${path}.${key}`] = _schemaType;
    if (typeof _schemaType === 'object' && _schemaType != null) _schemaType.$isUnderneathDocArray = true;
  }
}

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
  if (schema.paths.hasOwnProperty(path)) return schema.paths[path];
  if (schema.subpaths.hasOwnProperty(cleanPath)) return schema.subpaths[cleanPath];
  if (schema.singleNestedPaths.hasOwnProperty(cleanPath) && typeof schema.singleNestedPaths[cleanPath] === 'object') {
    return schema.singleNestedPaths[cleanPath];
  }
  return null;
}

/*!
 * ignore
 */
function _pathToPositionalSyntax(path) {
  if (!/\.\d+/.test(path)) return path;
  return path.replace(/\.\d+\./g, '.$.').replace(/\.\d+$/, '.$');
}

/*!
 * ignore
 */
function getMapPath(schema, path) {
  if (schema.mapPaths.length === 0) return null;
  for (const val of schema.mapPaths) {
    const _path = val.path;
    const re = new RegExp('^' + _path.replace(/\.\$\*/g, '\\.[^.]+') + '$');
    if (re.test(path)) return schema.paths[_path];
  }
  return null;
}

/**
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
 * @param {String} path
 * @param {Object} obj
 * @param {Object} options
 * @api private
 */
Schema.prototype.interpretAsType = function (path, obj, options) {
  if (obj instanceof SchemaType) {
    if (obj.path === path) return obj;
    const clone = obj.clone();
    clone.path = path;
    return clone;
  }
  const MongooseTypes = this.base != null ? this.base.Schema.Types : Schema.Types;
  if (!utils.isPOJO(obj) && !(obj instanceof SchemaTypeOptions)) {
    const constructorName = utils.getFunctionName(obj.constructor);
    if (constructorName !== 'Object') {
      const oldObj = obj;
      obj = {};
      obj[options.typeKey] = oldObj;
    }
  }
  let type = obj[options.typeKey] && (options.typeKey !== 'type' || !obj.type.type) ? obj[options.typeKey] : {};
  let name;
  if (utils.isPOJO(type) || type === 'mixed') return new MongooseTypes.Mixed(path, obj);
  if (Array.isArray(type) || type === Array || type === 'array' || type === MongooseTypes.Array) {
    let cast = (type === Array || type === 'array') ? obj.cast || obj.of : type[0];
    if (cast && cast.instanceOfSchema) {
      if (!(cast instanceof Schema)) {
        throw new TypeError('Schema for array path `' + path + '` is from a different copy of the Mongoose module.');
      }
      return new MongooseTypes.DocumentArray(path, cast, obj);
    }
    if (cast && cast[options.typeKey] && cast[options.typeKey].instanceOfSchema) {
      if (!(cast[options.typeKey] instanceof Schema)) {
        throw new TypeError('Schema for array path `' + path + '` is from a different copy of the Mongoose module.');
      }
      return new MongooseTypes.DocumentArray(path, cast[options.typeKey], obj, cast);
    }
    if (Array.isArray(cast)) return new MongooseTypes.Array(path, this.interpretAsType(path, cast, options), obj);
    if (typeof cast === 'string') cast = MongooseTypes[cast.charAt(0).toUpperCase() + cast.substring(1)];
    else if (cast && (!cast[options.typeKey] || (options.typeKey === 'type' && cast.type.type)) && utils.isPOJO(cast)) {
      if (Object.keys(cast).length) {
        const childSchemaOptions = { minimize: options.minimize };
        if (options.typeKey) childSchemaOptions.typeKey = options.typeKey;
        if (options.hasOwnProperty('strict')) childSchemaOptions.strict = options.strict;
        if (options.hasOwnProperty('typePojoToMixed')) childSchemaOptions.typePojoToMixed = options.typePojoToMixed;
        if (this._userProvidedOptions.hasOwnProperty('_id')) childSchemaOptions._id = this._userProvidedOptions._id;
        else if (Schema.Types.DocumentArray.defaultOptions && Schema.Types.DocumentArray.defaultOptions._id != null) childSchemaOptions._id = Schema.Types.DocumentArray.defaultOptions._id;
        const childSchema = new Schema(cast, childSchemaOptions);
        childSchema.$implicitlyCreated = true;
        return new MongooseTypes.DocumentArray(path, childSchema, obj);
      } else {
        return new MongooseTypes.Array(path, MongooseTypes.Mixed, obj);
      }
    }
    if (cast) {
      type = cast[options.typeKey] && (options.typeKey !== 'type' || !cast.type.type) ? cast[options.typeKey] : cast;
      name = typeof type === 'string' ? type : type.schemaName || utils.getFunctionName(type);
      if (name === 'ClockDate') name = 'Date';
      if (!MongooseTypes.hasOwnProperty(name)) {
        throw new TypeError('Invalid schema configuration: `' + name + '` is not a valid type within the array `' + path + '`.');
      }
    }
    return new MongooseTypes.Array(path, cast || MongooseTypes.Mixed, obj, options);
  }
  if (type && type.instanceOfSchema) return new MongooseTypes.Embedded(type, path, obj);
  if (Buffer.isBuffer(type)) name = 'Buffer';
  else if (typeof type === 'function' || typeof type === 'object') name = type.schemaName || utils.getFunctionName(type);
  else name = type == null ? '' + type : type.toString();
  if (name) name = name.charAt(0).toUpperCase() + name.substring(1);
  if (name === 'ObjectID') name = 'ObjectId';
  if (name === 'ClockDate') name = 'Date';
  if (MongooseTypes[name] == null) {
    throw new TypeError(`Invalid schema configuration: \`${name}\` is not a valid type at path \`${path}\`.`);
  }
  return new MongooseTypes[name](path, obj);
};

/**
 * Iterates the schemas paths similar to Array#forEach.
 * @param {Function} fn
 * @return {Schema}
 * @api public
 */
Schema.prototype.eachPath = function (fn) {
  const keys = Object.keys(this.paths);
  const len = keys.length;
  for (let i = 0; i < len; ++i) fn(keys[i], this.paths[keys[i]]);
  return this;
};

/**
 * Returns an Array of path strings that are required by this schema.
 * @param {Boolean} invalidate
 * @return {Array}
 * @api public
 */
Schema.prototype.requiredPaths = function requiredPaths(invalidate) {
  if (this._requiredpaths && !invalidate) return this._requiredpaths;
  const paths = Object.keys(this.paths);
  let i = paths.length;
  const ret = [];
  while (i--) {
    const path = paths[i];
    if (this.paths[path].isRequired) ret.push(path);
  }
  this._requiredpaths = ret;
  return this._requiredpaths;
};

/**
 * Returns indexes from fields and schema-level indexes (cached).
 * @api private
 * @return {Array}
 */
Schema.prototype.indexedPaths = function indexedPaths() {
  if (this._indexedpaths) return this._indexedpaths;
  this._indexedpaths = this.indexes();
  return this._indexedpaths;
};

/**
 * Returns the pathType of `path` for this schema.
 * @param {String} path
 * @return {String}
 * @api public
 */
Schema.prototype.pathType = function (path) {
  const cleanPath = _pathToPositionalSyntax(path);
  if (this.paths.hasOwnProperty(path)) return 'real';
  if (this.virtuals.hasOwnProperty(path)) return 'virtual';
  if (this.nested.hasOwnProperty(path)) return 'nested';
  if (this.subpaths.hasOwnProperty(cleanPath) || this.subpaths.hasOwnProperty(path)) return 'real';
  const singleNestedPath = this.singleNestedPaths.hasOwnProperty(cleanPath) || this.singleNestedPaths.hasOwnProperty(path);
  if (singleNestedPath) return singleNestedPath === 'nested' ? 'nested' : 'real';
  const mapPath = getMapPath(this, path);
  if (mapPath != null) return 'real';
  if (/\.\d+\.|\.\d+$/.test(path)) return getPositionalPathType(this, path);
  return 'adhocOrUndefined';
};

/**
 * Returns true iff this path is a child of a mixed schema.
 * @param {String} path
 * @return {Boolean}
 * @api private
 */
Schema.prototype.hasMixedParent = function (path) {
  const subpaths = path.split(/\./g);
  path = '';
  for (let i = 0; i < subpaths.length; ++i) {
    path = i > 0 ? `${path}.${subpaths[i]}` : subpaths[i];
    if (this.paths.hasOwnProperty(path) && this.paths[path] instanceof MongooseTypes.Mixed) {
      return this.paths[path];
    }
  }
  return null;
};

/**
 * Setup updatedAt and createdAt timestamps to documents if enabled
 * @param {Boolean|Object} timestamps
 * @api private
 */
Schema.prototype.setupTimestamp = function (timestamps) {
  return setupTimestamps(this, timestamps);
};

/*!
 * ignore. Deprecated re: #6405
 */
function getPositionalPathType(self, path) {
  const subpaths = path.split(/\.(\d+)\.|\.(\d+)$/).filter(Boolean);
  if (subpaths.length < 2) {
    return self.paths.hasOwnProperty(subpaths[0]) ? self.paths[subpaths[0]] : 'adhocOrUndefined';
  }
  let val = self.path(subpaths[0]);
  let isNested = false;
  if (!val) return 'adhocOrUndefined';
  const last = subpaths.length - 1;
  for (let i = 1; i < subpaths.length; ++i) {
    isNested = false;
    const subpath = subpaths[i];
    if (i === last && val && !/\D/.test(subpath)) {
      if (val.$isMongooseDocumentArray) val = val.$embeddedSchemaType;
      else if (val instanceof MongooseTypes.Array) val = val.caster;
      else val = undefined;
      break;
    }
    if (!/\D/.test(subpath)) {
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
    isNested = type === 'nested';
    val = val.schema.path(subpath);
  }
  self.subpaths[path] = val;
  if (val) return 'real';
  if (isNested) return 'nested';
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
 * @param {String} name
 * @param {Array} args
 * @api public
 */
Schema.prototype.queue = function (name, args) {
  this.callQueue.push([name, args]);
  return this;
};

/**
 * Defines a pre hook for the model.
 * @param {String|RegExp} name
 * @param {Object} [options]
 * @param {Function} callback
 * @api public
 */
Schema.prototype.pre = function (name) {
  if (name instanceof RegExp) {
    const remainingArgs = Array.prototype.slice.call(arguments, 1);
    for (const fn of hookNames) if (name.test(fn)) this.pre.apply(this, [fn].concat(remainingArgs));
    return this;
  }
  if (Array.isArray(name)) {
    const remainingArgs = Array.prototype.slice.call(arguments, 1);
    for (const el of name) this.pre.apply(this, [el].concat(remainingArgs));
    return this;
  }
  this.s.hooks.pre.apply(this.s.hooks, arguments);
  return this;
};

/**
 * Defines a post hook for the document
 * @param {String|RegExp} name
 * @param {Object} [options]
 * @param {Function} fn
 * @api public
 */
Schema.prototype.post = function (name) {
  if (name instanceof RegExp) {
    const remainingArgs = Array.prototype.slice.call(arguments, 1);
    for (const fn of hookNames) if (name.test(fn)) this.post.apply(this, [fn].concat(remainingArgs));
    return this;
  }
  if (Array.isArray(name)) {
    const remainingArgs = Array.prototype.slice.call(arguments, 1);
    for (const el of name) this.post.apply(this, [el].concat(remainingArgs));
    return this;
  }
  this.s.hooks.post.apply(this.s.hooks, arguments);
  return this;
};

/**
 * Registers a plugin for this schema.
 * @param {Function} fn
 * @param {Object} [opts]
 * @api public
 */
Schema.prototype.plugin = function (fn, opts) {
  if (typeof fn !== 'function') {
    throw new Error('First param to `schema.plugin()` must be a function, got "' + (typeof fn) + '"');
  }
  if (opts && opts.deduplicate) {
    for (const plugin of this.plugins) if (plugin.fn === fn) return this;
  }
  this.plugins.push({ fn, opts });
  fn(this, opts);
  return this;
};

/**
 * Adds an instance method to documents constructed from Models compiled from this schema.
 * @param {String|Object} name
 * @param {Function} [fn]
 * @api public
 */
Schema.prototype.method = function (name, fn, options) {
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
 * @param {String|Object} name
 * @param {Function} [fn]
 * @api public
 */
Schema.prototype.static = function (name, fn) {
  if (typeof name !== 'string') {
    for (const i in name) this.statics[i] = name[i];
  } else {
    this.statics[name] = fn;
  }
  return this;
};

/**
 * Defines an index (most likely compound) for this schema.
 * @param {Object} fields
 * @param {Object} [options]
 * @api public
 */
Schema.prototype.index = function (fields, options) {
  fields = fields || {};
  options = options || {};
  if (options.expires) utils.expires(options);
  this._indexes.push([fields, options]);
  return this;
};

/**
 * Sets a schema option.
 * @param {String} key
 * @param {Object} [value]
 * @api public
 */
Schema.prototype.set = function (key, value, _tags) {
  if (arguments.length === 1) return this.options[key];
  switch (key) {
    case 'read':
      this.options[key] = readPref(value, _tags);
      this._userProvidedOptions[key] = this.options[key];
      break;
    case 'safe':
      setSafe(this.options, value);
      this._userProvidedOptions[key] = this.options[key];
      break;
    case 'timestamps':
      this.setupTimestamp(value);
      this.options[key] = value;
      this._userProvidedOptions[key] = this.options[key];
      break;
    case '_id':
      this.options[key] = value;
      this._userProvidedOptions[key] = this.options[key];
      if (value && !this.paths['_id']) addAutoId(this);
      else if (!value && this.paths['_id'] != null && this.paths['_id'].auto) this.remove('_id');
      break;
    default:
      this.options[key] = value;
      this._userProvidedOptions[key] = this.options[key];
      break;
  }
  return this;
};

const safeDeprecationWarning = 'Mongoose: The `safe` option for schemas is deprecated. Use the `writeConcern` option instead: http://bit.ly/mongoose-write-concern';
const setSafe = util.deprecate(function setSafe(options, value) {
  options.safe = value === false ? { w: 0 } : value;
}, safeDeprecationWarning);

/**
 * Gets a schema option.
 * @param {String} key
 * @api public
 * @return {Any}
 */
Schema.prototype.get = function (key) {
  return this.options[key];
};

const indexTypes = '2d 2dsphere hashed text'.split(' ');
Object.defineProperty(Schema, 'indexTypes', {
  get: function () {
    return indexTypes;
  },
  set: function () {
    throw new Error('Cannot overwrite Schema.indexTypes');
  }
});

/**
 * Returns a list of indexes that this schema declares.
 * @api public
 * @return {Array}
 */
Schema.prototype.indexes = function () {
  return getIndexes(this);
};

/**
 * Creates a virtual type with the given name.
 * @param {String} name
 * @param {Object} [options]
 * @return {VirtualType}
 */
Schema.prototype.virtual = function (name, options) {
  if (name instanceof VirtualType || getConstructorName(name) === 'VirtualType') {
    return this.virtual(name.path, name.options);
  }
  options = new VirtualOptions(options);
  if (utils.hasUserDefinedProperty(options, ['ref', 'refPath'])) {
    if (options.localField == null) throw new Error('Reference virtuals require `localField` option');
    if (options.foreignField == null) throw new Error('Reference virtuals require `foreignField` option');
    this.pre('init', function (obj) {
      if (mpath.has(name, obj)) {
        const _v = mpath.get(name, obj);
        if (!this.$$populatedVirtuals) this.$$populatedVirtuals = {};
        if (options.justOne || options.count) {
          this.$$populatedVirtuals[name] = Array.isArray(_v) ? _v[0] : _v;
        } else {
          this.$$populatedVirtuals[name] = Array.isArray(_v) ? _v : _v == null ? [] : [_v];
        }
        mpath.unset(name, obj);
      }
    });
    const virtual = this.virtual(name);
    virtual.options = options;
    virtual.set(function (_v) {
      if (!this.$$populatedVirtuals) this.$$populatedVirtuals = {};
      if (options.justOne || options.count) {
        this.$$populatedVirtuals[name] = Array.isArray(_v) ? _v[0] : _v;
        if (typeof this.$$populatedVirtuals[name] !== 'object') {
          this.$$populatedVirtuals[name] = options.count ? _v : null;
        }
      } else {
        this.$$populatedVirtuals[name] = Array.isArray(_v) ? _v : _v == null ? [] : [_v];
        this.$$populatedVirtuals[name] = this.$$populatedVirtuals[name].filter(function (doc) {
          return doc && typeof doc === 'object';
        });
      }
    });
    if (typeof options.get === 'function') virtual.get(options.get);
    return virtual;
  }
  const virtuals = this.virtuals;
  const parts = name.split('.');
  if (this.pathType(name) === 'real') throw new Error('Virtual path "' + name + '" conflicts with a real path in the schema');
  virtuals[name] = parts.reduce(function (mem, part, i) {
    mem[part] || (mem[part] = i === parts.length - 1 ? new VirtualType(options, name) : {});
    return mem[part];
  }, this.tree);
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
  return virtuals[name];
};

/**
 * Returns the virtual type with the given `name`.
 * @param {String} name
 * @return {VirtualType}
 */
Schema.prototype.virtualpath = function (name) {
  return this.virtuals.hasOwnProperty(name) ? this.virtuals[name] : null;
};

/**
 * Removes the given `path` (or [`paths`]).
 * @param {String|Array} path
 * @return {Schema}
 * @api public
 */
Schema.prototype.remove = function (path) {
  if (typeof path === 'string') path = [path];
  if (Array.isArray(path)) {
    path.forEach(function (name) {
      if (this.path(name) == null && !this.nested[name]) return;
      if (this.nested[name]) {
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
        return;
      }
      delete this.paths[name];
      _deletePath(this, name);
    }, this);
  }
  return this;
};

function _deletePath(schema, name) {
  const pieces = name.split('.');
  const last = pieces.pop();
  let branch = schema.tree;
  for (const piece of pieces) branch = branch[piece];
  delete branch[last];
}

/**
 * Loads an ES6 class into a schema.
 * @param {Function} model
 * @param {Boolean} [virtualsOnly]
 */
Schema.prototype.loadClass = function (model, virtualsOnly) {
  if (model === Object.prototype || model === Function.prototype || model.prototype.hasOwnProperty('$isMongooseModelPrototype')) {
    return this;
  }
  this.loadClass(Object.getPrototypeOf(model), virtualsOnly);
  if (!virtualsOnly) {
    Object.getOwnPropertyNames(model).forEach(function (name) {
      if (name.match(/^(length|name|prototype|constructor|__proto__)$/)) return;
      const prop = Object.getOwnPropertyDescriptor(model, name);
      if (prop.hasOwnProperty('value')) this.static(name, prop.value);
    }, this);
  }
  Object.getOwnPropertyNames(model.prototype).forEach(function (name) {
    if (name.match(/^(constructor)$/)) return;
    const method = Object.getOwnPropertyDescriptor(model.prototype, name);
    if (!virtualsOnly && typeof method.value === 'function') this.method(name, method.value);
    if (typeof method.get === 'function') {
      if (this.virtuals[name]) this.virtuals[name].getters = [];
      this.virtual(name).get(method.get);
    }
    if (typeof method.set === 'function') {
      if (this.virtuals[name]) this.virtuals[name].setters = [];
      this.virtual(name).set(method.set);
    }
  }, this);
  return this;
};

Schema.prototype._getSchema = function (path) {
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
        if (foundschema.caster) {
          if (foundschema.caster instanceof MongooseTypes.Mixed) {
            foundschema.caster.$fullPath = resultPath.join('.');
            return foundschema.caster;
          }
          if (p !== parts.length) {
            if (foundschema.schema) {
              let ret;
              if (parts[p] === '$' || isArrayFilter(parts[p])) {
                if (p + 1 === parts.length) return foundschema;
                ret = search(parts.slice(p + 1), foundschema.schema);
                if (ret) ret.$isUnderneathDocArray = ret.$isUnderneathDocArray || !foundschema.schema.$isSingleNested;
                return ret;
              }
              ret = search(parts.slice(p), foundschema.schema);
              if (ret) ret.$isUnderneathDocArray = ret.$isUnderneathDocArray || !foundschema.schema.$isSingleNested;
              return ret;
            }
          }
        } else if (foundschema.$isSchemaMap) {
          if (p + 1 >= parts.length) return foundschema;
          const ret = search(parts.slice(p + 1), foundschema.$__schemaType.schema);
          return ret;
        }
        foundschema.$fullPath = resultPath.join('.');
        return foundschema;
      }
    }
  }
  const parts = path.split('.');
  for (let i = 0; i < parts.length; ++i) {
    if (parts[i] === '$' || isArrayFilter(parts[i])) parts[i] = '0';
  }
  return search(parts, _this);
};

Schema.prototype._getPathType = function (path) {
  const _this = this;
  const pathschema = _this.path(path);
  if (pathschema) return 'real';
  function search(parts, schema) {
    let p = parts.length + 1,
      foundschema,
      trypath;
    while (p--) {
      trypath = parts.slice(0, p).join('.');
      foundschema = schema.path(trypath);
      if (foundschema) {
        if (foundschema.caster) {
          if (foundschema.caster instanceof MongooseTypes.Mixed) {
            return { schema: foundschema, pathType: 'mixed' };
          }
          if (p !== parts.length && foundschema.schema) {
            if (parts[p] === '$' || isArrayFilter(parts[p])) {
              if (p === parts.length - 1) return { schema: foundschema, pathType: 'nested' };
              return search(parts.slice(p + 1), foundschema.schema);
            }
            return search(parts.slice(p), foundschema.schema);
          }
          return { schema: foundschema, pathType: foundschema.$isSingleNested ? 'nested' : 'array' };
        }
        return { schema: foundschema, pathType: 'real' };
      } else if (p === parts.length && schema.nested[trypath]) {
        return { schema: schema, pathType: 'nested' };
      }
    }
    return { schema: foundschema || schema, pathType: 'undefined' };
  }
  return search(path.split('.'), _this);
};

function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/*!
 * Module exports.
 */
module.exports = exports = Schema;
require('./schema/index');
exports.ObjectId = MongooseTypes.ObjectId;