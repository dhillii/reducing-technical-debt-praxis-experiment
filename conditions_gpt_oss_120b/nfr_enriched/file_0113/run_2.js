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
exports.toCollectionName = function (name, pluralize) {
  if (name === 'system.profile' || name === 'system.indexes') {
    return name;
  }
  if (typeof pluralize === 'function') {
    return pluralize(name);
  }
  return name;
};

/* -------------------------------------------------------------------------- */
/* Deep Equality Helpers                                                     */
/* -------------------------------------------------------------------------- */

function areDatesEqual(a, b) {
  return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
}

function areBsonTypesEqual(a, b) {
  return (isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
    (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128')) && a.toString() === b.toString();
}

function areRegExpsEqual(a, b) {
  return a instanceof RegExp && b instanceof RegExp &&
    a.source === b.source &&
    a.ignoreCase === b.ignoreCase &&
    a.multiline === b.multiline &&
    a.global === b.global;
}

function areMapsEqual(a, b) {
  return a instanceof Map && b instanceof Map &&
    deepEqual(Array.from(a.keys()), Array.from(b.keys())) &&
    deepEqual(Array.from(a.values()), Array.from(b.values()));
}

function areNumberObjectsEqual(a, b) {
  return a instanceof Number && b instanceof Number && a.valueOf() === b.valueOf();
}

function areBuffersEqual(a, b) {
  return Buffer.isBuffer(a) && Buffer.isBuffer(b) && exports.buffer.areEqual(a, b);
}

function areArraysDeepEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (!deepEqual(a[i], b[i])) return false;
  }
  return true;
}

function normalizeMongooseValue(val) {
  if (val && val.$__ != null) return val._doc;
  if (isMongooseObject(val)) return val.toObject();
  return val;
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
  if (a === b) return true;
  if (typeof a !== 'object' && typeof b !== 'object') return a === b;
  if (areDatesEqual(a, b)) return true;
  if (areBsonTypesEqual(a, b)) return true;
  if (areRegExpsEqual(a, b)) return true;
  if (a == null || b == null) return false;
  if (a.prototype !== b.prototype) return false;
  if (areMapsEqual(a, b)) return true;
  if (areNumberObjectsEqual(a, b)) return true;
  if (areBuffersEqual(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return areArraysDeepEqual(a, b);

  a = normalizeMongooseValue(a);
  b = normalizeMongooseValue(b);

  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  ka.sort();
  kb.sort();
  for (let i = ka.length - 1; i >= 0; --i) {
    if (ka[i] !== kb[i]) return false;
  }
  for (const key of ka) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
};

/*!
 * Get the last element of an array
 */
exports.last = function (arr) {
  return arr.length > 0 ? arr[arr.length - 1] : void 0;
};

exports.clone = clone;
exports.promiseOrCallback = promiseOrCallback;

/*!
 * Omit specified keys from an object
 */
exports.omit = function (obj, keys) {
  if (keys == null) return Object.assign({}, obj);
  if (!Array.isArray(keys)) keys = [keys];
  const ret = Object.assign({}, obj);
  for (const key of keys) delete ret[key];
  return ret;
};

/*!
 * Shallow copies defaults into options.
 */
exports.options = function (defaults, options) {
  const keys = Object.keys(defaults);
  options = options || {};
  for (let i = keys.length - 1; i >= 0; --i) {
    const k = keys[i];
    if (!(k in options)) options[k] = defaults[k];
  }
  return options;
};

/*!
 * Generates a random string
 */
exports.random = function () {
  return Math.random().toString().substr(3);
};

/* -------------------------------------------------------------------------- */
/* Merge Helpers                                                              */
/* -------------------------------------------------------------------------- */

function shouldSkipKey(key, options, path) {
  if (options.omit && options.omit[key]) return true;
  if (options.omitNested && options.omitNested[path]) return true;
  if (specialProperties.has(key)) return true;
  return false;
}

function handleSpecialMongooseTypes(to, from, key, options) {
  if (from[key] instanceof ObjectId) {
    to[key] = new ObjectId(from[key]);
    return true;
  }
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

/*!
 * Merges `from` into `to` without overwriting existing properties.
 */
exports.merge = function merge(to, from, options, path) {
  options = options || {};
  path = path || '';
  const keys = Object.keys(from);
  const omitNested = options.omitNested || {};

  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i];
    if (shouldSkipKey(key, options, path)) continue;
    if (to[key] == null) {
      to[key] = from[key];
      continue;
    }
    if (exports.isObject(from[key])) {
      if (!exports.isObject(to[key])) to[key] = {};
      if (from[key] != null) {
        if (options.isDiscriminatorSchemaMerge &&
          ((from[key].$isSingleNested && to[key].$isMongooseDocumentArray) ||
            (from[key].$isMongooseDocumentArray && to[key].$isSingleNested))) {
          continue;
        }
        if (handleSpecialMongooseTypes(to, from, key, options)) continue;
      }
      merge(to[key], from[key], options, path ? path + '.' + key : key);
    } else if (options.overwrite) {
      to[key] = from[key];
    }
  }
};

/*!
 * Applies toObject recursively.
 */
exports.toObject = function toObject(obj) {
  Document || (Document = require('./document'));
  if (obj == null) return obj;
  if (obj instanceof Document) return obj.toObject();
  if (Array.isArray(obj)) return obj.map(toObject);
  if (exports.isPOJO(obj)) {
    const ret = {};
    for (const k of Object.keys(obj)) {
      if (specialProperties.has(k)) continue;
      ret[k] = toObject(obj[k]);
    }
    return ret;
  }
  return obj;
};

exports.isObject = isObject;

/*!
 * Determines if `arg` is a plain old JavaScript object (POJO).
 */
exports.isPOJO = function (arg) {
  if (arg == null || typeof arg !== 'object') return false;
  const proto = Object.getPrototypeOf(arg);
  return !proto || proto.constructor.name === 'Object';
};

/*!
 * Determines if `obj` is a built-in object like an array, date, boolean,
 * etc.
 */
exports.isNativeObject = function (arg) {
  return Array.isArray(arg) ||
    arg instanceof Date ||
    arg instanceof Boolean ||
    arg instanceof Number ||
    arg instanceof String;
};

/*!
 * Determines if `val` is an object that has no own keys
 */
exports.isEmptyObject = function (val) {
  return val != null && typeof val === 'object' && Object.keys(val).length === 0;
};

/*!
 * Search if `obj` or any POJOs nested underneath `obj` has a property named
 * `key`
 */
exports.hasKey = function (obj, key) {
  for (const prop of Object.keys(obj)) {
    if (prop === key) return true;
    if (exports.isPOJO(obj[prop]) && exports.hasKey(obj[prop], key)) return true;
  }
  return false;
};

exports.args = sliced;

/*!
 * process.nextTick helper.
 */
exports.tick = function (callback) {
  if (typeof callback !== 'function') return;
  return function () {
    try {
      callback.apply(this, arguments);
    } catch (err) {
      immediate(() => { throw err; });
    }
  };
};

/*!
 * Returns true if `v` is an object that can be serialized as a primitive in
 * MongoDB
 */
exports.isMongooseType = function (v) {
  return v instanceof ObjectId || v instanceof Decimal || v instanceof Buffer;
};

exports.isMongooseObject = isMongooseObject;

/*!
 * Converts `expires` options of index objects to `expiresAfterSeconds` options for MongoDB.
 */
exports.expires = function (object) {
  if (!(object && object.constructor.name === 'Object')) return;
  if (!('expires' in object)) return;
  const when = typeof object.expires !== 'string' ? object.expires : Math.round(ms(object.expires) / 1000);
  object.expireAfterSeconds = when;
  delete object.expires;
};

/* -------------------------------------------------------------------------- */
/* Populate Helpers                                                          */
/* -------------------------------------------------------------------------- */

exports.populate = function populate(path, select, model, match, options, subPopulate, justOne, count) {
  let obj = null;
  if (arguments.length === 1) {
    if (path instanceof PopulateOptions) return [path];
    if (Array.isArray(path)) {
      const singles = makeSingles(path);
      return singles.map(o => exports.populate(o)[0]);
    }
    obj = exports.isObject(path) ? Object.assign({}, path) : { path };
  } else if (typeof model === 'object') {
    obj = { path, select, match: model, options: match };
  } else {
    obj = { path, select, model, match, options, populate: subPopulate, justOne, count };
  }

  if (typeof obj.path !== 'string') {
    throw new TypeError('utils.populate: invalid path. Expected string. Got typeof `' + typeof path + '`');
  }
  return _populateObj(obj);
};

function makeSingles(arr) {
  const ret = [];
  arr.forEach(o => {
    if (/[\s]/.test(o.path)) {
      o.path.split(' ').forEach(p => {
        const copy = Object.assign({}, o);
        copy.path = p;
        ret.push(copy);
      });
    } else {
      ret.push(o);
    }
  });
  return ret;
}

function _populateObj(obj) {
  if (Array.isArray(obj.populate)) {
    const ret = [];
    obj.populate.forEach(o => {
      if (/[\s]/.test(o.path)) {
        const copy = Object.assign({}, o);
        copy.path.split(' ').forEach(p => {
          copy.path = p;
          ret.push(exports.populate(copy)[0]);
        });
      } else {
        ret.push(exports.populate(o)[0]);
      }
    });
    obj.populate = exports.populate(ret);
  } else if (obj.populate != null && typeof obj.populate === 'object') {
    obj.populate = exports.populate(obj.populate);
  }

  const paths = obj.path.split(' ');
  if (obj.options != null) obj.options = exports.clone(obj.options);
  return paths.map(p => new PopulateOptions(Object.assign({}, obj, { path: p })));
}

/*!
 * Return the value of `obj` at the given `path`.
 */
exports.getValue = function (path, obj, map) {
  return mpath.get(path, obj, '_doc', map);
};

/*!
 * Sets the value of `obj` at the given `path`.
 */
exports.setValue = function (path, val, obj, map, _copying) {
  mpath.set(path, val, obj, '_doc', map, _copying);
};

/* -------------------------------------------------------------------------- */
/* Object Utilities                                                          */
/* -------------------------------------------------------------------------- */

exports.object = {};
exports.object.vals = function (o) {
  const keys = Object.keys(o);
  const ret = [];
  for (let i = keys.length - 1; i >= 0; --i) ret.push(o[keys[i]]);
  return ret;
};

exports.object.shallowCopy = exports.options;

const hop = Object.prototype.hasOwnProperty;
exports.object.hasOwnProperty = function (obj, prop) {
  return hop.call(obj, prop);
};

exports.isNullOrUndefined = function (val) {
  return val === null || val === undefined;
};

/* -------------------------------------------------------------------------- */
/* Array Utilities                                                            */
/* -------------------------------------------------------------------------- */

exports.array = {};

exports.array.flatten = function flatten(arr, filter, ret) {
  ret = ret || [];
  arr.forEach(item => {
    if (Array.isArray(item)) {
      flatten(item, filter, ret);
    } else if (!filter || filter(item)) {
      ret.push(item);
    }
  });
  return ret;
};

const _hasOwnProperty = Object.prototype.hasOwnProperty;
exports.hasUserDefinedProperty = function (obj, key) {
  if (obj == null) return false;
  if (Array.isArray(key)) {
    return key.some(k => exports.hasUserDefinedProperty(obj, k));
  }
  if (_hasOwnProperty.call(obj, key)) return true;
  if (typeof obj === 'object' && key in obj) {
    const v = obj[key];
    return v !== Object.prototype[key] && v !== Array.prototype[key];
  }
  return false;
};

const MAX_ARRAY_INDEX = Math.pow(2, 32) - 1;
exports.isArrayIndex = function (val) {
  if (typeof val === 'number') return val >= 0 && val <= MAX_ARRAY_INDEX;
  if (typeof val === 'string') {
    if (!/^\d+$/.test(val)) return false;
    const num = +val;
    return num >= 0 && num <= MAX_ARRAY_INDEX;
  }
  return false;
};

exports.array.unique = function (arr) {
  const primitives = new Set();
  const ids = new Set();
  const ret = [];
  for (const item of arr) {
    if (typeof item === 'number' || typeof item === 'string' || item == null) {
      if (!primitives.has(item)) {
        primitives.add(item);
        ret.push(item);
      }
    } else if (item instanceof ObjectId) {
      const str = item.toString();
      if (!ids.has(str)) {
        ids.add(str);
        ret.push(item);
      }
    } else {
      ret.push(item);
    }
  }
  return ret;
};

exports.buffer = {};
exports.buffer.areEqual = function (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

exports.getFunctionName = getFunctionName;

/*!
 * Decorate buffers
 */
exports.decorate = function (destination, source) {
  for (const key in source) {
    if (specialProperties.has(key)) continue;
    destination[key] = source[key];
  }
};

/**
 * merges to with a copy of from
 */
exports.mergeClone = function (to, fromObj) {
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
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i];
    if (specialProperties.has(key)) continue;
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
      if (val != null && val.valueOf && !(val instanceof Date)) val = val.valueOf();
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
        if (val.isMongooseBuffer) obj = Buffer.from(obj);
        exports.mergeClone(to[key], obj);
      } else {
        to[key] = exports.clone(val, { flattenDecimals: false });
      }
    }
  }
};

/**
 * Executes a function on each element of an array (like _.each)
 */
exports.each = function (arr, fn) {
  for (const item of arr) fn(item);
};

exports.getOption = function (name) {
  const sources = Array.prototype.slice.call(arguments, 1);
  for (const source of sources) {
    if (source[name] != null) return source[name];
  }
  return null;
};

exports.noop = function () { };

exports.errorToPOJO = function (error) {
  if (!(error instanceof Error)) throw new Error('`error` must be `instanceof Error`.');
  const ret = {};
  for (const prop of Object.getOwnPropertyNames(error)) {
    ret[prop] = error[prop];
  }
  return ret;
};

exports.nodeMajorVersion = function () {
  return parseInt(process.versions.node.split('.')[0], 10);
};