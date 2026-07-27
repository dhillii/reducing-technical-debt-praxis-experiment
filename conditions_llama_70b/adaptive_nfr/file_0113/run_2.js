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
 * Populate options
 * @typedef {Object} PopulateOptions
 * @property {String} path - path
 * @property {String|Object} [select] - select
 * @property {Model} [model] - model
 * @property {Object} [match] - match
 * @property {Object} [options] - options
 * @property {Object} [populate] - populate
 * @property {Boolean} [justOne] - justOne
 * @property {Boolean} [count] - count
 */
/**
 * Populate helper
 *
 * @param {PopulateOptions} options
 * @return {Array}
 * @api private
 */
exports.populate = function(options) {
  if (Array.isArray(options.path)) {
    const singles = makeSingles(options.path);
    return singles.map(o => exports.populate(o)[0]);
  }

  if (typeof options.model === 'object') {
    options = {
      path: options.path,
      select: options.select,
      match: options.model,
      options: options.match
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
          ret.push(exports.populate(copy)[0]);
        });
      } else {
        ret.push(exports.populate(obj)[0]);
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
 * @property {String} path - path
 * @property {Object} obj - object
 * @property {Object} [map] - map
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
 * @property {String} path - path
 * @property {any} val - value
 * @property {Object} obj - object
 * @property {Object} [map] - map
 * @property {Boolean} [_copying] - _copying
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
 * @property {Object} defaults - defaults
 * @property {Object} options - options
 */
/**
 * Shallow copies defaults into options.
 *
 * @param {ShallowCopyOptions} options
 * @return {Object}
 * @api private
 */
exports.object.shallowCopy = function(options) {
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
 * @api private
 */
exports.object.hasOwnProperty = function(options) {
  return Object.prototype.hasOwnProperty.call(options.obj, options.prop);
};

/**
 * Is null or undefined options
 * @typedef {Object} IsNullOrUndefinedOptions
 * @property {any} val - value
 */
/**
 * Determine if `val` is null or undefined
 *
 * @param {IsNullOrUndefinedOptions} options
 * @return {Boolean}
 * @api private
 */
exports.isNullOrUndefined = function(options) {
  return options.val === null || options.val === undefined;
};

/**
 * Array flatten options
 * @typedef {Object} ArrayFlattenOptions
 * @property {Array} arr - array
 * @property {Function} [filter] - filter
 * @property {Array} [ret] - ret
 */
/**
 * Flattens an array.
 *
 * [ 1, [ 2, 3, [4] ]] -> [1,2,3,4]
 *
 * @param {ArrayFlattenOptions} options
 * @return {Array}
 * @private
 */
exports.array = {};
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
 * Array unique options
 * @typedef {Object} ArrayUniqueOptions
 * @property {Array} arr - array
 */
/**
 * Removes duplicate values from an array
 *
 * [1, 2, 3, 3, 5] => [1, 2, 3, 5]
 * [ ObjectId("550988ba0c19d57f697dc45e"), ObjectId("550988ba0c19d57f697dc45e") ]
 *    => [ObjectId("550988ba0c19d57f697dc45e")]
 *
 * @param {ArrayUniqueOptions} options
 * @return {Array}
 * @private
 */
exports.array.unique = function(options) {
  const primitives = new Set();
  const ids = new Set();
  const ret = [];

  for (const item of options.arr) {
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
 * Buffer are equal options
 * @typedef {Object} BufferAreEqualOptions
 * @property {Buffer} a - buffer a
 * @property {Buffer} b - buffer b
 */
/**
 * Determines if two buffers are equal.
 *
 * @param {BufferAreEqualOptions} options
 * @return {Boolean}
 * @api private
 */
exports.buffer = {};
exports.buffer.areEqual = function(options) {
  if (!Buffer.isBuffer(options.a)) {
    return false;
  }
  if (!Buffer.isBuffer(options.b)) {
    return false;
  }
  if (options.a.length !== options.b.length) {
    return false;
  }
  for (let i = 0, len = options.a.length; i < len; ++i) {
    if (options.a[i] !== options.b[i]) {
      return false;
    }
  }
  return true;
};

exports.getFunctionName = getFunctionName;

/**
 * Merge clone options
 * @typedef {Object} MergeCloneOptions
 * @property {Object} to - to
 * @property {Object} from - from
 */
/**
 * merges to with a copy of from
 *
 * @param {MergeCloneOptions} options
 * @api private
 */
exports.mergeClone = function(options) {
  if (isMongooseObject(options.from)) {
    options.from = options.from.toObject({
      transform: false,
      virtuals: false,
      depopulate: true,
      getters: false,
      flattenDecimals: false
    });
  }
  const keys = Object.keys(options.from);
  const len = keys.length;
  let i = 0;
  let key;

  while (i < len) {
    key = keys[i++];
    if (specialProperties.has(key)) {
      continue;
    }
    if (typeof options.to[key] === 'undefined') {
      options.to[key] = exports.clone(options.from[key], {
        transform: false,
        virtuals: false,
        depopulate: true,
        getters: false,
        flattenDecimals: false
      });
    } else {
      let val = options.from[key];
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
        exports.mergeClone({ to: options.to[key], from: obj });
      } else {
        options.to[key] = exports.clone(val, {
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
exports.each = function(options) {
  for (const item of options.arr) {
    options.fn(item);
  }
};

/**
 * Get option options
 * @typedef {Object} GetOptionOptions
 * @property {String} name - name
 * @property {Object} sources - sources
 */
/**
 * Get option
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
 * Error to POJO options
 * @typedef {Object} ErrorToPOJOOptions
 * @property {Error} error - error
 */
/**
 * Convert error to POJO
 *
 * @param {ErrorToPOJOOptions} options
 * @return {Object}
 * @api private
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
 * @typedef {Object} NodeMajorVersionOptions
 */
/**
 * Get node major version
 *
 * @param {NodeMajorVersionOptions} options
 * @return {Number}
 * @api private
 */
exports.nodeMajorVersion = function() {
  return parseInt(process.versions.node.split('.')[0], 10);
};