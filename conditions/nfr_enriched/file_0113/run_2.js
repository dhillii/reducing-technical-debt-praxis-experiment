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
  if (name === 'system.profile' || name === 'system.indexes') {
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

// Helper: Check if values are identical primitives
function _arePrimitivesEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }
  return null; // Not primitives
}

// Helper: Check if values are dates
function _areDatesEqual(a, b) {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return null;
}

// Helper: Check if values are BSON types
function _areBsonTypesEqual(a, b) {
  if ((isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
      (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128'))) {
    return a.toString() === b.toString();
  }
  return null;
}

// Helper: Check if values are regexes
function _areRegexesEqual(a, b) {
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source &&
        a.ignoreCase === b.ignoreCase &&
        a.multiline === b.multiline &&
        a.global === b.global;
  }
  return null;
}

// Helper: Check if values are maps
function _areMapsEqual(a, b, deepEqual) {
  if (a instanceof Map && b instanceof Map) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }
  return null;
}

// Helper: Check if values are numbers
function _areNumbersEqual(a, b) {
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }
  return null;
}

// Helper: Check if values are buffers
function _areBuffersEqual(a, b) {
  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }
  return null;
}

// Helper: Check if values are arrays
function _areArraysEqual(a, b, deepEqual) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return null;
  }
  const len = a.length;
  if (len !== b.length) {
    return false;
  }
  for (let i = 0; i < len; ++i) {
    if (!deepEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

// Helper: Normalize mongoose objects to plain objects
function _normalizeMongooseObjects(a, b) {
  if (a.$__ != null) {
    a = a._doc;
  } else if (isMongooseObject(a)) {
    a = a.toObject();
  }

  if (b.$__ != null) {
    b = b._doc;
  } else if (isMongooseObject(b)) {
    b = b.toObject();
  }

  return [a, b];
}

// Helper: Compare object keys
function _compareObjectKeys(ka, kb) {
  if (ka.length !== kb.length) {
    return false;
  }
  ka.sort();
  kb.sort();
  for (let i = ka.length - 1; i >= 0; i--) {
    if (ka[i] !== kb[i]) {
      return false;
    }
  }
  return true;
}

// Helper: Compare object values
function _compareObjectValues(a, b, ka, deepEqual) {
  for (const key of ka) {
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

exports.deepEqual = function deepEqual(a, b) {
  let result;

  result = _arePrimitivesEqual(a, b);
  if (result !== null) {
    return result;
  }

  result = _areDatesEqual(a, b);
  if (result !== null) {
    return result;
  }

  result = _areBsonTypesEqual(a, b);
  if (result !== null) {
    return result;
  }

  result = _areRegexesEqual(a, b);
  if (result !== null) {
    return result;
  }

  if (a == null || b == null) {
    return false;
  }

  if (a.prototype !== b.prototype) {
    return false;
  }

  result = _areMapsEqual(a, b, deepEqual);
  if (result !== null) {
    return result;
  }

  result = _areNumbersEqual(a, b);
  if (result !== null) {
    return result;
  }

  result = _areBuffersEqual(a, b);
  if (result !== null) {
    return result;
  }

  result = _areArraysEqual(a, b, deepEqual);
  if (result !== null) {
    return result;
  }

  [a, b] = _normalizeMongooseObjects(a, b);

  const ka = Object.keys(a);
  const kb = Object.keys(b);

  if (!_compareObjectKeys(ka, kb)) {
    return false;
  }

  return _compareObjectValues(a, b, ka, deepEqual);
};

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

// Helper: Check if should skip key during merge
function _shouldSkipMergeKey(key, path, options, omitNested) {
  if (options.omit && options.omit[key]) {
    return true;
  }
  if (omitNested[path]) {
    return true;
  }
  if (specialProperties.has(key)) {
    return true;
  }
  return false;
}

// Helper: Check if discriminator schema merge should skip nested merge
function _shouldSkipDiscriminatorMerge(fromVal, toVal) {
  return (fromVal.$isSingleNested && toVal.$isMongooseDocumentArray) ||
         (fromVal.$isMongooseDocumentArray && toVal.$isSingleNested);
}

// Helper: Handle schema merge
function _handleSchemaMerge(toVal, fromVal, isDiscriminatorMerge) {
  if (toVal.instanceOfSchema) {
    schemaMerge(toVal, fromVal.clone(), isDiscriminatorMerge);
  } else {
    return fromVal.clone();
  }
  return null;
}

// Helper: Handle ObjectId merge
function _handleObjectIdMerge(fromVal) {
  return new ObjectId(fromVal);
}

// Helper: Recursively merge objects
function _recursiveMerge(toVal, fromVal, options, path, key) {
  if (!exports.isObject(toVal)) {
    return {};
  }
  merge(toVal, fromVal, options, path ? path + '.' + key : key);
  return null;
}

// Helper: Process merge value
function _processMergeValue(to, key, fromVal, toVal, options, path) {
  if (fromVal != null) {
    if (options.isDiscriminatorSchemaMerge && _shouldSkipDiscriminatorMerge(fromVal, toVal)) {
      return;
    }
    if (fromVal.instanceOfSchema) {
      const result = _handleSchemaMerge(toVal, fromVal, options.isDiscriminatorSchemaMerge);
      if (result !== null) {
        to[key] = result;
      }
      return;
    }
    if (fromVal instanceof ObjectId) {
      to[key] = _handleObjectIdMerge(fromVal);
      return;
    }
  }
  _recursiveMerge(toVal, fromVal, options, path, key);
}

/*!
 * Merges `from` into `to` without overwriting existing properties.
 *
 * @param {Object} to
 * @param {Object} from
 * @api private
 */

exports.merge = function merge(to, from, options, path) {
  options = options || {};

  const keys = Object.keys(from);
  let i = 0;
  const len = keys.length;
  let key;

  path = path || '';
  const omitNested = options.omitNested || {};

  while (i < len) {
    key = keys[i++];
    if (_shouldSkipMergeKey(key, path, options, omitNested)) {
      continue;
    }
    if (to[key] == null) {
      to[key] = from[key];
    } else if (exports.isObject(from[key])) {
      if (!exports.isObject(to[key])) {
        to[key] = {};
      }
      _processMergeValue(to, key, from[key], to[key], options, path);
    } else if (options.overwrite) {
      to[key] = from[key];
    }
  }
};

// Helper: Recursively apply toObject
function _toObjectRecursive(obj) {
  if (obj == null) {
    return obj;
  }

  if (obj instanceof Document) {
    return obj.toObject();
  }

  if (Array.isArray(obj)) {
    const ret = [];
    for (const doc of obj) {
      ret.push(_toObjectRecursive(doc));
    }
    return ret;
  }

  if (exports.isPOJO(obj)) {
    const ret = {};
    for (const k of Object.keys(obj)) {
      if (specialProperties.has(k)) {
        continue;
      }
      ret[k] = _toObjectRecursive(obj[k]);
    }
    return ret;
  }

  return obj;
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
  return _toObjectRecursive(obj);
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
 * Wraps `callback` in