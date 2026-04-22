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

const queryHooks = require('./helpers/query/applyQueryMiddleware')
  .middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks')
  .middlewareFunctions;
const hookNames = queryHooks.concat(documentHooks)
  .reduce((s, hook) => s.add(hook), new Set());

let id = 0;

/**
 * Helper: determine if a value is a plain object or SchemaTypeOptions.
 */
function isSchemaPathValue(val) {
  return utils.isPOJO(val) || val instanceof SchemaTypeOptions;
}

/**
 * Helper: check if an object has a type key.
 */
function hasTypeKey(obj, typeKey) {
  return !!obj[typeKey];
}

/**
 * Helper: mark a prefix as nested.
 */
function markNested(schema, prefix) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
}

/**
 * Helper: handle objects that contain a type key.
 */
function handleTypeKeyPath(schema, fullPath, value, prefix) {
  const opts = schema.options;
  if (!opts.typePojoToMixed && utils.isPOJO(value[opts.typeKey])) {
    // POJO as subdocument
    markNested(schema, prefix);
    const childOpts = { typePojoToMixed: false };
    const childSchema = new Schema(value[opts.typeKey], childOpts);
    const wrapped = Object.assign({}, value, { [opts.typeKey]: childSchema });
    schema.path(prefix + fullPath.split('.').pop(), wrapped);
    return;
  }

  // regular path
  markNested(schema, prefix);
  schema.path(fullPath, value);
}

/**
 * Schema constructor.
 *
 * @param {Object|Schema|Array} [definition]
 * @param {Object} [options]
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
      .get((p => function () {
        return typeof this.get === 'function' ? this.get(p) : this[p];
      })(prop))
      .set((p => function (v) {
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

/* ... (unchanged parts omitted for brevity) ... */

/**
 * Adds key path / schema type pairs to this schema.
 *
 * @param {Object|Schema} obj
 * @param {String} [prefix]
 * @return {Schema}
 */
Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  if (obj._id === false && prefix == null) this.options._id = false;

  prefix = prefix || '';
  if (['__proto__.', 'constructor.', 'prototype.'].includes(prefix)) return this;

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (utils.specialProperties.has(key)) continue;

    const fullPath = prefix + key;
    const value = obj[key];

    if (value == null) {
      throw new TypeError(`Invalid value for schema path \`${fullPath}\`, got value "${value}"`);
    }

    if (key === '_id' && value === false) continue;

    if (value instanceof VirtualType || get(value, 'constructor.name') === 'VirtualType') {
      this.virtual(value);
      continue;
    }

    if (Array.isArray(value) && value.length === 1 && value[0] == null) {
      throw new TypeError(`Invalid value for schema Array path \`${fullPath}\`, got value "${value[0]}"`);
    }

    if (!isSchemaPathValue(value)) {
      markNested(this, prefix);
      this.path(fullPath, value);
    } else if (Object.keys(value).length === 0) {
      markNested(this, prefix);
      this.path(fullPath, value);
    } else if (!hasTypeKey(value, this.options.typeKey) ||
      (this.options.typeKey === 'type' && value.type && value.type.type)) {
      this.nested[fullPath] = true;
      this.add(value, fullPath + '.');
    } else {
      handleTypeKeyPath(this, fullPath, value, prefix);
    }
  }

  const addedKeys = keys.map(k => prefix + k);
  aliasFields(this, addedKeys);
  return this;
};

/* ... (remaining unchanged code) ... */

module.exports = exports = Schema;

// require down here because of reference issues
Schema.Types = MongooseTypes = require('./schema/index');
exports.ObjectId = MongooseTypes.ObjectId;
```