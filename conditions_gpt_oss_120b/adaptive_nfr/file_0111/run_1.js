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
 * @typedef {Object} SchemaAddOptions
 */

/**
 * Guard: check if obj is a Schema instance.
 * @param {*} obj
 * @returns {boolean}
 */
function isSchemaInstance(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
}

/**
 * Guard: top‑level `_id: false` handling.
 * @param {Object} obj
 * @param {string} prefix
 * @returns {boolean}
 */
function isTopLevelIdFalse(obj, prefix) {
  return obj && obj._id === false && prefix == null;
}

/**
 * Guard: prototype pollution prefixes.
 * @param {string} prefix
 * @returns {boolean}
 */
function isPrototypePollution(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

/**
 * Guard: invalid (null/undefined) schema value.
 * @param {*} value
 * @returns {boolean}
 */
function isInvalidValue(value) {
  return value == null;
}

/**
 * Guard: value is a VirtualType.
 * @param {*} val
 * @returns {boolean}
 */
function isVirtualType(val) {
  return val instanceof VirtualType || get(val, 'constructor.name', null) === 'VirtualType';
}

/**
 * Guard: array with a single null/undefined element.
 * @param {*} val
 * @returns {boolean}
 */
function isInvalidArray(val) {
  return Array.isArray(val) && val.length === 1 && val[0] == null;
}

/**
 * Guard: value is neither a plain object nor SchemaTypeOptions.
 * @param {*} val
 * @returns {boolean}
 */
function isNonPOJOOrSchemaTypeOptions(val) {
  return !(utils.isPOJO(val) || val instanceof SchemaTypeOptions);
}

/**
 * Guard: empty object literal.
 * @param {Object} val
 * @returns {boolean}
 */
function isEmptyObject(val) {
  return Object.keys(val).length < 1;
}

/**
 * Guard: object lacks a bona‑fide type key.
 * @param {Object} val
 * @param {Object} options
 * @returns {boolean}
 */
function isNoBonaFideTypeKey(val, options) {
  return !val[options.typeKey] || (options.typeKey === 'type' && val.type && val.type.type);
}

/**
 * Guard: POJO under type key when `typePojoToMixed` is false.
 * @param {Object} val
 * @param {Object} options
 * @returns {boolean}
 */
function isPojoUnderTypeKey(val, options) {
  return !options.typePojoToMixed && utils.isPOJO(val[options.typeKey]);
}

/**
 * Handles non‑POJO or SchemaTypeOptions values.
 * @param {Schema} schema
 * @param {string} fullPath
 * @param {string} prefix
 * @param {*} value
 */
function handleNonPOJO(schema, fullPath, prefix, value) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(fullPath, value);
}

/**
 * Handles empty object literals (treated as Mixed).
 * @param {Schema} schema
 * @param {string} fullPath
 * @param {string} prefix
 * @param {*} value
 */
function handleEmptyObject(schema, fullPath, prefix, value) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(fullPath, value);
}

/**
 * Handles POJO under type key when `typePojoToMixed` is false.
 * @param {Schema} schema
 * @param {string} fullPath
 * @param {string} prefix
 * @param {Object} val
 * @param {Object} options
 */
function handlePojoUnderTypeKey(schema, fullPath, prefix, val, options) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  const opts = { typePojoToMixed: false };
  const subSchema = new Schema(val[options.typeKey], opts);
  const wrapped = Object.assign({}, val, { [options.typeKey]: subSchema });
  schema.path(fullPath, wrapped);
}

/**
 * Handles regular POJO with a bona‑fide type key.
 * @param {Schema} schema
 * @param {string} fullPath
 * @param {string} prefix
 * @param {*} value
 */
function handleRegularPath(schema, fullPath, prefix, value) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(fullPath, value);
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

  if (isTopLevelIdFalse(obj, prefix)) {
    this.options._id = false;
  }

  prefix = prefix || '';
  if (isPrototypePollution(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (utils.specialProperties.has(key)) {
      continue;
    }

    const fullPath = prefix + key;
    const value = obj[key];

    if (isInvalidValue(value)) {
      throw new TypeError('Invalid value for schema path `' + fullPath +
        '`, got value "' + value + '"');
    }

    if (key === '_id' && value === false) {
      continue;
    }

    if (isVirtualType(value)) {
      this.virtual(value);
      continue;
    }

    if (isInvalidArray(value)) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + value[0] + '"');
    }

    if (isNonPOJOOrSchemaTypeOptions(value)) {
      handleNonPOJO(this, fullPath, prefix, value);
      continue;
    }

    if (isEmptyObject(value)) {
      handleEmptyObject(this, fullPath, prefix, value);
      continue;
    }

    if (isNoBonaFideTypeKey(value, this.options)) {
      this.nested[fullPath] = true;
      this.add(value, fullPath + '.');
      continue;
    }

    if (isPojoUnderTypeKey(value, this.options)) {
      handlePojoUnderTypeKey(this, fullPath, prefix, value, this.options);
    } else {
      handleRegularPath(this, fullPath, prefix, value);
    }
  }

  const addedKeys = Object.keys(obj).map(k => prefix ? prefix + k : k);
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

/* ... rest of the original file unchanged ... */