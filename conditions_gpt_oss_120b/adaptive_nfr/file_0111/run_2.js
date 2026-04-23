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
 * Determine if the provided object is a Schema instance.
 * @param {*} obj
 * @returns {boolean}
 */
function isSchemaInstance(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
}

/**
 * Determine if the provided value is a VirtualType.
 * @param {*} val
 * @returns {boolean}
 */
function isVirtualType(val) {
  return val instanceof VirtualType || get(val, 'constructor.name') === 'VirtualType';
}

/**
 * Guard for prohibited prototype prefixes.
 * @param {string} prefix
 * @returns {boolean}
 */
function isProhibitedPrefix(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

/**
 * Validate array path values.
 * @param {*} val
 * @param {string} fullPath
 * @throws {TypeError}
 */
function validateArrayPath(val, fullPath) {
  if (Array.isArray(val) && val.length === 1 && val[0] == null) {
    throw new TypeError('Invalid value for schema Array path `' + fullPath +
      '`, got value "' + val[0] + '"');
  }
}

/**
 * Determine if the key/value pair should be treated as a nested POJO.
 * @param {*} val
 * @param {object} options
 * @returns {boolean}
 */
function isNestedPOJO(val, options) {
  return utils.isPOJO(val) && !val[options.typeKey];
}

/**
 * Determine if the object has a valid type key.
 * @param {*} obj
 * @param {object} options
 * @returns {boolean}
 */
function hasValidTypeKey(obj, options) {
  return obj && obj[options.typeKey];
}

/**
 * Determine if the object is an empty definition.
 * @param {*} obj
 * @returns {boolean}
 */
function isEmptyObject(obj) {
  return Object.keys(obj).length < 1;
}

/**
 * Schema constructor.
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
  const auto_id = !this.paths['_id'] && (!this.options.noId && this.options._id) && !_idSubDoc;
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
      .get((function(p) {
        return function() {
          if (typeof this.get === 'function') {
            return this.get(p);
          }
          return this[p];
        };
      })(prop))
      .set((function(p) {
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
 * Adds key path / schema type pairs to this schema.
 *
 * @param {Object|Schema} obj plain object with paths to add, or another schema
 * @param {String} [prefix] path to prefix the newly added paths with
 * @return {Schema} the Schema instance
 * @api public
 */
Schema.prototype.add = function add(obj, prefix) {
  if (isSchemaInstance(obj)) {
    merge(this, obj);
    return this;
  }

  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';
  if (isProhibitedPrefix(prefix)) return this;

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (utils.specialProperties.has(key)) continue;
    const fullPath = prefix + key;
    if (obj[key] == null) {
      throw new TypeError('Invalid value for schema path `' + fullPath +
        '`, got value "' + obj[key] + '"');
    }
    if (key === '_id' && obj[key] === false) continue;
    if (isVirtualType(obj[key])) {
      this.virtual(obj[key]);
      continue;
    }
    validateArrayPath(obj[key], fullPath);
    if (!utils.isPOJO(obj[key]) || obj[key] instanceof SchemaTypeOptions) {
      if (prefix) this.nested[prefix.slice(0, -1)] = true;
      this.path(prefix + key, obj[key]);
    } else if (isEmptyObject(obj[key])) {
      if (prefix) this.nested[prefix.slice(0, -1)] = true;
      this.path(fullPath, obj[key]);
    } else if (!hasValidTypeKey(obj[key], this.options) ||
      (this.options.typeKey === 'type' && obj[key].type && obj[key].type.type)) {
      this.nested[fullPath] = true;
      this.add(obj[key], fullPath + '.');
    } else {
      if (!this.options.typePojoToMixed && isNestedPOJO(obj[key][this.options.typeKey], this.options)) {
        if (prefix) this.nested[prefix.slice(0, -1)] = true;
        const opts = { typePojoToMixed: false };
        const _schema = new Schema(obj[key][this.options.typeKey], opts);
        const schemaWrappedPath = Object.assign({}, obj[key], { [this.options.typeKey]: _schema });
        this.path(prefix + key, schemaWrappedPath);
      } else {
        if (prefix) this.nested[prefix.slice(0, -1)] = true;
        this.path(prefix + key, obj[key]);
      }
    }
  }

  const addedKeys = Object.keys(obj).map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

/* The rest of the original file remains unchanged */
... (remaining unchanged code)