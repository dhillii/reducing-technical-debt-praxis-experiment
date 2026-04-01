```javascript
'use strict';

/*!
 * Module dependencies.
 */

const ms = require('ms');
const mpath = require('mpath');
const sliced = require('sliced');
const Buffer = require('safe-buffer').Buffer;
const Decimal = require('./types/decimal128');
const ObjectId = require('./types/objectid');
const PopulateOptions = require('./options/PopulateOptions');
const clone = require('./helpers/clone');
const immediate = require('./helpers/immediate');
const isObject = require('./helpers/isObject');
const isBsonType = require('./helpers/isBsonType');
const getFunctionName = require('./helpers/getFunctionName');
const isMongooseObject = require('./helpers/isMongooseObject');
const promiseOrCallback = require('./helpers/promiseOrCallback');
const schemaMerge = require('./helpers/schema/merge');
const specialProperties = require('./helpers/specialProperties');

let Document;

exports.specialProperties = specialProperties;

/*!
 * Produces a collection name from model `name`. By default, just returns
 * the model name
 *
 * @param {String} name a model name
 * @param {Function} pluralize function that pluralizes the collection name
 * @return {String} a collection name
 * @api private
 */

exports.toCollectionName = function(name, pluralize) {
  if (name === 'system.profile') {
    return name;
  }
  if (name === 'system.indexes') {
    return name;
  }
  if (typeof pluralize === 'function') {
    return pluralize(name);
  }
  return name;
};

/*!
 * Determines if `a` and `b` are deep equal.
 *
 * Modified from node/lib/assert.js
 *
 * @param {any} a a value to compare to `b`
 * @param {any} b a value to compare to `a`
 * @return {Boolean}
 * @api private
 */

exports.deepEqual = function deepEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if ((isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
      (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128'))) {
    return a.toString() === b.toString();
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source &&
        a.ignoreCase === b.ignoreCase &&
        a.multiline === b.multiline &&
        a.global === b.global;
  }

  if (a == null || b == null) {
    return false;
  }

  if (a.prototype !== b.prototype) {
    return false;
  }

  if (a instanceof Map && b instanceof Map) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }

  // Handle MongooseNumbers
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }

  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return _deepEqualArrays(a, b);
  }

  return _deepEqualObjects(a, b);
};

/**
 * Deep equal comparison for arrays
 * @param {Array} a
 * @param {Array} b
 * @return {Boolean}
 * @api private
 */
function _deepEqualArrays(a, b) {
  const len = a.length;
  if (len !== b.length) {
    return false;
  }
  for (let i = 0; i < len; ++i) {
    if (!exports.deepEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Deep equal comparison for objects
 * @param {Object} a
 * @param {Object} b
 * @return {Boolean}
 * @api private
 */
function _deepEqualObjects(a, b) {
  a = _normalizeObjectForComparison(a);
  b = _normalizeObjectForComparison(b);

  const ka = Object.keys(a);
  const kb = Object.keys(b);
  const kaLength = ka.length;

  if (kaLength !== kb.length) {
    return false;
  }

  ka.sort();
  kb.sort();

  for (let i = kaLength - 1; i >= 0; i--) {
    if (ka[i] !== kb[i]) {
      return false;
    }
  }

  for (const key of ka) {
    if (!exports.deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Normalize object for comparison by converting Mongoose objects
 * @param {Object} obj
 * @return {Object}
 * @api private
 */
function _normalizeObjectForComparison(obj) {
  if (obj.$__ != null) {
    return obj._doc;
  } else if (isMongooseObject(obj)) {
    return obj.toObject();
  }
  return obj;
}

/*!
 * Get the last element of an array
 */

exports.last = function(arr) {
  if (arr.length > 0) {
    return arr[arr.length - 1];
  }
  return void 0;
};

exports.clone = clone;

/*!
 * ignore
 */

exports.promiseOrCallback = promiseOrCallback;

/*!
 * ignore
 */

exports.omit = function omit(obj, keys) {
  if (keys == null) {
    return Object.assign({}, obj);
  }
  if (!Array.isArray(keys)) {
    keys = [keys];
  }

  const ret = Object.assign({}, obj);
  for (const key of keys) {
    delete ret[key];
  }
  return ret;
};


/*!
 * Shallow copies defaults into options.
 *
 * @param {Object} defaults
 * @param {Object} options
 * @return {Object} the merged object
 * @api private
 */

exports.options = function(defaults, options) {
  const keys = Object.keys(defaults);
  let i = keys.length;
  let k;

  options = options || {};

  while (i--) {
    k = keys[i];
    if (!(k in options)) {
      options[k] = defaults[k];
    }
  }

  return options;
};

/*!
 * Generates a random string
 *
 * @api private
 */

exports.random = function() {
  return Math.random().toString().substr(3);
};

/**
 * Merge options object
 * @typedef {Object} MergeOptions
 * @property {Object} [omit] Keys to omit from merge
 * @property {Object} [omitNested] Nested paths to omit
 * @property {Boolean} [overwrite] Whether to overwrite existing values
 * @property {Boolean} [isDiscriminatorSchemaMerge] Whether this is a discriminator schema merge
 */

/**
 * Merges `from` into `to` without overwriting existing properties.
 *
 * @param {Object} to
 * @param {Object} from
 * @param {MergeOptions} options
 * @api private
 */

exports.merge = function merge(to, from, options) {
  options = options || {};
  const keys = Object.keys(from);
  let i = 0;
  const len = keys.length;
  let key;

  const mergeContext = {
    to: to,
    from: from,
    options: options,
    path: ''
  };

  while (i < len) {
    key = keys[i++];
    _mergeKey(mergeContext, key);
  }
};

/**
 * Merge a single key from source to target
 * @param {Object} context Merge context with to, from, options, path
 * @param {String} key Key to merge
 * @api private
 */
function _mergeKey(context, key) {
  const { to, from, options, path } = context;
  const omitNested = options.omitNested || {};

  if (options.omit && options.omit[key]) {
    return;
  }
  if (omitNested[path]) {
    return;
  }
  if (specialProperties.has(key)) {
    return;
  }
  if (to[key] == null) {
    to[key] = from[key];
  } else if (exports.isObject(from[key])) {
    _mergeObjectValue(context, key);
  } else if (options.overwrite) {
    to[key] = from[key];
  }
}

/**
 * Merge object values
 * @param {Object} context Merge context
 * @param {String} key Key being merged
 * @api private
 */
function _mergeObjectValue(context, key) {
  const { to, from, options, path } = context;

  if (!exports.isObject(to[key])) {
    to[key] = {};
  }
  if (from[key] != null) {
    if (_shouldSkipSchemaMerge(from[key], to[key], options)) {
      return;
    }
    if (from[key].instanceOfSchema) {
      _mergeSchema(to, from, key, options);
      return;
    }
    if (from[key] instanceof ObjectId) {
      to[key] = new ObjectId(from[key]);
      return;
    }
  }
  const newPath = path ? path + '.' + key : key;
  exports.merge(to[key], from[key], Object.assign({}, options, { path: newPath }));
}

/**
 * Check if schema merge should be skipped
 * @param {Object} fromVal From value
 * @param {Object} toVal To value
 * @param {Object} options Merge options
 * @return {Boolean}
 * @api private
 */
function _shouldSkipSchemaMerge(fromVal, toVal, options) {
  if (!options.isDiscriminatorSchemaMerge) {
    return false;
  }
  return (fromVal.$isSingleNested && toVal.$isMongooseDocumentArray) ||
         (fromVal.$isMongooseDocumentArray && toVal.$isSingleNested);
}

/**
 * Merge schema objects
 * @param {Object} to Target object
 * @param {Object} from Source object
 * @param {String} key Key being merged
 * @param {Object} options Merge options
 * @api private
 */
function _mergeSchema(to, from, key, options) {
  if (to[key].instanceOfSchema) {
    schemaMerge(to[key], from[key].clone(), options.isDiscriminatorSchemaMerge);
  } else {
    to[key] = from[key].clone();
  }
}

/*!
 * Applies toObject recursively.
 *
 * @param {Document|Array|Object} obj
 * @return {Object}
 * @api private
 */

exports.toObject = function toObject(obj) {
  Document || (Document = require('./document'));
  let ret;

  if (obj == null) {
    return obj;
  }

  if (obj instanceof Document) {
    return obj.toObject();
  }

  if (Array.isArray(obj)) {
    ret = [];

    for (const doc of obj) {
      ret.push(toObject(doc));
    }

    return ret;
  }

  if (exports.isPOJO(obj)) {
    ret = {};

    for (const k of Object.keys(obj)) {
      if (specialProperties.has(k)) {
        continue;
      }
      ret[k] = toObject(obj[k]);
    }

    return ret;
  }

  return obj;
};

exports.isObject = isObject;

/*!
 * Determines if `arg` is a plain old JavaScript object (POJO). Specifically,
 * `arg` must be an object but not an instance of any special class, like String,
 * ObjectId, etc.
 *
 * `Object.getPrototypeOf()` is part of ES5: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getPrototypeOf
 *
 * @param {Object|Array|String|Function|RegExp|any} arg
 * @api private
 * @return {Boolean}
 */

exports.isPOJO = function isPOJO(arg) {
  if (arg == null || typeof arg !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(arg);
  // Prototype may be null if you used `Object.create(null)`
  // Checking `proto`'s constructor is safe because `getPrototypeOf()`
  // explicitly crosses the boundary from object data to object metadata
  return !proto || proto.constructor.name === 'Object';
};

/*!
 * Determines if `obj` is a built-in object like an array, date, boolean,
 * etc.
 */

exports.isNativeObject = function(arg) {
  return Array.isArray(arg) ||
    arg instanceof Date ||
    arg instanceof Boolean ||
    arg instanceof Number ||
    arg instanceof String;
};

/*!
 * Determines if `val` is an object that has no own keys
 */

exports.isEmptyObject = function(val) {
  return val != null &&
    typeof val === 'object' &&
    Object.keys(val).length === 0;
};

/*!
 * Search if `obj` or any POJOs nested underneath `obj` has a property named
 * `key`
 */

exports.hasKey = function hasKey(obj, key) {
  const props = Object.keys(obj);
  for (const prop of props) {
    if (prop === key) {
      return true;
    }
    if (exports.isPOJO(obj[prop]) && exports.hasKey(obj[prop], key)) {
      return true;
    }
  }
  return false;
};

/*!
 * A faster Array.prototype.slice.call(arguments) alternative
 * @api private
 */

exports.args = sliced;

/*!
 * process.nextTick helper.
 *
 * Wraps `callback` in a try/catch + nextTick.
 *
 * node-mongodb-native has a habit of state corruption when an error is immediately thrown from within a collection callback.
 *
 * @param {Function} callback
 * @api private
 */

exports.tick = function tick(callback) {
  if (typeof callback !== 'function') {
    return;
  }
  return function() {
    try {
      callback.apply(this, arguments);
    } catch (err) {
      // only nextTick on err to get out of
      // the event loop and avoid state corruption.
      immediate(function() {
        throw err;
      });
    }
  };
};

/*!
 * Returns true if `v` is an object that can be serialized as a primitive in
 * MongoDB
 */

exports.isMongooseType = function(v) {
  return v instanceof ObjectId || v instanceof Decimal || v instanceof Buffer;
};

exports.isMongooseObject = isMongooseObject;

/*!
 * Converts `expires` options of index objects to `expiresAfterSeconds` options for MongoDB.
 *
 * @param {Object} object
 * @api private
 */

exports.expires