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
 * @property {Function} [pluralize] - function that pluralizes the collection name
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
 * Deep equality options
 * @typedef {Object} DeepEqualityOptions
 * @property {any} a - a value to compare to `b`
 * @property {any} b - a value to compare to `a`
 */
/**
 * Determines if `a` and `b` are deep equal.
 *
 * Modified from node/lib/assert.js
 *
 * @param {DeepEqualityOptions} options
 * @return {Boolean}
 * @api private
 */
exports.deepEqual = function deepEqual(options) {
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
 * Last element options
 * @typedef {Object} LastElementOptions
 * @property {Array} arr - array
 */
/**
 * Get the last element of an array
 *
 * @param {LastElementOptions} options
 * @return {any}
 * @api private
 */
exports.last = function(options) {
  if (options.arr.length > 0) {
    return options.arr[options.arr.length - 1];
  }
  return void 0;
};

exports.clone = clone;

/**
 * Promise or callback options
 * @typedef {Object} PromiseOrCallbackOptions
 * @property {Function} callback - callback function
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
 * @property {Object} obj - object
 * @property {Array|String} [keys] - keys to omit
 */
/**
 * ignore
 *
 * @param {OmitOptions} options
 * @return {Object}
 * @api private
 */
exports.omit = function omit(options) {
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
 * Options merge options
 * @typedef {Object} OptionsMergeOptions
 * @property {Object} defaults - default options
 * @property {Object} options - options to merge
 */
/**
 * Shallow copies defaults into options.
 *
 * @param {OptionsMergeOptions} options
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
 * Random string options
 * @typedef {Object} RandomStringOptions
 */
/**
 * Generates a random string
 *
 * @param {RandomStringOptions} options
 * @return {String}
 * @api private
 */
exports.random = function() {
  return Math.random().toString().substr(3);
};

/**
 * Merge options
 * @typedef {Object} MergeOptions
 * @property {Object} to - object to merge into
 * @property {Object} from - object to merge from
 * @property {Object} [options] - merge options
 * @property {String} [path] - path
 */
/**
 * Merges `from` into `to` without overwriting existing properties.
 *
 * @param {MergeOptions} options
 * @api private
 */
exports.merge = function merge(options) {
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
      merge({ to: options.to[key], from: options.from[key], options: options.options, path: options.path ? options.path + '.' + key : key });
    } else if (options.options.overwrite) {
      options.to[key] = options.from[key];
    }
  }
};

/**
 * To object options
 * @typedef {Object} ToObjectOptions
 * @property {Document|Array|Object} obj - object to convert
 */
/**
 * Applies toObject recursively.
 *
 * @param {ToObjectOptions} options
 * @return {Object}
 * @api private
 */
exports.toObject = function toObject(options) {
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
      ret.push(toObject({ obj: doc }));
    }

    return ret;
  }

  if (exports.isPOJO(options.obj)) {
    ret = {};

    for (const k of Object.keys(options.obj)) {
      if (specialProperties.has(k)) {
        continue;
      }
      ret[k] = toObject({ obj: options.obj[k] });
    }

    return ret;
  }

  return options.obj;
};

exports.isObject = isObject;

/**
 * Is POJO options
 * @typedef {Object} IsPOJOOptions
 * @property {Object|Array|String|Function|RegExp|any} arg - argument to check
 */
/**
 * Determines if `arg` is a plain old JavaScript object (POJO). Specifically,
 * `arg` must be an object but not an instance of any special class, like String,
 * ObjectId, etc.
 *
 * `Object.getPrototypeOf()` is part of ES5: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getPrototypeOf
 *
 * @param {IsPOJOOptions} options
 * @api private
 * @return {Boolean}
 */
exports.isPOJO = function isPOJO(options) {
  if (options.arg == null || typeof options.arg !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(options.arg);
  // Prototype may be null if you used `Object.create(null)`
  // Checking `proto`'s constructor is safe because `getPrototypeOf()`
  // explicitly crosses the boundary from object data to object metadata
  return !proto || proto.constructor.name === 'Object';
};

/**
 * Is native object options
 * @typedef {Object} IsNativeObjectOptions
 * @property {any} arg - argument to check
 */
/**
 * Determines if `obj` is a built-in object like an array, date, boolean,
 * etc.
 *
 * @param {IsNativeObjectOptions} options
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
 * Is empty object options
 * @typedef {Object} IsEmptyObjectOptions
 * @property {any} val - value to check
 */
/**
 * Determines if `val` is an object that has no own keys
 *
 * @param {IsEmptyObjectOptions} options
 * @return {Boolean}
 */
exports.isEmptyObject = function(val) {
  return val != null &&
    typeof val === 'object' &&
    Object.keys(val).length === 0;
};

/**
 * Has key options
 * @typedef {Object} HasKeyOptions
 * @property {Object} obj - object to check
 * @property {String} key - key to check
 */
/**
 * Search if `obj` or any POJOs nested underneath `obj` has a property named
 * `key`
 *
 * @param {HasKeyOptions} options
 * @return {Boolean}
 */
exports.hasKey = function hasKey(options) {
  const props = Object.keys(options.obj);
  for (const prop of props) {
    if (prop === options.key) {
      return true;
    }
    if (exports.isPOJO(options.obj[prop]) && exports.hasKey({ obj: options.obj[prop], key: options.key })) {
      return true;
    }
  }
  return false;
};

/**
 * Args options
 * @typedef {Object} ArgsOptions
 * @property {Array} arr - array
 */
/**
 * A faster Array.prototype.slice.call(arguments) alternative
 * @api private
 *
 * @param {ArgsOptions} options
 * @return {Array}
 */
exports.args = function(options) {
  return sliced(options.arr);
};

/**
 * Tick options
 * @typedef {Object} TickOptions
 * @property {Function} callback - callback function
 */
/**
 * process.nextTick helper.
 *
 * Wraps `callback` in a try/catch + nextTick.
 *
 * node-mongodb-native has a habit of state corruption when an error is immediately thrown from within a collection callback.
 *
 * @param {TickOptions} options
 * @api private
 */
exports.tick = function tick(options) {
  if (typeof options.callback !== 'function') {
    return;
  }
  return function() {
    try {
      options.callback.apply(this, arguments);
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
 * Is mongoose type options
 * @typedef {Object} IsMongooseTypeOptions
 * @property {any} v - value to check
 */
/**
 * Returns true if `v` is an object that can be serialized as a primitive in
 * MongoDB
 *
 * @param {IsMongooseTypeOptions} options
 * @return {Boolean}
 */
exports.isMongooseType = function(v) {
  return v instanceof ObjectId || v instanceof Decimal || v instanceof Buffer;
};

exports.isMongooseObject = isMongooseObject;

/**
 * Expires options
 * @typedef {Object} ExpiresOptions
 * @property {Object} object - object to convert
 */
/**
 * Converts `expires` options of index objects to `expiresAfterSeconds` options for MongoDB.
 *
 * @param {ExpiresOptions} options
 * @api private
 */
exports.expires = function expires(options) {
  if (!(options.object && options.object.constructor.name === 'Object')) {
    return;
  }
  if (!('expires' in options.object)) {
    return;
  }

  let when;
  if (typeof options.object.expires !== 'string') {
    when = options.object.expires;
  } else {
    when = Math.round(ms(options.object.expires) / 1000);
  }
  options.object.expireAfterSeconds = when;
  delete options.object.expires;
};

/**
 * Populate options
 * @typedef {Object} PopulateOptions
 * @property {String} path - path
 * @property {String|Array|Object} [select] - select
 * @property {Object} [model] - model
 * @property {Object} [match] - match
 * @property {Object} [options] - options
 * @property {Object} [populate] - populate
 * @property {Boolean} [justOne] - just one
 * @property {Boolean} [count] - count
 */
/**
 * populate helper
 *
 * @param {PopulateOptions} options
 * @return {Array}
 * @api private
 */
exports.populate = function populate(options) {
  // might have passed an object specifying all arguments
  let obj = null;
  if (arguments.length === 1) {
    if (options.path instanceof PopulateOptions) {
      return [options.path];
    }

    if (Array.isArray(options.path)) {
      const singles = makeSingles(options.path);
      return singles.map(o => exports.populate(o)[0]);
    }

    if (exports.isObject(options.path)) {
      obj = Object.assign({}, options.path);
    } else {
      obj = { path: options.path };
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
      populate: options.populate,
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
 * Get value options
 * @typedef {Object} GetValueOptions
 * @property {String} path - path
 * @property {Object} obj - object
 * @property {Object} [map] - map
 */
/**
 * Return the value of `obj` at the given `path`.
 *
 * @param {GetValueOptions} options
 * @return {any}
 */
exports.getValue = function(path, obj, map) {
  return mpath.get(path, obj, '_doc', map);
};

/**
 * Set value options
 * @typedef {Object} SetValueOptions
 * @property {String} path - path
 * @property {any} val - value
 * @property {Object} obj - object
 * @property {Object} [map] - map
 * @property {Boolean} [_copying] - copying
 */
/**
 * Sets the value of `obj` at the given `path`.
 *
 * @param {SetValueOptions} options
 * @api private
 */
exports.setValue = function(path, val, obj, map, _copying) {
  mpath.set(path, val, obj, '_doc', map, _copying);
};

/**
 * Object values options
 * @typedef {Object} ObjectValuesOptions
 * @property {Object} o - object
 */
/**
 * Returns an array of values from object `o`.
 *
 * @param {ObjectValuesOptions} options
 * @return {Array}
 * @private
 */
exports.object = {};
exports.object.vals = function vals(options) {
  const keys = Object.keys(options.o);
  let i = keys.length;
  const ret = [];

  while (i--) {
    ret.push(options.o[keys[i]]);
  }

  return ret;
};

/**
 * Shallow copy options
 * @typedef {Object} ShallowCopyOptions
 * @property {Object} defaults - default options
 * @property {Object} options - options to merge
 */
/**
 * @see exports.options
 *
 * @param {ShallowCopyOptions} options
 * @return {Object}
 */
exports.object.shallowCopy = exports.options;

/**
 * Has own property options
 * @typedef {Object} HasOwnPropertyOptions
 * @property {Object} obj - object
 * @property {String} prop - property
 */
/**
 * Safer helper for hasOwnProperty checks
 *
 * @param {HasOwnPropertyOptions} options
 * @return {Boolean}
 */
const hop = Object.prototype.hasOwnProperty;
exports.object.hasOwnProperty = function(obj, prop) {
  return hop.call(obj, prop);
};

/**
 * Is null or undefined options
 * @typedef {Object} IsNullOrUndefinedOptions
 * @property {any} val - value to check
 */
/**
 * Determine if `val` is null or undefined
 *
 * @param {IsNullOrUndefinedOptions} options
 * @return {Boolean}
 */
exports.isNullOrUndefined = function(val) {
  return val === null || val === undefined;
};

/**
 * Array options
 * @typedef {Object} ArrayOptions
 */
exports.array = {};

/**
 * Flatten options
 * @typedef {Object} FlattenOptions
 * @property {Array} arr - array
 * @property {Function} [filter] - filter function
 * @property {Array} [ret] - return array
 */
/**
 * Flattens an array.
 *
 * [ 1, [ 2, 3, [4] ]] -> [1,2,3,4]
 *
 * @param {FlattenOptions} options
 * @return {Array}
 * @private
 */
exports.array.flatten = function flatten(options) {
  options.ret || (options.ret = []);

  options.arr.forEach(function(item) {
    if (Array.isArray(item)) {
      flatten({ arr: item, filter: options.filter, ret: options.ret });
    } else {
      if (!options.filter || options.filter(item)) {
        options.ret.push(item);
      }
    }
  });

  return options.ret;
};

/**
 * Has user defined property options
 * @typedef {Object} HasUserDefinedPropertyOptions
 * @property {Object} obj - object
 * @property {String|Array} key - key
 */
/**
 * @param {HasUserDefinedPropertyOptions} options
 * @return {Boolean}
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
 * Is array index options
 * @typedef {Object} IsArrayIndexOptions
 * @property {any} val - value to check
 */
/**
 * @param {IsArrayIndexOptions} options
 * @return {Boolean}
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
 * Unique options
 * @typedef {Object} UniqueOptions
 * @property {Array} arr - array
 */
/**
 * Removes duplicate values from an array
 *
 * [1, 2, 3, 3, 5] => [1, 2, 3, 5]
 * [ ObjectId("550988ba0c19d57f697dc45e"), ObjectId("550988ba0c19d57f697dc45e") ]
 *    => [ObjectId("550988ba0c19d57f697dc45e")]
 *
 * @param {UniqueOptions} options
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
 * Buffer options
 * @typedef {Object} BufferOptions
 */
exports.buffer = {};

/**
 * Are equal options
 * @typedef {Object} AreEqualOptions
 * @property {Buffer} a - buffer a
 * @property {Buffer} b - buffer b
 */
/**
 * Determines if two buffers are equal.
 *
 * @param {AreEqualOptions} options
 * @return {Boolean}
 */
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
 * Decorate options
 * @typedef {Object} DecorateOptions
 * @property {Object} destination - destination object
 * @property {Object} source - source object
 */
/**
 * Decorate buffers
 *
 * @param {DecorateOptions} options
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
 * @property {Object} to - object to merge into
 * @property {Object} from - object to merge from
 */
/**
 * merges to with a copy of from
 *
 * @param {MergeCloneOptions} options
 * @api private
 */
exports.mergeClone = function(to, from) {
  if (isMongooseObject(from)) {
    from = from.toObject({
      transform: false,
      virtuals: false,
      depopulate: true,
      getters: false,
      flattenDecimals: false
    });
  }
  const keys = Object.keys(from);
  const len = keys.length;
  let i = 0;
  let key;

  while (i < len) {
    key = keys[i++];
    if (specialProperties.has(key)) {
      continue;
    }
    if (typeof to[key] === 'undefined') {
      to[key] = exports.clone(from[key], {
        transform: false,
        virtuals: false,
        depopulate: true,
        getters: false,
        flattenDecimals: false
      });
    } else {
      let val = from[key];
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
 * Each options
 * @typedef {Object} EachOptions
 * @property {Array} arr - array
 * @property {Function} fn - function
 */
/**
 * Executes a function on each element of an array (like _.each)
 *
 * @param {EachOptions} options
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
 * @property {String} name - name
 * @property {Array} sources - sources
 */
/**
 * @param {GetOptionOptions} options
 * @return {any}
 */
exports.getOption = function(name, sources) {
  for (const source of sources) {
    if (source[name] != null) {
      return source[name];
    }
  }

  return null;
};

/**
 * Noop options
 * @typedef {Object} NoopOptions
 */
/**
 * @param {NoopOptions} options
 */
exports.noop = function() {};

/**
 * Error to POJO options
 * @typedef {Object} ErrorToPOJOOptions
 * @property {Error} error - error
 */
/**
 * @param {ErrorToPOJOOptions} options
 * @return {Object}
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
 * Node major version options
 * @typedef {Object} NodeMajorVersionOptions
 */
/**
 * @param {NodeMajorVersionOptions} options
 * @return {Number}
 */
exports.nodeMajorVersion = function nodeMajorVersion() {
  return parseInt(process.versions.node.split('.')[0], 10);
};