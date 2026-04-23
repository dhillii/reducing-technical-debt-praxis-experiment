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

/**
 * Produces a collection name from model `name`.
 * 
 * @param {String} name - a model name
 * @param {Function} pluralize - function that pluralizes the collection name
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

/**
 * Determines if `a` and `b` are deep equal.
 * 
 * @param {any} a - a value to compare to `b`
 * @param {any} b - a value to compare to `a`
 * @return {Boolean}
 * @api private
 */
exports.deepEqual = function deepEqual(a, b) {
  // Check if a and b are equal
  if (a === b) {
    return true;
  }

  // Check if a and b are not objects
  if (typeof a !== 'object' && typeof b !== 'object') {
    return a === b;
  }

  // Check if a and b are dates
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Check if a and b are ObjectIDs or Decimal128s
  if ((isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
      (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128'))) {
    return a.toString() === b.toString();
  }

  // Check if a and b are regular expressions
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source &&
        a.ignoreCase === b.ignoreCase &&
        a.multiline === b.multiline &&
        a.global === b.global;
  }

  // Check if a or b is null
  if (a == null || b == null) {
    return false;
  }

  // Check if a and b have the same prototype
  if (a.prototype !== b.prototype) {
    return false;
  }

  // Check if a and b are maps
  if (a instanceof Map && b instanceof Map) {
    return deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
      deepEqual(Array.from(a.values()), Array.from(b.values()));
  }

  // Check if a and b are numbers
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }

  // Check if a and b are buffers
  if (Buffer.isBuffer(a)) {
    return exports.buffer.areEqual(a, b);
  }

  // Check if a and b are arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    return deepEqualArray(a, b);
  }

  // Convert a and b to objects
  a = toObject(a);
  b = toObject(b);

  // Check if a and b have the same keys
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) {
    return false;
  }

  // Check if a and b have the same values
  for (const key of ka) {
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
};

// Helper function to check if two arrays are deep equal
function deepEqualArray(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!exports.deepEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

// Helper function to convert an object to a plain object
function toObject(obj) {
  if (obj.$__ != null) {
    obj = obj._doc;
  } else if (isMongooseObject(obj)) {
    obj = obj.toObject();
  }
  return obj;
}

/**
 * Get the last element of an array
 * 
 * @param {Array} arr - the array
 * @return {any} the last element of the array
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
 * Omit certain keys from an object
 * 
 * @param {Object} obj - the object
 * @param {Array|String} keys - the keys to omit
 * @return {Object} the object with the keys omitted
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
 * 
 * @param {Object} defaults - the default options
 * @param {Object} options - the options to copy into
 * @return {Object} the merged object
 * @api private
 */
exports.options = function(defaults, options) {
  options = options || {};
  const keys = Object.keys(defaults);
  for (const key of keys) {
    if (!(key in options)) {
      options[key] = defaults[key];
    }
  }
  return options;
};

/**
 * Generates a random string
 * 
 * @api private
 */
exports.random = function() {
  return Math.random().toString().substr(3);
};

/**
 * Merges `from` into `to` without overwriting existing properties.
 * 
 * @param {Object} to - the object to merge into
 * @param {Object} from - the object to merge from
 * @param {Object} options - the options for the merge
 * @param {String} path - the path of the merge
 * @api private
 */
exports.merge = function merge(to, from, options, path) {
  options = options || {};
  path = path || '';

  const keys = Object.keys(from);
  for (const key of keys) {
    if (options.omit && options.omit[key]) {
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
      merge(to[key], from[key], options, path ? path + '.' + key : key);
    } else if (options.overwrite) {
      to[key] = from[key];
    }
  }
};

/**
 * Applies toObject recursively.
 * 
 * @param {Document|Array|Object} obj - the object to convert
 * @return {Object} the converted object
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

  if (exports.isPOJO(obj)) {
    const ret = {};
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

/**
 * Determines if `arg` is a plain old JavaScript object (POJO).
 * 
 * @param {Object|Array|String|Function|RegExp|any} arg - the argument to check
 * @return {Boolean} whether the argument is a POJO
 * @api private
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
 * 
 * @param {any} arg - the argument to check
 * @return {Boolean} whether the argument is a built-in object
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
 * 
 * @param {any} val - the value to check
 * @return {Boolean} whether the value is an empty object
 */
exports.isEmptyObject = function(val) {
  return val != null &&
    typeof val === 'object' &&
    Object.keys(val).length === 0;
};

/**
 * Search if `obj` or any POJOs nested underneath `obj` has a property named `key`
 * 
 * @param {Object} obj - the object to search
 * @param {String} key - the key to search for
 * @return {Boolean} whether the key is found
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
 * 
 * @api private
 */
exports.args = sliced;

/**
 * process.nextTick helper.
 * 
 * Wraps `callback` in a try/catch + nextTick.
 * 
 * @param {Function} callback - the callback to wrap
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
 * 
 * @param {any} v - the value to check
 * @return {Boolean} whether the value can be serialized
 */
exports.isMongooseType = function(v) {
  return v instanceof ObjectId || v instanceof Decimal || v instanceof Buffer;
};

exports.isMongooseObject = isMongooseObject;

/**
 * Converts `expires` options of index objects to `expiresAfterSeconds` options for MongoDB.
 * 
 * @param {Object} object - the object to convert
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
 * Populate helper
 * 
 * @param {String|Object} path - the path to populate
 * @param {String|Object} select - the select options
 * @param {Model|Object} model - the model to populate
 * @param {Object} match - the match options
 * @param {Object} options - the options for the populate
 * @param {Object} subPopulate - the sub-populate options
 * @param {Boolean} justOne - whether to just populate one document
 * @param {Boolean} count - whether to count the populated documents
 * @return {Array} the populated documents
 */
exports.populate = function populate(path, select, model, match, options, subPopulate, justOne, count) {
  let obj = null;
  if (arguments.length === 1) {
    if (path instanceof PopulateOptions) {
      return [path];
    }

    if (Array.isArray(path)) {
      const singles = makeSingles(path);
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
 * @param {String} path - the path to get the value from
 * @param {Object} obj - the object to get the value from
 * @param {Object} map - the map to use for the get
 * @return {any} the value at the given path
 */
exports.getValue = function(path, obj, map) {
  return mpath.get(path, obj, '_doc', map);
};

/**
 * Sets the value of `obj` at the given `path`.
 * 
 * @param {String} path - the path to set the value at
 * @param {any} val - the value to set
 * @param {Object} obj - the object to set the value on
 * @param {Object} map - the map to use for the set
 * @param {Boolean} _copying - whether we are copying
 */
exports.setValue = function(path, val, obj, map, _copying) {
  mpath.set(path, val, obj, '_doc', map, _copying);
};

/**
 * Returns an array of values from object `o`.
 * 
 * @param {Object} o - the object to get the values from
 * @return {Array} the values from the object
 * @private
 */
exports.object = {};
exports.object.vals = function vals(o) {
  const keys = Object.keys(o);
  const ret = [];

  for (const key of keys) {
    ret.push(o[key]);
  }

  return ret;
};

/**
 * Safer helper for hasOwnProperty checks
 * 
 * @param {Object} obj - the object to check
 * @param {String} prop - the property to check
 * @return {Boolean} whether the object has the property
 */
const hop = Object.prototype.hasOwnProperty;
exports.object.hasOwnProperty = function(obj, prop) {
  return hop.call(obj, prop);
};

/**
 * Determine if `val` is null or undefined
 * 
 * @param {any} val - the value to check
 * @return {Boolean} whether the value is null or undefined
 */
exports.isNullOrUndefined = function(val) {
  return val === null || val === undefined;
};

/**
 * Flattens an array.
 * 
 * [ 1, [ 2, 3, [4] ]] -> [1,2,3,4]
 * 
 * @param {Array} arr - the array to flatten
 * @param {Function} [filter] - the filter function to use
 * @return {Array} the flattened array
 * @private
 */
exports.array = {};
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
 * Removes duplicate values from an array
 * 
 * [1, 2, 3, 3, 5] => [1, 2, 3, 5]
 * [ ObjectId("550988ba0c19d57f697dc45e"), ObjectId("550988ba0c19d57f697dc45e") ]
 *    => [ObjectId("550988ba0c19d57f697dc45e")]
 * 
 * @param {Array} arr - the array to remove duplicates from
 * @return {Array} the array with duplicates removed
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
 * @param {Buffer} a - the first buffer
 * @param {Object} b - the second buffer
 * @return {Boolean} whether the buffers are equal
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
 * @param {Object} destination - the destination object
 * @param {Object} source - the source object
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
 * @param {Object} to - the object to merge into
 * @param {Object} fromObj - the object to merge from
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
  for (const key of keys) {
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
 * @param {Array} arr - the array to execute the function on
 * @param {Function} fn - the function to execute
 * @api private
 */
exports.each = function(arr, fn) {
  for (const item of arr) {
    fn(item);
  }
};

/**
 * Get an option from a list of sources
 * 
 * @param {String} name - the name of the option
 * @param {Object} sources - the sources to get the option from
 * @return {any} the value of the option
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
 * No-op function
 */
exports.noop = function() {};

/**
 * Convert an error to a plain object
 * 
 * @param {Error} error - the error to convert
 * @return {Object} the error as a plain object
 */
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

/**
 * Get the major version of the current Node.js version
 * 
 * @return {Number} the major version of Node.js
 */
exports.nodeMajorVersion = function nodeMajorVersion() {
  return parseInt(process.versions.node.split('.')[0], 10);
};
```