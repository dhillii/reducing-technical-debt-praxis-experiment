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
const queryHooks = require('./helpers/query/applyQueryMiddleware').middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks').middlewareFunctions;
const hookNames = queryHooks.concat(documentHooks).reduce((s, hook) => s.add(hook), new Set());
let id = 0;

/**
 * Schema constructor.
 */
function Schema(obj, options) {
  if (!(this instanceof Schema)) return new Schema(obj, options);
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
  } else if (obj) this.add(obj);
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
      .get(((p) => function () {
        return typeof this.get === 'function' ? this.get(p) : this[p];
      })(prop))
      .set(((p) => function (v) {
        return this.$set(p, v);
      })(prop));
  }
}

/*!
 * Inherit from EventEmitter.
 */
Schema.prototype = Object.create(EventEmitter.prototype);
Schema.prototype.constructor = Schema;
Schema.prototype.instanceOfSchema = true;

/* eslint-disable max-lines-per-function */

/**
 * @private
 * Determines if the provided object is a Schema instance.
 * @param {*} obj
 * @returns {boolean}
 */
function isSchemaInstance(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
}

/**
 * @private
 * Checks for prohibited prototype prefixes.
 * @param {string} prefix
 * @returns {boolean}
 */
function isInvalidPrototypePrefix(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

/**
 * @private
 * Determines if a key should be ignored as a special property.
 * @param {string} key
 * @returns {boolean}
 */
function isSpecialProperty(key) {
  return utils.specialProperties.has(key);
}

/**
 * @private
 * Validates a schema path value.
 * @param {string} fullPath
 * @param {*} value
 */
function assertValidPathValue(fullPath, value) {
  if (value == null) {
    throw new TypeError('Invalid value for schema path `' + fullPath + '`, got value "' + value + '"');
  }
}

/**
 * @private
 * Determines if the definition represents a virtual type.
 * @param {*} def
 * @returns {boolean}
 */
function isVirtualDefinition(def) {
  return def instanceof VirtualType || get(def, 'constructor.name', null) === 'VirtualType';
}

/**
 * @private
 * Determines if an array definition is invalid.
 * @param {*} arr
 * @returns {boolean}
 */
function isInvalidArrayPath(arr) {
  return Array.isArray(arr) && arr.length === 1 && arr[0] == null;
}

/**
 * @private
 * Determines if an object is a plain POJO or SchemaTypeOptions.
 * @param {*} val
 * @returns {boolean}
 */
function isPOJOOrOptions(val) {
  return utils.isPOJO(val) || val instanceof SchemaTypeOptions;
}

/**
 * @private
 * Determines if an object has no own keys.
 * @param {Object} obj
 * @returns {boolean}
 */
function isEmptyObject(obj) {
  return Object.keys(obj).length < 1;
}

/**
 * @private
 * Determines if the definition lacks a proper type key.
 * @param {*} def
 * @param {Object} opts
 * @returns {boolean}
 */
function lacksBonaFideTypeKey(def, opts) {
  return !def[opts.typeKey] || (opts.typeKey === 'type' && def.type.type);
}

/**
 * @private
 * Handles POJO with typePojoToMixed disabled.
 * @param {Schema} schema
 * @param {string} prefix
 * @param {string} key
 * @param {*} def
 * @param {Object} opts
 */
function handlePojoToMixed(schema, prefix, key, def, opts) {
  const optsLocal = { typePojoToMixed: false };
  const subSchema = new Schema(def[opts.typeKey], optsLocal);
  const wrapped = Object.assign({}, def, { [opts.typeKey]: subSchema });
  schema.path(prefix + key, wrapped);
}

/**
 * @private
 * Adds a regular path.
 * @param {Schema} schema
 * @param {string} prefix
 * @param {string} key
 * @param {*} def
 */
function addRegularPath(schema, prefix, key, def) {
  schema.path(prefix + key, def);
}

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

  if (obj._id === false && prefix == null) this.options._id = false;
  prefix = prefix || '';
  if (isInvalidPrototypePrefix(prefix)) return this;

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (isSpecialProperty(key)) continue;
    const fullPath = prefix + key;
    assertValidPathValue(fullPath, obj[key]);

    if (key === '_id' && obj[key] === false) continue;
    if (isVirtualDefinition(obj[key])) {
      this.virtual(obj[key]);
      continue;
    }
    if (isInvalidArrayPath(obj[key])) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    const def = obj[key];
    const opts = this.options;

    if (!isPOJOOrOptions(def)) {
      if (prefix) this.nested[prefix.slice(0, -1)] = true;
      addRegularPath(this, prefix, key, def);
    } else if (isEmptyObject(def)) {
      if (prefix) this.nested[prefix.slice(0, -1)] = true;
      addRegularPath(this, prefix, key, def);
    } else if (lacksBonaFideTypeKey(def, opts)) {
      this.nested[fullPath] = true;
      this.add(def, fullPath + '.');
    } else {
      if (!opts.typePojoToMixed && utils.isPOJO(def[opts.typeKey])) {
        if (prefix) this.nested[prefix.slice(0, -1)] = true;
        handlePojoToMixed(this, prefix, key, def, opts);
      } else {
        if (prefix) this.nested[prefix.slice(0, -1)] = true;
        addRegularPath(this, prefix, key, def);
      }
    }
  }

  const addedKeys = Object.keys(obj).map(k => prefix ? prefix + k : k);
  aliasFields(this, addedKeys);
  return this;
};

/* eslint-enable max-lines-per-function */

/* The rest of the original file remains unchanged. */
```