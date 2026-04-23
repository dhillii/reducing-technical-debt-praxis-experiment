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

class CollectionNameOptions {
  /**
   * @param {String} name 
   * @param {Function} pluralize 
   */
  constructor(name, pluralize) {
    this.name = name;
    this.pluralize = pluralize;
  }
}

/**
 * Produces a collection name from model `name`. By default, just returns
 * the model name
 *
 * @param {CollectionNameOptions} options 
 * @return {String} a collection name
 * @api private
 */
exports.toCollectionName = function(options) {
  if (options.name === 'system.profile') {
    return options.name;
  }
  if (options.name === 'system.indexes') {
    return options.name;
  }
  if (typeof options.pluralize === 'function') {
    return options.pluralize(options.name);
  }
  return options.name;
};

class DeepEqualOptions {
  /**
   * @param {any} a 
   * @param {any} b 
   */
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
}

/**
 * Determines if `a` and `b` are deep equal.
 *
 * Modified from node/lib/assert.js
 *
 * @param {DeepEqualOptions} options 
 * @return {Boolean}
 * @api private
 */
exports.deepEqual = function(options) {
  if (options.a === options.b) {
    return true;
  }

  if (typeof options.a !== 'object' && typeof options.b !== 'object') {
    return options.a === options.b;
  }

  if (options.a instanceof Date && options.b instanceof Date) {
    return options.a.getTime() === options.b.getTime();
  }

  if ((isBsonType(options.a, 'ObjectID') && isBsonType(options.b, 'ObjectID')) ||
      (isBsonType(options.a, 'Decimal128') && isBsonType(options.b, 'Decimal128'))) {
    return options.a.toString() === options.b.toString();
  }

  if (options.a instanceof RegExp && options.b instanceof RegExp) {
    return options.a.source === options.b.source &&
        options.a.ignoreCase === options.b.ignoreCase &&
        options.a.multiline === options.b.multiline &&
        options.a.global === options.b.global;
  }

  if (options.a == null || options.b == null) {
    return false;
  }

  if (options.a.prototype !== options.b.prototype) {
    return false;
  }

  if (options.a instanceof Map && options.b instanceof Map) {
    return exports.deepEqual({ a: Array.from(options.a.keys()), b: Array.from(options.b.keys()) }) &&
      exports.deepEqual({ a: Array.from(options.a.values()), b: Array.from(options.b.values()) });
  }

  // Handle MongooseNumbers
  if (options.a instanceof Number && options.b instanceof Number) {
    return options.a.valueOf() === options.b.valueOf();
  }

  if (Buffer.isBuffer(options.a)) {
    return exports.buffer.areEqual(options.a, options.b);
  }

  if (Array.isArray(options.a) && Array.isArray(options.b)) {
    const len = options.a.length;
    if (len !== options.b.length) {
      return false;
    }
    for (let i = 0; i < len; ++i) {
      if (!exports.deepEqual({ a: options.a[i], b: options.b[i] })) {
        return false;
      }
    }
    return true;
  }

  if (options.a.$__ != null) {
    options.a = options.a._doc;
  } else if (isMongooseObject(options.a)) {
    options.a = options.a.toObject();
  }

  if (options.b.$__ != null) {
    options.b = options.b._doc;
  } else if (isMongooseObject(options.b)) {
    options.b = options.b.toObject();
  }

  const ka = Object.keys(options.a);
  const kb = Object.keys(options.b);
  const kaLength = ka.length;

  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (kaLength !== kb.length) {
    return false;
  }

  // the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();

  // ~~~cheap key test
  for (let i = kaLength - 1; i >= 0; i--) {
    if (ka[i] !== kb[i]) {
      return false;
    }
  }

  // equivalent values for every corresponding key, and
  // ~~~possibly expensive deep test
  for (const key of ka) {
    if (!exports.deepEqual({ a: options.a[key], b: options.b[key] })) {
      return false;
    }
  }

  return true;
};

/**
 * Get the last element of an array
 *
 * @param {Array} arr 
 * @return {any}
 */
exports.last = function(arr) {
  if (arr.length > 0) {
    return arr[arr.length - 1];
  }
  return void 0;
};

exports.clone = clone;

/**
 * ignore
 */

exports.promiseOrCallback = promiseOrCallback;

/**
 * ignore
 */

exports.omit = function(obj, keys) {
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

class Options {
  /**
   * @param {Object} defaults 
   * @param {Object} options 
   */
  constructor(defaults, options) {
    this.defaults = defaults;
    this.options = options;
  }
}

/**
 * Shallow copies defaults into options.
 *
 * @param {Options} options 
 * @return {Object} the merged object
 * @api private
 */
exports.options = function(options) {
  const keys = Object.keys(options.defaults);
  let i = keys.length;
  let k;

  options.options = options.options || {};

  while (i--) {
    k = keys[i];
    if (!(k in options.options)) {
      options.options[k] = options.defaults[k];
    }
  }

  return options.options;
};

/**
 * Generates a random string
 *
 * @api private
 */
exports.random = function() {
  return Math.random().toString().substr(3);
};

class MergeOptions {
  /**
   * @param {Object} to 
   * @param {Object} from 
   * @param {Object} options 
   * @param {String} path 
   */
  constructor(to, from, options, path) {
    this.to = to;
    this.from = from;
    this.options = options;
    this.path = path;
  }
}

/**
 * Merges `from` into `to` without overwriting existing properties.
 *
 * @param {MergeOptions} options 
 * @api private
 */
exports.merge = function(options) {
  options.options = options.options || {};

  const keys = Object.keys(options.from);
  let i = 0;
  const len = keys.length;
  let key;

  options.path = options.path || '';
  const omitNested = options.options.omitNested || {};

  while (i < len) {
    key = keys[i++];
    if (options.options.omit && options.options.omit[key]) {
      continue;
    }
    if (omitNested[options.path]) {
      continue;
    }
    if (specialProperties.has(key)) {
      continue;
    }
    if (options.to[key] == null) {
      options.to[key] = options.from[key];
    } else if (exports.isObject(options.from[key])) {
      if (!exports.isObject(options.to[key])) {
        options.to[key] = {};
      }
      if (options.from[key] != null) {
        // Skip merging schemas if we're creating a discriminator schema and
        // base schema has a given path as a single nested but discriminator schema
        // has the path as a document array, or vice versa (gh-9534)
        if (options.options.isDiscriminatorSchemaMerge &&
            (options.from[key].$isSingleNested && options.to[key].$isMongooseDocumentArray) ||
            (options.from[key].$isMongooseDocumentArray && options.to[key].$isSingleNested)) {
          continue;
        } else if (options.from[key].instanceOfSchema) {
          if (options.to[key].instanceOfSchema) {
            schemaMerge(options.to[key], options.from[key].clone(), options.options.isDiscriminatorSchemaMerge);
          } else {
            options.to[key] = options.from[key].clone();
          }
          continue;
        } else if (options.from[key] instanceof ObjectId) {
          options.to[key] = new ObjectId(options.from[key]);
          continue;
        }
      }
      exports.merge(new MergeOptions(options.to[key], options.from[key], options.options, options.path ? options.path + '.' + key : key));
    } else if (options.options.overwrite) {
      options.to[key] = options.from[key];
    }
  }
};

/**
 * Applies toObject recursively.
 *
 * @param {Document|Array|Object} obj 
 * @return {Object}
 * @api private
 */
exports.toObject = function(obj) {
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
      ret.push(exports.toObject(doc));
    }

    return ret;
  }

  if (exports.isPOJO(obj)) {
    ret = {};

    for (const k of Object.keys(obj)) {
      if (specialProperties.has(k)) {
        continue;
      }
      ret[k] = exports.toObject(obj[k]);
    }

    return ret;
  }

  return obj;
};

exports.isObject = isObject;

/**
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
exports.isPOJO = function(arg) {
  if (arg == null || typeof arg !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(arg);
  // Prototype may be null if you used `Object.create(null)`
  // Checking `proto`'s constructor is safe because `getPrototypeOf()`
  // explicitly crosses the boundary from object data to object metadata
  return !proto || proto.constructor.name === 'Object';
};

/**
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

/**
 * Determines if `val` is an object that has no own keys
 */

exports.isEmptyObject = function(val) {
  return val != null &&
    typeof val === 'object' &&
    Object.keys(val).length === 0;
};

/**
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

/**
 * A faster Array.prototype.slice.call(arguments) alternative
 * @api private
 */

exports.args = sliced;

/**
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

/**
 * Returns true if `v` is an object that can be serialized as a primitive in
 * MongoDB
 */

exports.isMongooseType = function(v) {
  return v instanceof ObjectId || v instanceof Decimal || v instanceof Buffer;
};

exports.isMongooseObject = isMongooseObject;

/**
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

class PopulateOptionsObject {
  /**
   * @param {String} path 
   * @param {String} select 
   * @param {Object} model 
   * @param {Object} match 
   * @param {Object} options 
   * @param {Object} subPopulate 
   * @param {Boolean} justOne 
   * @param {Number} count 
   */
  constructor(path, select, model, match, options, subPopulate, justOne, count) {
    this.path = path;
    this.select = select;
    this.model = model;
    this.match = match;
    this.options = options;
    this.subPopulate = subPopulate;
    this.justOne = justOne;
    this.count = count;
  }
}

/**
 * populate helper
 */

exports.populate = function populate(options) {
  // might have passed an object specifying all arguments
  let obj = null;
  if (arguments.length === 1) {
    if (options instanceof PopulateOptions) {
      return [options];
    }

    if (Array.isArray(options)) {
      const singles = makeSingles(options);
      return singles.map(o => exports.populate(o)[0]);
    }

    if (exports.isObject(options)) {
      obj = Object.assign({}, options);
    } else {
      obj = { path: options };
    }
  } else if (typeof options.model === 'object') {
    obj = {
      path: options.path,
      select: options.select,
      match: options.model,
      options: options.match
    };
  } else {
    obj = {
      path: options.path,
      select: options.select,
      model: options.model,
      match: options.match,
      options: options.options,
      populate: options.subPopulate,
      justOne: options.justOne,
      count: options.count
    };
  }

  if (typeof obj.path !== 'string') {
    throw new TypeError('utils.populate: invalid path. Expected string. Got typeof `' + typeof obj.path + '`');
  }

  return _populateObj(obj);

  // The order of select/conditions args is opposite Model.find but
  // necessary to keep backward compatibility (select could be
  // an array, string, or object literal).
  function makeSingles(arr) {
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

/**
 * Return the value of `obj` at the given `path`.
 *
 * @param {String} path 
 * @param {Object} obj 
 * @param {Object} map 
 */

exports.getValue = function(path, obj, map) {
  return mpath.get(path, obj, '_doc', map);
};

/**
 * Sets the value of `obj` at the given `path`.
 *
 * @param {String} path 
 * @param {Anything} val 
 * @param {Object} obj 
 * @param {Object} map 
 * @param {Boolean} _copying 
 */

exports.setValue = function(path, val, obj, map, _copying) {
  mpath.set(path, val, obj, '_doc', map, _copying);
};

/**
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

/**
 * @see exports.options
 */

exports.object.shallowCopy = exports.options;

/**
 * Safer helper for hasOwnProperty checks
 *
 * @param {Object} obj 
 * @param {String} prop 
 */

const hop = Object.prototype.hasOwnProperty;
exports.object.hasOwnProperty = function(obj, prop) {
  return hop.call(obj, prop);
};

/**
 * Determine if `val` is null or undefined
 *
 * @return {Boolean}
 */

exports.isNullOrUndefined = function(val) {
  return val === null || val === undefined;
};

/**
 * ignore
 */

exports.array = {};

/**
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

/**
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

/**
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

/**
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

/**
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

/**
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
 * merges to with a copy of from
 *
 * @param {Object} to 
 * @param {Object} fromObj 
 * @api private
 */

exports.mergeClone = function(to, fromObj) {
  if (isMongooseObject(fromObj)) {
    fromObj = fromObj.toObject({
      transform: false,
      virtuals: false,
      depopulate: true,
      getters: false,
      flattenDecimals: false
    });
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
      to[key] = exports.clone(fromObj[key], {
        transform: false,
        virtuals: false,
        depopulate: true,
        getters: false,
        flattenDecimals: false
      });
    } else {
      let val = fromObj[key];
      if (val != null && val.valueOf && !(val instanceof Date)) {
        val = val.valueOf();
      }
      if (exports.isObject(val)) {
        let obj = val;
        if (isMongooseObject(val) && !val.isMongooseBuffer) {
          obj = obj.toObject({
            transform: false,
            virtuals: false,
            depopulate: true,
            getters: false,
            flattenDecimals: false
          });
        }
        if (val.isMongooseBuffer) {
          obj = Buffer.from(obj);
        }
        exports.mergeClone(to[key], obj);
      } else {
        to[key] = exports.clone(val, {
          flattenDecimals: false
        });
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

/**
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

/**
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