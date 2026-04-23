```javascript
'use strict';

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
 * Produces a collection name from model `name`.
 * @param {String} name - A model name
 * @param {Function} pluralize - A function that pluralizes the collection name
 * @return {String} A collection name
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

/**
 * Determines if `a` and `b` are deep equal.
 * @param {any} a - A value to compare to `b`
 * @param {any} b - A value to compare to `a`
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

  a = normalizeMongooseObject(a);
  b = normalizeMongooseObject(b);

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
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
};

function normalizeMongooseObject(obj) {
  if (obj.$__ != null) {
    obj = obj._doc;
  } else if (isMongooseObject(obj)) {
    obj = obj.toObject();
  }
  return obj;
}

/**
 * Get the last element of an array
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

/**
 * Shallow copies defaults into options.
 * @param {Object} defaults
 * @param {Object} options
 * @return {Object} The merged object
 * @api private
 */
exports.options = function(defaults, options) {
  options = options || {};

  for (const key of Object.keys(defaults)) {
    if (!(key in options)) {
      options[key] = defaults[key];
    }
  }

  return options;
};

/**
 * Generates a random string
 * @api private
 */
exports.random = function() {
  return Math.random().toString().substr(3);
};

/**
 * Merges `from` into `to` without overwriting existing properties.
 * @param {Object} to
 * @param {Object} from
 * @api private
 */
exports.merge = function merge(to, from, options, path) {
  options = options || {};

  for (const key of Object.keys(from)) {
    if (options.omit && options.omit[key]) {
      continue;
    }
    if (specialProperties.has(key)) {
      continue;
    }
    if (to[key] == null) {
      to[key] = from[key];
    } else if (isObject(from[key])) {
      if (!isObject(to[key])) {
        to[key] = {};
      }
      merge(to[key], from[key], options, path ? path + '.' + key : key);
    } else if (options.overwrite) {
      to[key] = from[key];
    }
  }
};

/**
 * Applies toObject recursively.
 * @param {Document|Array|Object} obj
 * @return {Object}
 * @api private
 */
exports.toObject = function toObject(obj) {
  Document || (Document = require('./document'));

  if (obj == null) {
    return obj;
  }

  if (obj instanceof Document) {
    return obj.toObject();
  }

  if (Array.isArray(obj)) {
    return obj.map(toObject);
  }

  if (isObject(obj)) {
    const ret = {};
    for (const key of Object.keys(obj)) {
      if (specialProperties.has(key)) {
        continue;
      }
      ret[key] = toObject(obj[key]);
    }
    return ret;
  }

  return obj;
};

exports.isObject = isObject;

/**
 * Determines if `arg` is a plain old JavaScript object (POJO).
 * @param {Object|Array|String|Function|RegExp|any} arg
 * @api private
 * @return {Boolean}
 */
exports.isPOJO = function isPOJO(arg) {
  if (arg == null || typeof arg !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(arg);
  return !proto || proto.constructor.name === 'Object';
};

/**
 * Determines if `obj` is a built-in object like an array, date, boolean, etc.
 * @param {any} arg
 * @return {Boolean}
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
 * @param {any} val
 * @return {Boolean}
 */
exports.isEmptyObject = function(val) {
  return val != null &&
    typeof val === 'object' &&
    Object.keys(val).length === 0;
};

/**
 * Search if `obj` or any POJOs nested underneath `obj` has a property named `key`
 * @param {Object} obj
 * @param {String} key
 * @return {Boolean}
 */
exports.hasKey = function hasKey(obj, key) {
  for (const prop of Object.keys(obj)) {
    if (prop === key) {
      return true;
    }
    if (isObject(obj[prop]) && hasKey(obj[prop], key)) {
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
      immediate(function() {
        throw err;
      });
    }
  };
};

/**
 * Returns true if `v` is an object that can be serialized as a primitive in MongoDB
 * @param {any} v
 * @return {Boolean}
 */
exports.isMongooseType = function(v) {
  return v instanceof ObjectId || v instanceof Decimal || v instanceof Buffer;
};

exports.isMongooseObject = isMongooseObject;

/**
 * Converts `expires` options of index objects to `expiresAfterSeconds` options for MongoDB.
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
 * populate helper
 * @param {String|Object} path
 * @param {String|Object} select
 * @param {Model|Object} model
 * @param {Object} match
 * @param {Object} options
 * @param {Object} subPopulate
 * @param {Boolean} justOne
 * @param {Boolean} count
 * @return {Array}
 */
exports.populate = function populate(path, select, model, match, options, subPopulate, justOne, count) {
  let obj = null;
  if (arguments.length === 1) {
    if (path instanceof PopulateOptions) {
      return [path];
    }

    if (Array.isArray(path)) {
      return path.map(p => exports.populate(p)[0]);
    }

    if (isObject(path)) {
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

  function _populateObj(obj) {
    if (Array.isArray(obj.populate)) {
      return obj.populate.map(p => exports.populate(p)[0]);
    } else if (obj.populate != null && typeof obj.populate === 'object') {
      obj.populate = exports.populate(obj.populate);
    }

    const ret = [];
    const paths = obj.path.split(' ');
    if (obj.options != null) {
      obj.options = clone(obj.options);
    }

    for (const path of paths) {
      ret.push(new PopulateOptions(Object.assign({}, obj, { path: path })));
    }

    return ret;
  }
};

/**
 * Return the value of `obj` at the given `path`.
 * @param {String} path
 * @param {Object} obj
 * @param {Object} map
 * @return {any}
 */
exports.getValue = function(path, obj, map) {
  return mpath.get(path, obj, '_doc', map);
};

/**
 * Sets the value of `obj` at the given `path`.
 * @param {String} path
 * @param {any} val
 * @param {Object} obj
 * @param {Object} map
 * @param {Boolean} _copying
 */
exports.setValue = function(path, val, obj, map, _copying) {
  mpath.set(path, val, obj, '_doc', map, _copying);
};

/**
 * Returns an array of values from object `o`.
 * @param {Object} o
 * @return {Array}
 * @private
 */
exports.object = {};
exports.object.vals = function vals(o) {
  return Object.values(o);
};

/**
 * @see exports.options
 */
exports.object.shallowCopy = exports.options;

/**
 * Safer helper for hasOwnProperty checks
 * @param {Object} obj
 * @param {String} prop
 * @return {Boolean}
 */
exports.object.hasOwnProperty = function(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
};

/**
 * Determine if `val` is null or undefined
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
 * @param {Array} arr
 * @param {Function} [filter]
 * @return {Array}
 * @private
 */
exports.array.flatten = function flatten(arr, filter) {
  const ret = [];
  arr.forEach(function(item) {
    if (Array.isArray(item)) {
      ret.push(...flatten(item, filter));
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
 * @param {String|Array} key
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
 * merges to with a copy of from
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
  for (const key of Object.keys(fromObj)) {
    if (specialProperties.has(key)) {
      continue;
    }
    if (typeof to[key] === 'undefined') {
      to[key] = clone(fromObj[key], {
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
      if (isObject(val)) {
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
        to[key] = clone(val, {
          flattenDecimals: false
        });
      }
    }
  }
};

/**
 * Executes a function on each element of an array (like _.each)
 * @param {Array} arr
 * @param {Function} fn
 * @api private
 */
exports.each = function(arr, fn) {
  arr.forEach(fn);
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

/**
 * @param {Error} error
 * @return {Object}
 */
exports.errorToPOJO = function errorToPOJO(error) {
  if (!(error instanceof Error)) {
    throw new Error('`error` must be `instanceof Error`.');
  }

  const ret = {};
  for (const properyName of Object.getOwnPropertyNames(error)) {
    ret[properyName] = error[properyName];
  }
  return ret;
};

/**
 * @return {Number}
 */
exports.nodeMajorVersion = function nodeMajorVersion() {
  return parseInt(process.versions.node.split('.')[0], 10);
};
```