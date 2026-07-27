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
 * Check if two values are identical (strict equality or same reference)
 * @api private
 */
function _isIdentical(a, b) {
  return a === b;
}

/*!
 * Check if both values are primitives (not objects)
 * @api private
 */
function _arePrimitives(a, b) {
  return typeof a !== 'object' && typeof b !== 'object';
}

/*!
 * Check if both values are Dates with equal time
 * @api private
 */
function _areDatesEqual(a, b) {
  if (!(a instanceof Date && b instanceof Date)) {
    return false;
  }
  return a.getTime() === b.getTime();
}

/*!
 * Check if both values are BSON types (ObjectID or Decimal128) with equal string representation
 * @api private
 */
function _areBsonTypesEqual(a, b) {
  const isObjectIdPair = isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID');
  const isDecimalPair = isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128');
  
  if (!isObjectIdPair && !isDecimalPair) {
    return false;
  }
  return a.toString() === b.toString();
}

/*!
 * Check if both values are RegExp with equal properties
 * @api private
 */
function _areRegExpsEqual(a, b) {
  if (!(a instanceof RegExp && b instanceof RegExp)) {
    return false;
  }
  return a.source === b.source &&
      a.ignoreCase === b.ignoreCase &&
      a.multiline === b.multiline &&
      a.global === b.global;
}

/*!
 * Check if either value is null or undefined
 * @api private
 */
function _isNullOrUndefined(a, b) {
  return a == null || b == null;
}

/*!
 * Check if prototypes match
 * @api private
 */
function _prototypesMatch(a, b) {
  return a.prototype === b.prototype;
}

/*!
 * Check if both values are Maps with equal keys and values
 * @api private
 */
function _areMapsEqual(a, b) {
  if (!(a instanceof Map && b instanceof Map)) {
    return false;
  }
  return exports.deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
    exports.deepEqual(Array.from(a.values()), Array.from(b.values()));
}

/*!
 * Check if both values are Numbers with equal valueOf
 * @api private
 */
function _areNumbersEqual(a, b) {
  if (!(a instanceof Number && b instanceof Number)) {
    return false;
  }
  return a.valueOf() === b.valueOf();
}

/*!
 * Check if both values are Buffers with equal content
 * @api private
 */
function _areBuffersEqual(a, b) {
  if (!Buffer.isBuffer(a)) {
    return false;
  }
  return exports.buffer.areEqual(a, b);
}

/*!
 * Check if both values are Arrays with equal elements
 * @api private
 */
function _areArraysEqual(a, b) {
  if (!(Array.isArray(a) && Array.isArray(b))) {
    return false;
  }
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

/*!
 * Convert Mongoose objects to plain objects for comparison
 * @api private
 */
function _normalizeMongooseObjects(a, b) {
  let normalizedA = a;
  let normalizedB = b;
  
  if (a.$__ != null) {
    normalizedA = a._doc;
  } else if (isMongooseObject(a)) {
    normalizedA = a.toObject();
  }

  if (b.$__ != null) {
    normalizedB = b._doc;
  } else if (isMongooseObject(b)) {
    normalizedB = b.toObject();
  }
  
  return [normalizedA, normalizedB];
}

/*!
 * Check if object keys match and are in same order
 * @api private
 */
function _keysMatch(ka, kb) {
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

/*!
 * Check if all corresponding object properties are deeply equal
 * @api private
 */
function _objectPropertiesEqual(a, b, keys) {
  for (const key of keys) {
    if (!exports.deepEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

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
  if (_isIdentical(a, b)) {
    return true;
  }

  if (_arePrimitives(a, b)) {
    return a === b;
  }

  if (_areDatesEqual(a, b)) {
    return true;
  }

  if (_areBsonTypesEqual(a, b)) {
    return true;
  }

  if (_areRegExpsEqual(a, b)) {
    return true;
  }

  if (_isNullOrUndefined(a, b)) {
    return false;
  }

  if (!_prototypesMatch(a, b)) {
    return false;
  }

  if (_areMapsEqual(a, b)) {
    return true;
  }

  if (_areNumbersEqual(a, b)) {
    return true;
  }

  if (_areBuffersEqual(a, b)) {
    return true;
  }

  if (_areArraysEqual(a, b)) {
    return true;
  }

  const [normalizedA, normalizedB] = _normalizeMongooseObjects(a, b);
  const ka = Object.keys(normalizedA);
  const kb = Object.keys(normalizedB);

  if (!_keysMatch(ka, kb)) {
    return false;
  }

  return _objectPropertiesEqual(normalizedA, normalizedB, ka);
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

/*!
 * Check if discriminator schema merge should skip nested type mismatch
 * @api private
 */
function _shouldSkipDiscriminatorMerge(fromVal, toVal) {
  return (fromVal.$isSingleNested && toVal.$isMongooseDocumentArray) ||
         (fromVal.$isMongooseDocumentArray && toVal.$isSingleNested);
}

/*!
 * Handle schema merge for discriminator schemas
 * @api private
 */
function _mergeSchema(toVal, fromVal, isDiscriminatorSchemaMerge) {
  if (toVal.instanceOfSchema) {
    schemaMerge(toVal, fromVal.clone(), isDiscriminatorSchemaMerge);
  } else {
    return fromVal.clone();
  }
}

/*!
 * Handle ObjectId merge
 * @api private
 */
function _mergeObjectId(fromVal) {
  return new ObjectId(fromVal);
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
    if (options.omit && options.omit[key]) {
      continue;
    }
    if (omitNested[path]) {
      continue;
    }
    if (specialProperties.has(key)) {
      continue;
    }
    if (to[key] == null) {
      to[key] = from[key];
    } else if (exports.isObject(from[key])) {
      if (!exports.isObject(to[key])) {
        to[key] = {};
      }
      if (from[key] != null) {
        if (options.isDiscriminatorSchemaMerge &&
            _shouldSkipDiscriminatorMerge(from[key], to[key])) {
          continue;
        } else if (from[key].instanceOfSchema) {
          to[key] = _mergeSchema(to[key], from[key], options.isDiscriminatorSchemaMerge);
          continue;
        } else if (from[key] instanceof ObjectId) {
          to[key] = _mergeObjectId(from[key]);
          continue;
        }
      }
      merge(to[key], from[key], options, path ? path + '.' + key : key);
    } else if (options.overwrite) {
      to[key] = from[key];
    }
  }
};

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

exports.expires = function expires(object) {
  if (!(object && object.constructor.name === 'Object')) {
    return;
  }
  if (!('expires' in object)) {
    return;
  }

  let when;
  if (typeof object.expires !== 'string') {
    when = object.expires;
  } else {
    when = Math.round(ms(object.expires) / 1000);
  }
  object.expireAfterSeconds = when;
  delete object.expires;
};

/*!
 * Split populate path by whitespace
 * @api private
 */
function _splitPopulatePath(path) {
  return path.split(' ');
}

/*!
 * Create single populate object from path
 * @api private
 */
function _createSinglePopulate(obj, path) {
  const copy = Object.assign({}, obj);
  copy.path = path;
  return copy;
}

/*!
 * Process array of populate objects, splitting paths with spaces
 * @api private
 */
function _makeSingles(arr) {
  const ret = [];
  arr.forEach(function(obj) {
    if (/[\s]/.test(obj.path)) {
      const paths = _splitPopulatePath(obj.path);
      paths.forEach(function(p) {
        ret.push(_createSinglePopulate(obj, p));
      });
    } else {
      ret.push(obj);
    }
  });
  return ret;
}

/*!
 * Determine populate object from arguments
 * @api private
 */
function _buildPopulateObject(path, select, model, match, options, subPopulate, justOne, count) {
  if (typeof model === 'object') {
    return {
      path: path,
      select: select,
      match: model,
      options: match
    };
  }
  return {
    path: path,
    select: select,
    model: model,
    match: match,
    options: options,
    populate: subPopulate,
    justOne: justOne,
    count: count
  };
}

/*!
 * populate helper
 */

exports.populate = function populate(path, select, model, match, options, subPopulate, justOne, count) {
  // might have passed an object specifying all arguments
  let obj = null;
  if (arguments.length === 1) {
    if (path instanceof PopulateOptions) {
      return [path];
    }

    if (Array.isArray(path)) {
      const singles = _makeSingles(path);
      return singles.map(o => exports.populate(o)[0]);
    }

    if (exports.isObject(path)) {
      obj = Object.assign({}, path);
    } else {
      obj = { path: path };
    }
  } else {
    obj = _buildPopulateObject(path, select, model, match, options, subPopulate, justOne, count);
  }

  if (typeof obj.path !== 'string') {
    throw new TypeError('utils.populate: invalid path. Expected string. Got typeof `' + typeof path + '`');
  }

  return _populateObj(obj);
};

/*!
 * Process nested populate paths with space separation
 * @api private
 */
function _processNestedPopulate(populateArr) {
  const ret = [];
  populateArr.forEach(function(obj) {
    if (/[\s]/.test(obj.path)) {
      const copy = Object.assign({}, obj);
      const paths = _splitPopulatePath(copy.path);
      paths.forEach(function(p) {
        copy.path = p;
        ret.push(exports.populate(copy)[0]);
      });
    } else {
      ret.push(exports.populate(obj)[0]);
    }
  });
  return ret;
}

function _populateObj(obj) {
  if (Array.isArray(obj.populate)) {
    obj.populate = _processNestedPopulate(obj.populate);
    obj.populate = exports.populate(obj.populate);
  } else if (obj.populate != null && typeof obj.populate === 'object') {
    obj.populate = exports.populate(obj.populate);
  }

  const ret = [];
  const paths = _splitPopulatePath(obj.path);
  if (obj.options != null) {
    obj.options = exports.clone(obj.options);
  }

  for (const path of paths) {
    ret.push(new PopulateOptions(Object.assign({}, obj, { path: path })));
  }

  return ret;
}

/*!
 * Return the value of `obj` at the given `path`.
 *
 * @param {String} path
 * @param {Object} obj
 */

exports.getValue = function(path, obj, map) {
  return mpath.get(path, obj, '_doc', map);
};

/*!
 * Sets the value of `obj` at the given `path`.
 *
 * @param {String} path
 * @param {Anything} val
 * @param {Object} obj
 */

exports.setValue = function(path, val, obj, map, _copying) {
  mpath.set(path, val, obj, '_doc', map, _copying);
};

/*!
 * Returns an array of values from object `o`.
 *
 * @param {Object} o
 * @return {Array}
 * @private
 */

exports.object = {};
exports.object.vals = function vals(o) {
  const keys = Object.keys(o);
  let i = keys.length;
  const ret = [];

  while (i--) {
    ret.push(o[keys[i]]);
  }

  return ret;
};

/*!
 * @see exports.options
 */

exports.object.shallowCopy = exports.options;

/*!
 * Safer helper for hasOwnProperty checks
 *
 * @param {Object} obj
 * @param {String} prop
 */

const hop = Object.prototype.hasOwnProperty;
exports.object.hasOwnProperty = function(obj, prop) {
  return hop.call(obj, prop);
};

/*!
 * Determine if `val` is null or undefined
 *
 * @return {Boolean}
 */

exports.isNullOrUndefined = function(val) {
  return val === null || val === undefined;
};

/*!
 * ignore
 */

exports.array = {};

/*!
 * Flattens an array.
 *
 * [ 1, [ 2, 3, [4] ]] -> [1,2,3,4]
 *
 * @param {Array} arr
 * @param {Function} [filter] If passed, will be invoked with each item in the array. If `filter` returns a falsy value, the item will not be included in the results.
 * @return {Array}
 * @private
 */

exports.array.flatten = function flatten(arr, filter, ret) {
  ret || (ret = []);

  arr.forEach(function(item) {
    if (Array.isArray(item)) {
      flatten(item, filter, ret);
    } else {
      if (!filter || filter(item)) {
        ret.push(item);
      }
    }
  });

  return ret;
};

/*!
 * ignore
 */

const _hasOwnProperty = Object.prototype.hasOwnProperty;

exports.hasUserDefinedProperty = function(obj, key) {
  if (obj == null) {
    return false;
  }

  if (Array.isArray(key)) {
    for (const k of key) {
      if (exports.hasUserDefinedProperty(obj, k)) {
        return true;
      }
    }
    return false;
  }

  if (_hasOwnProperty.call(obj, key)) {
    return true;
  }
  if (typeof obj === 'object' && key in obj) {
    const v = obj[key];
    return v !== Object.prototype[key] && v !== Array.prototype[key];
  }

  return false;
};

/*!
 * ignore
 */

const MAX_ARRAY_INDEX = Math.pow(2, 32) - 1;

exports.isArrayIndex = function(val) {
  if (typeof val === 'number') {
    return val >= 0 && val <= MAX_ARRAY_INDEX;
  }
  if (typeof val === 'string') {
    if (!/^\d+$/.test(val)) {
      return false;
    }
    val = +val;
    return val >= 0 && val <= MAX_ARRAY_INDEX;
  }

  return false;
};

/*!
 * Removes duplicate values from an array
 *
 * [1, 2, 3, 3, 5] => [1, 2, 3, 5]
 * [ ObjectId("550988ba0c19d57f697dc45e"), ObjectId("550988ba0c19d57f697dc45e") ]
 *    => [ObjectId("550988ba0c19d57f697dc45e")]
 *
 * @param {Array} arr
 * @return {Array}
 * @private
 */

exports.array.unique = function(arr) {
  const primitives = new Set();
  const ids = new Set();
  const ret = [];

  for (const item of arr) {
    if (typeof item === 'number' || typeof item === 'string' || item == null) {
      if (primitives.has(item)) {
        continue;
      }
      ret.push(item);
      primitives.add(item);
    } else if (item instanceof ObjectId) {
      if (ids.has(item.toString())) {
        continue;
      }
      ret.push(item);
      ids.add(item.toString());
    } else {
      ret.push(item);
    }
  }

  return ret;
};

/*!
 * Determines if two buffers are equal.
 *
 * @param {Buffer} a
 * @param {Object} b
 */

exports.buffer = {};
exports.buffer.areEqual = function(a, b) {
  if (!Buffer.isBuffer(a)) {
    return false;
  }
  if (!Buffer.isBuffer(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0, len = a.length; i < len; ++i) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

exports.getFunctionName = getFunctionName;
/*!
 * Decorate buffers
 */

exports.decorate = function(destination, source) {
  for (const key in source) {
    if (specialProperties.has(key)) {
      continue;
    }
    destination[key] = source[key];
  }
};

/*!
 * Convert Mongoose object to plain object with specific options
 * @api private
 */
function _toPlainObject(obj) {
  return obj.toObject({
    transform: false,
    virtuals: false,
    depopulate: true,
    getters: false,
    flattenDecimals: false
  });
}

/*!
 * Get clone options for mergeClone
 * @api private
 */
function _getCloneOptions(flattenDecimals) {
  return {
    transform: false,
    virtuals: false,
    depopulate: true,
    getters: false,
    flattenDecimals: flattenDecimals !== false
  };
}

/*!
 * Process value for mergeClone
 * @api private
 */
function _processValueForMerge(val) {
  if (val != null && val.valueOf && !(val instanceof Date)) {
    return val.valueOf();
  }
  return val;
}

/*!
 * Convert value to object for mergeClone
 * @api private
 */
function _valueToObject(val) {
  let obj = val;
  if (isMongooseObject(val) && !val.isMongooseBuffer) {
    obj = _toPlainObject(val);
  }
  if (val.isMongooseBuffer) {
    obj = Buffer.from(obj);
  }
  return obj;
}

/**
 * merges to with a copy of from
 *
 * @param {Object} to
 * @param {Object} fromObj
 * @api private
 */

exports.mergeClone = function(to, fromObj) {
  if (isMongooseObject(fromObj)) {
    fromObj = _toPlainObject(fromObj);
  }
  const keys = Object.keys(fromObj);
  const len = keys.length;
  let i = 0;
  let key;

  while (i < len) {
    key = keys[i++];
    if (specialProperties.has(key)) {
      continue;
    }
    if (typeof to[key] === 'undefined') {
      to[key] = exports.clone(fromObj[key], _getCloneOptions(false));
    } else {
      let val = _processValueForMerge(fromObj[key]);
      if (exports.isObject(val)) {
        const obj = _valueToObject(val);
        exports.mergeClone(to[key], obj);
      } else {
        to[key] = exports.clone(val, _getCloneOptions(false));
      }
    }
  }
};

/**
 * Executes a function on each element of an array (like _.each)
 *
 * @param {Array} arr
 * @param {Function} fn
 * @api private
 */

exports.each = function(arr, fn) {
  for (const item of arr) {
    fn(item);
  }
};

/*!
 * ignore
 */

exports.getOption = function(name) {
  const sources = Array.prototype.slice.call(arguments, 1);

  for (const source of sources) {
    if (source[name] != null) {
      return source[name];
    }
  }

  return null;
};

/*!
 * ignore
 */

exports.noop = function() {};

exports.errorToPOJO = function errorToPOJO(error) {
  const isError = error instanceof Error;
  if (!isError) {
    throw new Error('`error` must be `instanceof Error`.');
  }

  const ret = {};
  for (const properyName of Object.getOwnPropertyNames(error)) {
    ret[properyName] = error[properyName];
  }
  return ret;
};

exports.nodeMajorVersion = function nodeMajorVersion() {
  return parseInt(process.versions.node.split('.')[0], 10);
};