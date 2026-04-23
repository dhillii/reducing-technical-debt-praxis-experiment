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

/**
 * Collection name options
 * @typedef {Object} CollectionNameOptions
 * @property {String} name - model name
 * @property {Function} [pluralize] - function to pluralize the collection name
 */
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

/**
 * Deep equality check options
 * @typedef {Object} DeepEqualityCheckOptions
 * @property {any} a - value to compare to `b`
 * @property {any} b - value to compare to `a`
 */
/**
 * Determines if `a` and `b` are deep equal.
 *
 * Modified from node/lib/assert.js
 *
 * @param {DeepEqualityCheckOptions} options
 * @return {Boolean}
 * @api private
 */
exports.deepEqual = function(options) {
  const a = options.a;
  const b = options.b;
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
    return deepEqual({ a: Array.from(a.keys()), b: Array.from(b.keys()) }) &&
      deepEqual({ a: Array.from(a.values()), b: Array.from(b.values()) });
  }

  // Handle MongooseNumbers
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }

  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const len = a.length;
    if (len !== b.length) {
      return false;
    }
    for (let i = 0; i < len; ++i) {
      if (!deepEqual({ a: a[i], b: b[i] })) {
        return false;
      }
    }
    return true;
  }

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

  const ka = Object.keys(a);
  const kb = Object.keys(b);
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
    if (!deepEqual({ a: a[key], b: b[key] })) {
      return false;
    }
  }

  return true;
};

/**
 * Returns the last element of an array
 *
 * @param {Array} arr
 * @return {any}
 * @api private
 */
exports.last = function(arr) {
  if (arr.length > 0) {
    return arr[arr.length - 1];
  }
  return void 0;
};

exports.clone = clone;

/**
 * Options for promise or callback
 * @typedef {Object} PromiseOrCallbackOptions
 * @property {Function} callback
 */
/**
 * ignore
 *
 * @param {PromiseOrCallbackOptions} options
 * @api private
 */
exports.promiseOrCallback = function(options) {
  return promiseOrCallback(options.callback);
};

/**
 * Omit options
 * @typedef {Object} OmitOptions
 * @property {Object} obj
 * @property {Array<String>|String} keys
 */
/**
 * ignore
 *
 * @param {OmitOptions} options
 * @return {Object}
 * @api private
 */
exports.omit = function(options) {
  if (options.keys == null) {
    return Object.assign({}, options.obj);
  }
  if (!Array.isArray(options.keys)) {
    options.keys = [options.keys];
  }

  const ret = Object.assign({}, options.obj);
  for (const key of options.keys) {
    delete ret[key];
  }
  return ret;
};

/**
 * Options for merging defaults into options
 * @typedef {Object} MergeOptions
 * @property {Object} defaults
 * @property {Object} options
 */
/**
 * Shallow copies defaults into options.
 *
 * @param {MergeOptions} options
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
 * @return {String}
 * @api private
 */
exports.random = function() {
  return Math.random().toString().substr(3);
};

/**
 * Merge options
 * @typedef {Object} MergeOptions
 * @property {Object} to
 * @property {Object} from
 * @property {Object} [options]
 * @property {String} [path]
 */
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
      exports.merge({ to: options.to[key], from: options.from[key], options: options.options, path: options.path ? options.path + '.' + key : key });
    } else if (options.options.overwrite) {
      options.to[key] = options.from[key];
    }
  }
};

/**
 * To object options
 * @typedef {Object} ToObjectOptions
 * @property {Document|Array|Object} obj
 */
/**
 * Applies toObject recursively.
 *
 * @param {ToObjectOptions} options
 * @return {Object}
 * @api private
 */
exports.toObject = function(options) {
  Document || (Document = require('./document'));
  let ret;

  if (options.obj == null) {
    return options.obj;
  }

  if (options.obj instanceof Document) {
    return options.obj.toObject();
  }

  if (Array.isArray(options.obj)) {
    ret = [];

    for (const doc of options.obj) {
      ret.push(exports.toObject({ obj: doc }));
    }

    return ret;
  }

  if (exports.isPOJO(options.obj)) {
    ret = {};

    for (const k of Object.keys(options.obj)) {
      if (specialProperties.has(k)) {
        continue;
      }
      ret[k] = exports.toObject({ obj: options.obj[k] });
    }

    return ret;
  }

  return options.obj;
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
 *
 * @param {Object} obj
 * @return {Boolean}
 */
exports.isNativeObject = function(obj) {
  return Array.isArray(obj) ||
    obj instanceof Date ||
    obj instanceof Boolean ||
    obj instanceof Number ||
    obj instanceof String;
};

/**
 * Determines if `val` is an object that has no own keys
 *
 * @param {Object} val
 * @return {Boolean}
 */
exports.isEmptyObject = function(val) {
  return val != null &&
    typeof val === 'object' &&
    Object.keys(val).length === 0;
};

/**
 * Search if `obj` or any POJOs nested underneath `obj` has a property named
 * `key`
 *
 * @param {Object} obj
 * @param {String} key
 * @return {Boolean}
 */
exports.hasKey = function(obj, key) {
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
exports.tick = function(callback) {
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
 *
 * @param {any} v
 * @return {Boolean}
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
exports.expires = function(object) {
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
 * Populate options
 * @typedef {Object} PopulateOptions
 * @property {String} path
 * @property {String|Array<String>} select
 * @property {Model} model
 * @property {Object} match
 * @property {Object} options
 * @property {Array<PopulateOptions>} populate
 * @property {Boolean} justOne
 * @property {Boolean} count
 */
/**
 * populate helper
 *
 * @param {PopulateOptions} options
 * @return {Array<PopulateOptions>}
 * @api private
 */
exports.populate = function(options) {
  if (Array.isArray(options)) {
    const singles = makeSingles(options);
    return singles.map(o => exports.populate(o));
  }

  if (typeof options.model === 'object') {
    options = {
      path: options.path,
      select: options.select,
      match: options.model,
      options: options.match
    };
  } else {
    options = {
      path: options.path,
      select: options.select,
      model: options.model,
      match: options.match,
      options: options.options,
      populate: options.populate,
      justOne: options.justOne,
      count: options.count
    };
  }

  if (typeof options.path !== 'string') {
    throw new TypeError('utils.populate: invalid path. Expected string. Got typeof `' + typeof options.path + '`');
  }

  return _populateObj(options);

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

function _populateObj(options) {
  if (Array.isArray(options.populate)) {
    const ret = [];
    options.populate.forEach(function(obj) {
      if (/[\s]/.test(obj.path)) {
        const copy = Object.assign({}, obj);
        const paths = copy.path.split(' ');
        paths.forEach(function(p) {
          copy.path = p;
          ret.push(exports.populate(copy));
        });
      } else {
        ret.push(exports.populate(obj));
      }
    });
    options.populate = exports.populate(ret);
  } else if (options.populate != null && typeof options.populate === 'object') {
    options.populate = exports.populate(options.populate);
  }

  const ret = [];
  const paths = options.path.split(' ');
  if (options.options != null) {
    options.options = exports.clone(options.options);
  }

  for (const path of paths) {
    ret.push(new PopulateOptions(Object.assign({}, options, { path: path })));
  }

  return ret;
}

/**
 * Get value options
 * @typedef {Object} GetValueOptions
 * @property {String} path
 * @property {Object} obj
 * @property {Object} [map]
 */
/**
 * Return the value of `obj` at the given `path`.
 *
 * @param {GetValueOptions} options
 * @return {any}
 * @api private
 */
exports.getValue = function(options) {
  return mpath.get(options.path, options.obj, '_doc', options.map);
};

/**
 * Set value options
 * @typedef {Object} SetValueOptions
 * @property {String} path
 * @property {any} val
 * @property {Object} obj
 * @property {Object} [map]
 * @property {Boolean} [_copying]
 */
/**
 * Sets the value of `obj` at the given `path`.
 *
 * @param {SetValueOptions} options
 * @api private
 */
exports.setValue = function(options) {
  mpath.set(options.path, options.val, options.obj, '_doc', options.map, options._copying);
};

/**
 * Returns an array of values from object `o`.
 *
 * @param {Object} o
 * @return {Array}
 * @private
 */
exports.object = {};
exports.object.vals = function(o) {
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
 * @return {Boolean}
 */
const hop = Object.prototype.hasOwnProperty;
exports.object.hasOwnProperty = function(obj, prop) {
  return hop.call(obj, prop);
};

/**
 * Determine if `val` is null or undefined
 *
 * @param {any} val
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
exports.array.flatten = function(arr, filter, ret) {
  ret || (ret = []);

  arr.forEach(function(item) {
    if (Array.isArray(item)) {
      exports.array.flatten(item, filter, ret);
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

/**
 * @param {Object} obj
 * @param {String|Array<String>} key
 * @return {Boolean}
 */
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

/**
 * @param {any} val
 * @return {Boolean}
 */
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
 * @return {Boolean}
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
 *
 * @param {Object} destination
 * @param {Object} source
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
 * Merges to with a copy of from
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
 * Get option options
 * @typedef {Object} GetOptionOptions
 * @property {String} name
 * @property {Array<Object>} sources
 */
/**
 * ignore
 *
 * @param {GetOptionOptions} options
 * @return {any}
 * @api private
 */
exports.getOption = function(options) {
  for (const source of options.sources) {
    if (source[options.name] != null) {
      return source[options.name];
    }
  }

  return null;
};

/**
 * ignore
 */
exports.noop = function() {};

/**
 * Error to POJO options
 * @typedef {Object} ErrorToPOJOOptions
 * @property {Error} error
 */
/**
 * ignore
 *
 * @param {ErrorToPOJOOptions} options
 * @return {Object}
 */
exports.errorToPOJO = function(options) {
  const isError = options.error instanceof Error;
  if (!isError) {
    throw new Error('`error` must be `instanceof Error`.');
  }

  const ret = {};
  for (const properyName of Object.getOwnPropertyNames(options.error)) {
    ret[properyName] = options.error[properyName];
  }
  return ret;
};

/**
 * Node major version options
 */
/**
 * ignore
 *
 * @return {Number}
 */
exports.nodeMajorVersion = function() {
  return parseInt(process.versions.node.split('.')[0], 10);
};