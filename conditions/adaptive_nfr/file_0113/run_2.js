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

/**
 * Checks if two values are the same reference or primitive
 * @param {any} a
 * @param {any} b
 * @return {Boolean}
 * @api private
 */
function _deepEqualPrimitiveCheck(a, b) {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }
  return null;
}

/**
 * Checks if two values are dates with equal time
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualDateCheck(a, b) {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return null;
}

/**
 * Checks if two values are BSON types with equal string representation
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualBsonCheck(a, b) {
  if ((isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
      (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128'))) {
    return a.toString() === b.toString();
  }
  return null;
}

/**
 * Checks if two values are RegExp with equal properties
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualRegExpCheck(a, b) {
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source &&
        a.ignoreCase === b.ignoreCase &&
        a.multiline === b.multiline &&
        a.global === b.global;
  }
  return null;
}

/**
 * Checks if either value is null or undefined
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualNullCheck(a, b) {
  if (a == null || b == null) {
    return false;
  }
  return null;
}

/**
 * Checks if two values have the same prototype
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualPrototypeCheck(a, b) {
  if (a.prototype !== b.prototype) {
    return false;
  }
  return null;
}

/**
 * Checks if two values are Maps with equal keys and values
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualMapCheck(a, b) {
  if (a instanceof Map && b instanceof Map) {
    return exports.deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      exports.deepEqual(Array.from(a.values()), Array.from(b.values()));
  }
  return null;
}

/**
 * Checks if two values are Numbers with equal valueOf
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualNumberCheck(a, b) {
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }
  return null;
}

/**
 * Checks if two values are Buffers with equal content
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualBufferCheck(a, b) {
  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }
  return null;
}

/**
 * Checks if two values are Arrays with equal elements
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualArrayCheck(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
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
  return null;
}

/**
 * Converts Mongoose objects to plain objects for comparison
 * @param {any} a
 * @param {any} b
 * @return {Array} [convertedA, convertedB]
 * @api private
 */
function _deepEqualConvertMongooseObjects(a, b) {
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

/**
 * Compares object keys
 * @param {Object} a
 * @param {Object} b
 * @return {Boolean}
 * @api private
 */
function _deepEqualKeysCheck(a, b) {
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

  return true;
}

/**
 * Compares object values recursively
 * @param {Object} a
 * @param {Object} b
 * @param {Array} keys
 * @return {Boolean}
 * @api private
 */
function _deepEqualValuesCheck(a, b, keys) {
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
  let result = _deepEqualPrimitiveCheck(a, b);
  if (result !== null) {
    return result;
  }

  result = _deepEqualDateCheck(a, b);
  if (result !== null) {
    return result;
  }

  result = _deepEqualBsonCheck(a, b);
  if (result !== null) {
    return result;
  }

  result = _deepEqualRegExpCheck(a, b);
  if (result !== null) {
    return result;
  }

  result = _deepEqualNullCheck(a, b);
  if (result !== null) {
    return result;
  }

  result = _deepEqualPrototypeCheck(a, b);
  if (result !== null) {
    return result;
  }

  result = _deepEqualMapCheck(a, b);
  if (result !== null) {
    return result;
  }

  result = _deepEqualNumberCheck(a, b);
  if (result !== null) {
    return result;
  }

  result = _deepEqualBufferCheck(a, b);
  if (result !== null) {
    return result;
  }

  result = _deepEqualArrayCheck(a, b);
  if (result !== null) {
    return result;
  }

  const converted = _deepEqualConvertMongooseObjects(a, b);
  a = converted[0];
  b = converted[1];

  if (!_deepEqualKeysCheck(a, b)) {
    return false;
  }

  const ka = Object.keys(a);
  return _deepEqualValuesCheck(a, b, ka);
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

/**
 * Merge options object
 * @typedef {Object} MergeOptions
 * @property {Object} [omit] Keys to omit from merge
 * @property {Object} [omitNested] Nested paths to omit
 * @property {Boolean} [overwrite] Whether to overwrite existing values
 * @property {Boolean} [isDiscriminatorSchemaMerge] Whether this is a discriminator schema merge
 */

/**
 * Checks if merge should skip a key based on options
 * @param {String} key
 * @param {MergeOptions} options
 * @return {Boolean}
 * @api private
 */
function _shouldSkipMergeKey(key, options) {
  if (options.omit && options.omit[key]) {
    return true;
  }
  if (specialProperties.has(key)) {
    return true;
  }
  return false;
}

/**
 * Checks if merge should skip nested path
 * @param {String} path
 * @param {Object} omitNested
 * @return {Boolean}
 * @api private
 */
function _shouldSkipNestedPath(path, omitNested) {
  return omitNested && omitNested[path];
}

/**
 * Handles schema merge for discriminator schemas
 * @param {Object} toVal
 * @param {Object} fromVal
 * @param {Boolean} isDiscriminatorSchemaMerge
 * @return {Boolean} true if handled, false otherwise
 * @api private
 */
function _handleSchemaMerge(toVal, fromVal, isDiscriminatorSchemaMerge) {
  if (!isDiscriminatorSchemaMerge) {
    return false;
  }

  const isSingleNestedMismatch = (fromVal.$isSingleNested && toVal.$isMongooseDocumentArray) ||
                                  (fromVal.$isMongooseDocumentArray && toVal.$isSingleNested);

  return isSingleNestedMismatch;
}

/**
 * Handles schema instance merge
 * @param {Object} toVal
 * @param {Object} fromVal
 * @param {Boolean} isDiscriminatorSchemaMerge
 * @return {Boolean} true if handled, false otherwise
 * @api private
 */
function _handleSchemaInstance(toVal, fromVal, isDiscriminatorSchemaMerge) {
  if (!fromVal.instanceOfSchema) {
    return false;
  }

  if (toVal.instanceOfSchema) {
    schemaMerge(toVal, fromVal.clone(), isDiscriminatorSchemaMerge);
  } else {
    toVal = fromVal.clone();
  }

  return true;
}

/**
 * Handles ObjectId merge
 * @param {Object} toVal
 * @param {Object} fromVal
 * @return {Boolean} true if handled, false otherwise
 * @api private
 */
function _handleObjectIdMerge(toVal, fromVal) {
  if (!(fromVal instanceof ObjectId)) {
    return false;
  }

  toVal = new ObjectId(fromVal);
  return true;
}

/**
 * Merges object value at a key
 * @param {Object} to
 * @param {String} key
 * @param {Object} from
 * @param {MergeOptions} options
 * @param {String} path
 * @api private
 */
function _mergeObjectValue(to, key, from, options, path) {
  if (!exports.isObject(from[key])) {
    if (options.overwrite) {
      to[key] = from[key];
    }
    return;
  }

  if (!exports.isObject(to[key])) {
    to[key] = {};
  }

  if (from[key] == null) {
    return;
  }

  if (_handleSchemaMerge(to[key], from[key], options.isDiscriminatorSchemaMerge)) {
    return;
  }

  if (_handleSchemaInstance(to[key], from[key], options.isDiscriminatorSchemaMerge)) {
    return;
  }

  if (_handleObjectIdMerge(to[key], from[key])) {
    return;
  }

  const newPath = path ? path + '.' + key : key;
  exports.merge(to[key], from[key], options, newPath);
}

/*!
 * Merges `from` into `to` without overwriting existing properties.
 *
 * @param {Object} to
 * @param {Object} from
 * @param {MergeOptions} [options]
 * @param {String} [path]
 * @api private
 */

exports.merge = function merge(to, from, options, path) {
  options = options || {};
  path = path || '';

  const keys = Object.keys(from);
  let i = 0;
  const len = keys.length;
  let key;

  const omitNested = options.omitNested || {};

  while (i < len) {
    key = keys[i++];

    if (_shouldSkipMergeKey(key, options)) {
      continue;
    }

    if (_shouldSkipNestedPath(path, omitNested)) {
      continue;
    }

    if (to[key] == null) {
      to[key] = from[key];
    } else {
      _mergeObjectValue(to, key, from, options, path);
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

/**
 * Populate options builder
 * @typedef {Object} PopulateConfig
 * @property {String} path
 * @property {String|Object} [select]
 * @property {String|Function} [model]
 * @property {Object} [match]
 * @property {Object} [options]
 * @property {Array|Object} [populate]
 * @property {Boolean} [justOne]
 * @property {Boolean} [count]
 */

/**
 * Builds populate config from arguments
 * @param {String|Object|Array} path
 * @param {String|Object} [select]
 * @param {String|Function|Object} [model]
 * @param {Object} [match]
 * @return {PopulateConfig}
 * @api private
 */
function _buildPopulateConfig(path, select, model, match) {
  let obj = null;

  if (typeof model === 'object' && typeof select === 'string') {
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
      match: match
    };
  }

  return obj;
}

/**
 * Splits populate path by spaces and creates individual populate objects
 * @param {Array} arr
 * @return {Array}
 * @api private
 */
function _makeSingles(arr) {
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
    obj = _buildPopulateConfig(path, select, model, match);
    if (options != null) {
      obj.options = options;
    }
    if (subPopulate != null) {
      obj.populate = subPopulate;
    }
    if (justOne != null) {
      obj.justOne = justOne;
    }
    if (count != null) {
      obj.count = count;
    }
  }

  if (typeof obj.path !== 'string') {
    throw new TypeError('utils.populate: invalid path. Expected string. Got typeof `' + typeof path + '`');
  }

  return _populateObj(obj);
};

function _populateObj(obj) {
  if (Array.isArray(obj.populate)) {
    const ret = [];
    obj.populate.forEach(function(obj) {
      if (/[\s]/.test(obj.path)) {
        const copy = Object.assign({}, obj);
        const paths = copy.path.split(' ');
        paths.forEach(function(p) {
          copy.path = p;
          ret.push(exports.populate(copy)[0]);
        });
      } else {
        ret.push(exports.populate(obj)[0]);
      }
    });
    obj.populate = exports.populate(ret);
  } else if (obj.populate != null && typeof obj.populate === 'object') {
    obj.populate = exports.populate(obj.populate);
  }

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

/**
 * Merge clone options
 * @typedef {Object} MergeCloneOptions
 * @property {Boolean} [transform]
 * @property {Boolean} [virtuals]
 * @property {Boolean} [depopulate]
 * @property {Boolean} [getters]
 * @property {Boolean} [flattenDecimals]
 */

/**
 * Gets standard merge clone options
 * @return {MergeCloneOptions}
 * @api private
 */
function _getStandardMergeCloneOptions() {
  return {
    transform: false,
    virtuals: false,
    depopulate: true,
    getters: false,
    flattenDecimals: false
  };
}

/**
 * Processes a single key during merge clone
 * @param {Object} to
 * @param {String} key
 * @param {Object} fromObj
 * @param {MergeCloneOptions} opts
 * @api private
 */
function _mergeCloneKey(to, key, fromObj, opts) {
  if (typeof to[key] === 'undefined') {
    to[key] = exports.clone(fromObj[key], opts);
    return;
  }

  let val = fromObj[key];
  if (val != null && val.valueOf && !(val instanceof Date)) {
    val = val.valueOf();
  }

  if (!exports.isObject(val)) {
    to[key] = exports.clone(val, { flattenDecimals: false });
    return;
  }

  let obj = val;
  if (isMongooseObject(val) && !val.isMongooseBuffer) {
    obj = obj.toObject(opts);
  }
  if (val.isMongooseBuffer) {
    obj = Buffer.from(obj);
  }

  exports.mergeClone(to[key], obj);
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
    fromObj = fromObj.toObject(_getStandardMergeCloneOptions());
  }

  const keys = Object.keys(fromObj);
  const len = keys.length;
  let i = 0;
  let key;
  const opts = _getStandardMergeCloneOptions();

  while (i < len) {
    key = keys[i++];
    if (specialProperties.has(key)) {
      continue;
    }
    _mergeCloneKey(to, key, fromObj, opts);
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