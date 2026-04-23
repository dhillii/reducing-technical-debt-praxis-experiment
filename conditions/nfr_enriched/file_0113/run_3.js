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

// Check if two values are identical primitives
function _arePrimitivesEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }
  return null;
}

// Check if two dates are equal
function _areDatesEqual(a, b) {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return null;
}

// Check if two BSON types are equal
function _areBsonTypesEqual(a, b) {
  if ((isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
      (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128'))) {
    return a.toString() === b.toString();
  }
  return null;
}

// Check if two RegExp objects are equal
function _areRegExpsEqual(a, b) {
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source &&
        a.ignoreCase === b.ignoreCase &&
        a.multiline === b.multiline &&
        a.global === b.global;
  }
  return null;
}

// Check if two Map objects are equal
function _areMapsEqual(a, b, deepEqual) {
  if (a instanceof Map && b instanceof Map) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }
  return null;
}

// Check if two Number objects are equal
function _areNumbersEqual(a, b) {
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }
  return null;
}

// Check if two arrays are equal
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

// Convert Mongoose objects to plain objects for comparison
function _normalizeObjectsForComparison(a, b) {
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

// Check if two objects have the same keys
function _haveEqualKeys(ka, kb) {
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

// Check if two objects have equal values for all keys
function _haveEqualValues(a, b, ka, deepEqual) {
  for (const key of ka) {
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

exports.deepEqual = function deepEqual(a, b) {
  let result = _arePrimitivesEqual(a, b);
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

  result = _areRegExpsEqual(a, b);
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

  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }

  result = _areArraysEqual(a, b, deepEqual);
  if (result !== null) {
    return result;
  }

  [a, b] = _normalizeObjectsForComparison(a, b);

  const ka = Object.keys(a);
  const kb = Object.keys(b);

  if (!_haveEqualKeys(ka, kb)) {
    return false;
  }

  return _haveEqualValues(a, b, ka, deepEqual);
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

// Check if discriminator schema merge should skip this property
function _shouldSkipDiscriminatorMerge(fromValue, toValue) {
  return (fromValue.$isSingleNested && toValue.$isMongooseDocumentArray) ||
         (fromValue.$isMongooseDocumentArray && toValue.$isSingleNested);
}

// Handle schema merging for a property
function _mergeSchemaProperty(to, key, from, options) {
  if (from[key].instanceOfSchema) {
    if (to[key].instanceOfSchema) {
      schemaMerge(to[key], from[key].clone(), options.isDiscriminatorSchemaMerge);
    } else {
      to[key] = from[key].clone();
    }
    return true;
  }
  return false;
}

// Handle ObjectId merging for a property
function _mergeObjectIdProperty(to, key, from) {
  if (from[key] instanceof ObjectId) {
    to[key] = new ObjectId(from[key]);
    return true;
  }
  return false;
}

// Merge nested object properties recursively
function _mergeNestedObject(to, key, from, options, path) {
  if (!exports.isObject(to[key])) {
    to[key] = {};
  }
  if (from[key] != null) {
    if (options.isDiscriminatorSchemaMerge && _shouldSkipDiscriminatorMerge(from[key], to[key])) {
      return true;
    }
    if (_mergeSchemaProperty(to, key, from, options)) {
      return true;
    }
    if (_mergeObjectIdProperty(to, key, from)) {
      return true;
    }
  }
  exports.merge(to[key], from[key], options, path ? path + '.' + key : key);
  return true;
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
      if (_mergeNestedObject(to, key, from, options, path)) {
        continue;
      }
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

// Convert array elements to objects recursively
function _toObjectArray(obj) {
  const ret = [];
  for (const doc of obj) {
    ret.push(exports.toObject(doc));
  }
  return ret;
}

// Convert POJO properties to objects recursively
function _toObjectPOJO(obj) {
  const ret = {};
  for (const k of Object.keys(obj)) {
    if (specialProperties.has(k)) {
      continue;
    }
    ret[k] = exports.toObject(obj[k]);
  }
  return ret;
}

exports.toObject = function toObject(obj) {
  Document || (Document = require('./document'));

  if (obj == null) {
    return obj;
  }

  if (obj instanceof Document) {
    return obj.toObject();
  }

  if (Array.isArray(obj)) {
    return _toObjectArray(obj);
  }

  if (exports.isPOJO(obj)) {
    return _toObjectPOJO(obj);
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
 * Split path string by spaces into individual paths
 */
function _splitPathsBySpaces(arr) {
  const ret = [];
  arr.forEach(function(obj) {
    if (/[\s]/.test(obj.path)) {
      const paths = obj.path.split(' ');
      paths.forEach(function(p) {
        const copy = Object.assign({}, obj);
        copy.path = p;
        ret.push(copy);
      });
    } else {
      ret.push(obj);
    }
  });
  return ret;
}

/*!
 * Process nested populate arrays
 */
function _processNestedPopulate(obj) {
  if (Array.isArray(obj.populate)) {
    const ret = [];
    obj.populate.forEach(function(popObj) {
      if (/[\s]/.test(popObj.path)) {
        const copy = Object.assign({}, popObj);
        const paths = copy.path.split(' ');
        paths.forEach(function(p) {
          copy.path = p;
          ret.push(exports.populate(copy)[0]);
        });
      } else {
        ret.push(exports.populate(popObj)[0]);
      }
    });
    obj.populate = exports.populate(ret);
  } else if (obj.populate != null && typeof obj.populate === 'object') {
    obj.populate = exports.populate(obj.populate);
  }
}

/*!
 * Create PopulateOptions for each path
 */
function _createPopulateOptions(obj) {
  const ret = [];
  const paths = obj.path.split(' ');
  if (obj.options != null) {
    obj.options = exports.clone(obj.options);
  }

  for (const path of paths) {
    ret.push(new PopulateOptions(Object.assign({}, obj, { path: path })));
  }

  return ret;
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
      const singles = _splitPathsBySpaces(path);
      return singles.map(o => exports.populate(o)[0]);
    }

    if (exports.isObject(path)) {
      obj = Object.assign({}, path);
    } else {
      obj = { path: path };
    }
  } else if (typeof model === 'object') {
    obj = {
      path: path,
      select: select,
      match: model,
      options: match
    };
  } else {
    obj = {
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

  if (typeof obj.path !== 'string') {
    throw new TypeError('utils.populate: invalid path. Expected string. Got typeof `' + typeof path + '`');
  }

  return _populateObj(obj);
};

function _populateObj(obj) {
  _processNestedPopulate(obj);
  return _createPopulateOptions(obj);
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

// Check if property is defined on object or prototype chain
function _isPropertyInChain(obj, key) {
  if (typeof obj !== 'object') {
    return false;
  }
  const v = obj[key];
  return v !== Object.prototype[key] && v !== Array.prototype[key];
}

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
  return _isPropertyInChain(obj, key);
};

/*!
 * ignore
 */

const MAX_ARRAY_INDEX = Math.pow(2, 32) - 1;

// Check if string value is a valid array index
function _isStringArrayIndex(val) {
  if (!/^\d+$/.test(val)) {
    return false;
  }
  val = +val;
  return val >= 0 && val <= MAX_ARRAY_INDEX;
}

exports.isArrayIndex = function(val) {
  if (typeof val === 'number') {
    return val >= 0 && val <= MAX_ARRAY_INDEX;
  }
  if (typeof val === 'string') {
    return _isStringArrayIndex(val);
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

// Add primitive value to unique set
function _addPrimitiveToUnique(item, primitives, ret) {
  if (primitives.has(item)) {
    return false;
  }
  ret.push(item);
  primitives.add(item);
  return true;
}

// Add ObjectId to unique set
function _addObjectIdToUnique(item, ids, ret) {
  const itemStr = item.toString();
  if (ids.has(itemStr)) {
    return false;
  }
  ret.push(item);
  ids.add(itemStr);
  return true;
}

exports.array.unique = function(arr) {
  const primitives = new Set();
  const ids = new Set();
  const ret = [];

  for (const item of arr) {
    if (typeof item === 'number' || typeof item === 'string' || item == null) {
      _addPrimitiveToUnique(item, primitives, ret);
    } else if (item instanceof ObjectId) {
      _addObjectIdToUnique(item, ids, ret);
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

// Convert Mongoose object to plain object with specific options
function _mongooseObjectToPlain(obj) {
  return obj.toObject({
    transform: false,
    virtuals: false,
    depopulate: true,
    getters: false,
    flattenDecimals: false
  });
}

// Clone options for mergeClone operations
const _mergeCloneOptions = {
  transform: false,
  virtuals: false,
  depopulate: true,
  getters: false,
  flattenDecimals: false
};

// Handle merging of undefined target properties
function _mergeUndefinedProperty(to, key, fromObj) {
  to[key] = exports.clone(fromObj[key], _mergeCloneOptions);
}

// Get normalized value for merging
function _getNormalizedValue(val) {
  if (val != null && val.valueOf && !(val instanceof Date)) {
    return val.valueOf();
  }
  return val;
}

// Convert value to plain object if needed
function _convertValueToPlain(val) {
  let obj = val;
  if (isMongooseObject(val) && !val.isMongooseBuffer) {
    obj = _mongooseObjectToPlain(obj);
  }
  if (val.isMongooseBuffer) {
    obj = Buffer.from(obj);
  }
  return obj;
}

// Handle merging of existing target properties
function _mergeExistingProperty(to, key, fromObj) {
  let val = fromObj[key];
  val = _getNormalizedValue(val);
  if (exports.isObject(val)) {
    const obj = _convertValueToPlain(val);
    exports.mergeClone(to[key], obj);
  } else {
    to[key] = exports.clone(val, { flattenDecimals: false });
  }
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
    fromObj = _mongooseObjectToPlain(fromObj);
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
      _mergeUndefinedProperty(to, key, fromObj);
    } else {
      _mergeExistingProperty(to, key, fromObj);
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