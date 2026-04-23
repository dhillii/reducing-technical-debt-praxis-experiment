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

const queryHooks = require('./helpers/query/applyQueryMiddleware')
  .middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks')
  .middlewareFunctions;
const hookNames = queryHooks.concat(documentHooks)
  .reduce((s, hook) => s.add(hook), new Set());

let id = 0;

/**
 * Schema constructor.
 *
 * @param {Object|Schema|Array} [definition]
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
  this.$id = ++id;
  this.mapPaths = [];

  this.s = { hooks: new Kareem() };
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

/*!
 * Create virtual properties with alias field
 */
function aliasFields(schema, paths) {
  paths = paths || Object.keys(schema.paths);
  for (const path of paths) {
    const options = get(schema.paths[path], 'options');
    if (options == null) continue;

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
          if (typeof this.get === 'function') {
            return this.get(p);
          }
          return this[p];
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
 * @api public
 */
Object.defineProperty(Schema.prototype, 'childSchemas', {
  configurable: false,
  enumerable: true,
  writable: true
});

/**
 * The original object passed to the schema constructor
 * @api public
 */
Schema.prototype.obj;

/**
 * The paths defined on this schema.
 * @api public
 */
Schema.prototype.paths;

/**
 * Schema as a tree
 * @api private
 */
Schema.prototype.tree;

/**
 * Returns a deep copy of the schema
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
 * @api public
 */
Schema.prototype.pick = function (paths, options) {
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
 * @api private
 */
Schema.prototype.defaultOptions = function (options) {
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

/* Helper predicates for add() */

/**
 * Checks if the prefix is a prohibited prototype key.
 * @param {string} prefix
 * @returns {boolean}
 */
function isProtoPrefix(prefix) {
  return prefix === '__proto__.' ||
    prefix === 'constructor.' ||
    prefix === 'prototype.';
}

/**
 * Determines if a value is a VirtualType instance.
 * @param {*} val
 * @returns {boolean}
 */
function isVirtualType(val) {
  return val instanceof VirtualType ||
    get(val, 'constructor.name', null) === 'VirtualType';
}

/**
 * Determines if an array definition is invalid (single null element).
 * @param {*} val
 * @returns {boolean}
 */
function isInvalidArray(val) {
  return Array.isArray(val) && val.length === 1 && val[0] == null;
}

/**
 * Checks if a value is a plain object or SchemaTypeOptions.
 * @param {*} val
 * @returns {boolean}
 */
function isPOJOorOptions(val) {
  return utils.isPOJO(val) || val instanceof SchemaTypeOptions;
}

/**
 * Checks if an object has no keys.
 * @param {Object} obj
 * @returns {boolean}
 */
function isEmptyObject(obj) {
  return Object.keys(obj).length < 1;
}

/**
 * Determines if the object lacks a proper type key.
 * @param {Object} obj
 * @param {Object} options
 * @returns {boolean}
 */
function lacksBonaFideTypeKey(obj, options) {
  return !obj[options.typeKey] ||
    (options.typeKey === 'type' && obj.type && obj.type.type);
}

/**
 * Handles non‑POJO schema definitions.
 * @param {Schema} schema
 * @param {string} fullPath
 * @param {*} definition
 */
function handleNonPOJO(schema, fullPath, definition) {
  if (schema.prefix) {
    schema.nested[schema.prefix.substr(0, schema.prefix.length - 1)] = true;
  }
  schema.path(schema.prefix + fullPath, definition);
}

/**
 * Handles empty object definitions (treated as Mixed).
 * @param {Schema} schema
 * @param {string} fullPath
 */
function handleEmptyObject(schema, fullPath) {
  if (schema.prefix) {
    schema.nested[schema.prefix.substr(0, schema.prefix.length - 1)] = true;
  }
  schema.path(fullPath, {});
}

/**
 * Handles definitions that contain a type key.
 * @param {Schema} schema
 * @param {string} fullPath
 * @param {*} definition
 * @param {Object} options
 */
function handleHasTypeKey(schema, fullPath, definition, options) {
  if (!schema.options.typePojoToMixed && utils.isPOJO(definition[options.typeKey])) {
    if (schema.prefix) {
      schema.nested[schema.prefix.substr(0, schema.prefix.length - 1)] = true;
    }
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(definition[options.typeKey], opts);
    const wrapped = Object.assign({}, definition, { [options.typeKey]: _schema });
    schema.path(schema.prefix + fullPath, wrapped);
  } else {
    if (schema.prefix) {
      schema.nested[schema.prefix.substr(0, schema.prefix.length - 1)] = true;
    }
    schema.path(schema.prefix + fullPath, definition);
  }
}

/**
 * Adds key path / schema type pairs to this schema.
 * @api public
 */
Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';
  if (isProtoPrefix(prefix)) return this;

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (utils.specialProperties.has(key)) continue;

    const fullPath = prefix + key;
    const value = obj[key];

    if (value == null) {
      throw new TypeError(`Invalid value for schema path \`${fullPath}\`, got value "${value}"`);
    }

    if (key === '_id' && value === false) continue;
    if (isVirtualType(value)) {
      this.virtual(value);
      continue;
    }

    if (isInvalidArray(value)) {
      throw new TypeError(`Invalid value for schema Array path \`${fullPath}\`, got value "${value[0]}"`);
    }

    if (!isPOJOorOptions(value)) {
      this.prefix = prefix;
      handleNonPOJO(this, fullPath, value);
      delete this.prefix;
      continue;
    }

    if (isEmptyObject(value)) {
      this.prefix = prefix;
      handleEmptyObject(this, fullPath);
      delete this.prefix;
      continue;
    }

    if (lacksBonaFideTypeKey(value, this.options)) {
      this.nested[fullPath] = true;
      this.add(value, fullPath + '.');
      continue;
    }

    this.prefix = prefix;
    handleHasTypeKey(this, fullPath, value, this.options);
    delete this.prefix;
  }

  const addedKeys = Object.keys(obj).map(k => prefix ? prefix + k : k);
  aliasFields(this, addedKeys);
  return this;
};

/* Remaining code unchanged (trimmed for brevity) */

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

/* ... other functions remain unchanged ... */

module.exports = exports = Schema;
Schema.Types = MongooseTypes = require('./schema/index');
exports.ObjectId = MongooseTypes.ObjectId;