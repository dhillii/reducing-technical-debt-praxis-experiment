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
 * @typedef {Object} Schema
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
 * @param {*} obj
 * @param {string} prefix
 * @returns {boolean}
 */
function isTopLevelIdFalse(obj, prefix) {
  return obj && obj._id === false && prefix == null;
}

/**
 * Guard: prototype pollution protection.
 * @param {string} prefix
 * @returns {boolean}
 */
function isPrototypePollution(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

/**
 * Guard: invalid schema path value (null/undefined).
 * @param {*} value
 * @returns {boolean}
 */
function isInvalidValue(value) {
  return value == null;
}

/**
 * Guard: `_id: false` should be ignored as a path.
 * @param {string} key
 * @param {*} obj
 * @returns {boolean}
 */
function isIdKeyFalse(key, obj) {
  return key === '_id' && obj[key] === false;
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
 * Guard: array with a single null element.
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
 * Guard: empty object (no keys).
 * @param {*} val
 * @returns {boolean}
 */
function isEmptyObject(val) {
  return Object.keys(val).length < 1;
}

/**
 * Guard: object lacks a bona‑fide type key.
 * @param {*} val
 * @param {Object} options
 * @returns {boolean}
 */
function isNoBonaFideTypeKey(val, options) {
  return !val[options.typeKey] || (options.typeKey === 'type' && val.type.type);
}

/**
 * Helper: mark nested flag and add path.
 * @param {Schema} schema
 * @param {string} prefix
 * @param {string} fullPath
 * @param {*} value
 */
function markNestedAndPath(schema, prefix, fullPath, value) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(fullPath, value);
}

/**
 * Helper: handle POJO type key when typePojoToMixed is false.
 * @param {Schema} schema
 * @param {string} prefix
 * @param {string} key
 * @param {*} obj
 */
function handleTypePojoToMixed(schema, prefix, key, obj) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  const opts = { typePojoToMixed: false };
  const _schema = new Schema(obj[key][schema.options.typeKey], opts);
  const schemaWrappedPath = Object.assign({}, obj[key], { [schema.options.typeKey]: _schema });
  schema.path(prefix + key, schemaWrappedPath);
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

    if (isInvalidValue(obj[key])) {
      throw new TypeError('Invalid value for schema path `' + fullPath +
        '`, got value "' + obj[key] + '"');
    }

    if (isIdKeyFalse(key, obj)) {
      continue;
    }

    if (isVirtualType(obj[key])) {
      this.virtual(obj[key]);
      continue;
    }

    if (isInvalidArray(obj[key])) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    if (isNonPOJOOrSchemaTypeOptions(obj[key])) {
      markNestedAndPath(this, prefix, fullPath, obj[key]);
      continue;
    }

    if (isEmptyObject(obj[key])) {
      markNestedAndPath(this, prefix, fullPath, obj[key]);
      continue;
    }

    if (isNoBonaFideTypeKey(obj[key], this.options)) {
      this.nested[fullPath] = true;
      this.add(obj[key], fullPath + '.');
      continue;
    }

    // Bona‑fide type key present
    if (!this.options.typePojoToMixed && utils.isPOJO(obj[key][this.options.typeKey])) {
      handleTypePojoToMixed(this, prefix, key, obj);
    } else {
      markNestedAndPath(this, prefix, fullPath, obj[key]);
    }
  }

  const addedKeys = Object.keys(obj).map(key => prefix ? prefix + key : key);
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

module.exports = exports = Schema;

// require down here because of reference issues

/**
 * The various built-in Mongoose Schema Types.
 *
 * ####Example:
 *
 *     const mongoose = require('mongoose');
 *     const ObjectId = mongoose.Schema.Types.ObjectId;
 *
 * ####Types:
 *
 * - [String](/docs/schematypes.html#strings)
 * - [Number](/docs/schematypes.html#numbers)
 * - [Boolean](/docs/schematypes.html#booleans) | Bool
 * - [Array](/docs/schematypes.html#arrays)
 * - [Buffer](/docs/schematypes.html#buffers)
 * - [Date](/docs/schematypes.html#dates)
 * - [ObjectId](/docs/schematypes.html#objectids) | Oid
 * - [Mixed](/docs/schematypes.html#mixed)
 *
 * Using this exposed access to the `Mixed` SchemaType, we can use them in our schema.
 *
 *     const Mixed = mongoose.Schema.Types.Mixed;
 *     new mongoose.Schema({ _user: Mixed })
 *
 * @api public
 */

Schema.Types = MongooseTypes = require('./schema/index');

exports.ObjectId = MongooseTypes.ObjectId;