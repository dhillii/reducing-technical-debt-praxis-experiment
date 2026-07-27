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
 * Checks if two dates are equal
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
 * Checks if two BSON types are equal
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
 * Checks if two RegExp objects are equal
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
 * Checks if prototypes match
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
 * Checks if two Maps are equal
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualMapCheck(a, b) {
  if (a instanceof Map && b instanceof Map) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }
  return null;
}

/**
 * Checks if two Numbers are equal
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
 * Checks if two Buffers are equal
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
 * Checks if two Arrays are equal
 * @param {any} a
 * @param {any} b
 * @return {Boolean|null}
 * @api private
 */
function _deepEqualArrayCheck(a, b) {
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

/**
 * Converts Mongoose objects to plain objects for comparison
 * @param {any} obj
 * @return {any}
 * @api private
 */
function _deepEqualConvertMongooseObject(obj) {
  if (obj.$__ != null) {
    return obj._doc;
  }
  if (isMongooseObject(obj)) {
    return obj.toObject();
  }
  return obj;
}

/**
 * Compares object keys
 * @param {Array} ka
 * @param {Array} kb
 * @return {Boolean}
 * @api private
 */
function _deepEqualKeysMatch(ka, kb) {
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
 * Compares object values by key
 * @param {Object} a
 * @param {Object} b
 * @param {Array} ka
 * @return {Boolean}
 * @api private
 */
function _deepEqualObjectValues(a, b, ka) {
  for (const key of ka) {
    if (!deepEqual(a[key], b[key])) {
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

function deepEqual(a, b) {
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

  a = _deepEqualConvertMongooseObject(a);
  b = _deepEqualConvertMongooseObject(b);

  const ka = Object.keys(a);
  const kb = Object.keys(b);

  if (!_deepEqualKeysMatch(ka, kb)) {
    return false;
  }

  return _deepEqualObjectValues(a, b, ka);
}

exports.deepEqual = deepEqual;

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
 * @param {Object} options
 * @return {Object}
 * @api private
 */
function _createMergeOptions(options) {
  return {
    omitNested: (options && options.omitNested) || {},
    omit: options && options.omit,
    overwrite: options && options.overwrite,
    isDiscriminatorSchemaMerge: options && options.isDiscriminatorSchemaMerge
  };
}

/**
 * Check if key should be skipped during merge
 * @param {Object} mergeOpts
 * @param {String} key
 * @param {String} path
 * @return {Boolean}
 * @api private
 */
function _shouldSkipMergeKey(mergeOpts, key, path) {
  if (mergeOpts.omit && mergeOpts.omit[key]) {
    return true;
  }
  if (mergeOpts.omitNested[path]) {
    return true;
  }
  if (specialProperties.has(key)) {
    return true;
  }
  return false;
}

/**
 * Check if discriminator schema merge should be skipped
 * @param {Object} fromVal
 * @param {Object} toVal
 * @param {Boolean} isDiscriminatorMerge
 * @return {Boolean}
 * @api private
 */
function _shouldSkipDiscriminatorMerge(fromVal, toVal, isDiscriminatorMerge) {
  if (!isDiscriminatorMerge) {
    return false;
  }
  return (fromVal.$isSingleNested && toVal.$isMongooseDocumentArray) ||
         (fromVal.$isMongooseDocumentArray && toVal.$isSingleNested);
}

/**
 * Handle schema merge
 * @param {Object} toVal
 * @param {Object} fromVal
 * @param {Boolean} isDiscriminatorMerge
 * @api private
 */
function _handleSchemaMerge(toVal, fromVal, isDiscriminatorMerge) {
  if (toVal.instanceOfSchema) {
    schemaMerge(toVal, fromVal.clone(), isDiscriminatorMerge);
  } else {
    toVal = fromVal.clone();
  }
}

/**
 * Handle nested object merge
 * @param {Object} to
 * @param {Object} from
 * @param {Object} mergeOpts
 * @param {String} path
 * @api private
 */
function _mergeNestedObject(to, from, mergeOpts, path) {
  if (!exports.isObject(to)) {
    to = {};
  }
  if (from != null) {
    if (_shouldSkipDiscriminatorMerge(from, to, mergeOpts.isDiscriminatorSchemaMerge)) {
      return;
    }
    if (from.instanceOfSchema) {
      _handleSchemaMerge(to, from, mergeOpts.isDiscriminatorSchemaMerge);
      return;
    }
    if (from instanceof ObjectId) {
      return new ObjectId(from);
    }
  }
  merge(to, from, mergeOpts, path ? path + '.' + Object.keys(from)[0] : Object.keys(from)[0]);
}

/*!
 * Merges `from` into `to` without overwriting existing properties.
 *
 * @param {Object} to
 * @param {Object} from
 * @param {Object} options
 * @api private
 */

function merge(to, from, options, path) {
  const mergeOpts = _createMergeOptions(options);
  const keys = Object.keys(from);
  let i = 0;
  const len = keys.length;
  let key;

  path = path || '';

  while (i < len) {
    key = keys[i++];
    if (_shouldSkipMergeKey(mergeOpts, key, path)) {
      continue;
    }
    if (to[key] == null) {
      to[key] = from[key];
    } else if (exports.isObject(from[key])) {
      _mergeNestedObject(to[key], from[key], mergeOpts, path);
    } else if (mergeOpts.overwrite) {
      to[key] = from[key];
    }
  }
}

exports.merge = merge;

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
 * @api private
 */
class PopulateBuilder {
  constructor() {
    this.obj = {};
  }

  setPath(path) {
    this.obj.path = path;
    return this;
  }

  setSelect(select) {
    this.obj.select = select;
    return this;
  }

  setModel(model) {
    this.obj.model = model;
    return this;
  }

  setMatch(match) {
    this.obj.match = match;
    return this;
  }

  setOptions(options) {
    this.obj.options = options;
    return this;
  }

  setPopulate(populate) {
    this.obj.populate = populate;
    return this;
  }

  setJustOne(justOne) {
    this.obj.justOne = justOne;
    return this;
  }

  setCount(count) {
    this.obj.count = count;
    return this;
  }

  build() {
    return this.obj;
  }
}

/**
 * Build populate object from arguments
 * @param {String} path
 * @param {any} select
 * @param {any} model
 * @param {any} match
 * @param {any} options
 * @param {any} subPopulate
 * @param {any} justOne
 * @param {any} count
 * @return {Object}
 * @api private
 */
function _buildPopulateObject(path, select, model, match, options, subPopulate, justOne, count) {
  const builder = new PopulateBuilder();
  builder.setPath(path);
  builder.setSelect(select);
  builder.setModel(model);
  builder.setMatch(match);
  builder.setOptions(options);
  builder.setPopulate(subPopulate);
  builder.setJustOne(justOne);
  builder.setCount(count);
  return builder.build();
}

/**
 * Handle single populate argument
 * @param {any} path
 * @return {Array}
 * @api private
 */
function _handleSinglePopulateArg(path) {
  if (path instanceof PopulateOptions) {
    return [path];
  }

  if (Array.isArray(path)) {
    const singles = _makeSingles(path);
    return singles.map(o => exports.populate(o)[0]);
  }

  if (exports.isObject(path)) {
    return _populateObj(Object.assign({}, path));
  }

  return _populateObj({ path: path });
}

/**
 * Split populate paths by whitespace
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
    return _handleSinglePopulateArg(path);
  } else if (typeof model === 'object') {
    obj = {
      path: path,
      select: select,
      match: model,
      options: match
    };
  } else {
    obj = _buildPopulateObject(path, select, model, match, options, subPopulate, justOne, count);
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
 * Merge clone options object
 * @return {Object}
 * @api private
 */
function _createMergeCloneOptions() {
  return {
    transform: false,
    virtuals: false,
    depopulate: true,
    getters: false,
    flattenDecimals: false
  };
}

/**
 * Handle merging Mongoose object
 * @param {Object} fromObj
 * @return {Object}
 * @api private
 */
function _handleMergeCloneMongooseObject(fromObj) {
  if (isMongooseObject(fromObj)) {
    return fromObj.toObject(_createMergeCloneOptions());
  }
  return fromObj;
}

/**
 * Handle merging value
 * @param {Object} to
 * @param {String} key
 * @param {any} val
 * @api private
 */
function _handleMergeCloneValue(to, key, val) {
  if (val != null && val.valueOf && !(val instanceof Date)) {
    val = val.valueOf();
  }
  if (exports.isObject(val)) {
    let obj = val;
    if (isMongooseObject(val) && !val.isMongooseBuffer) {
      obj = obj.toObject(_createMergeCloneOptions());
    }
    if (val.isMongooseBuffer) {
      obj = Buffer.from(obj);
    }
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
  fromObj = _handleMergeCloneMongooseObject(fromObj);
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
      to[key] = exports.clone(fromObj[key], _createMergeCloneOptions());
    } else {
      _handleMergeCloneValue(to, key, fromObj[key]);
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