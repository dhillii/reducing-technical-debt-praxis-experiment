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
 * Normalizes values for deep equality checks.
 */
function _normalize(val) {
  if (val && val.$__ != null) {
    return val._doc;
  }
  if (isMongooseObject(val)) {
    return val.toObject();
  }
  return val;
}

/*!
 * Compare two RegExp objects.
 */
function _compareRegExp(a, b) {
  return a.source === b.source &&
    a.ignoreCase === b.ignoreCase &&
    a.multiline === b.multiline &&
    a.global === b.global;
}

/*!
 * Compare two Buffer objects.
 */
function _compareBuffer(a, b) {
  return exports.buffer.areEqual(a, b);
}

/*!
 * Compare two Map objects.
 */
function _compareMap(a, b) {
  if (a.size !== b.size) return false;
  const aKeys = Array.from(a.keys());
  const bKeys = Array.from(b.keys());
  if (!deepEqual(aKeys, bKeys)) return false;
  const aVals = Array.from(a.values());
  const bVals = Array.from(b.values());
  return deepEqual(aVals, bVals);
}

/*!
 * Compare two plain objects.
 */
function _compareObject(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  ka.sort();
  kb.sort();
  for (let i = 0; i < ka.length; ++i) {
    if (ka[i] !== kb[i]) return false;
  }
  for (const key of ka) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/*!
 * Compare two arrays.
 */
function _compareArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (!deepEqual(a[i], b[i])) return false;
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
  if (a === b) return true;
  if (typeof a !== 'object' && typeof b !== 'object') return a === b;
  if (a == null || b == null) return false;

  a = _normalize(a);
  b = _normalize(b);

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if ((isBsonType(a, 'ObjectID') && isBsonType(b, 'ObjectID')) ||
      (isBsonType(a, 'Decimal128') && isBsonType(b, 'Decimal128'))) {
    return a.toString() === b.toString();
  }
  if (a instanceof RegExp && b instanceof RegExp) {
    return _compareRegExp(a, b);
  }
  if (a instanceof Map && b instanceof Map) {
    return _compareMap(a, b);
  }
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
    return _compareBuffer(a, b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return _compareArray(a, b);
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return _compareObject(a, b);
  }
  return false;
};

/*!
 * Get the last element of an array
 */
exports.last = function(arr) {
  return arr.length > 0 ? arr[arr.length - 1] : void 0;
};

exports.clone = clone;
exports.promiseOrCallback = promiseOrCallback;

exports.omit = function omit(obj, keys) {
  if (keys == null) return Object.assign({}, obj);
  if (!Array.isArray(keys)) keys = [keys];
  const ret = Object.assign({}, obj);
  for (const key of keys) delete ret[key];
  return ret;
};

exports.options = function(defaults, options) {
  const keys = Object.keys(defaults);
  options = options || {};
  for (let i = keys.length - 1; i >= 0; --i) {
    const k = keys[i];
    if (!(k in options)) options[k] = defaults[k];
  }
  return options;
};

exports.random = function() {
  return Math.random().toString().substr(3);
};

exports.merge = function merge(to, from, options, path) {
  options = options || {};
  const keys = Object.keys(from);
  path = path || '';
  const omitNested = options.omitNested || {};

  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i];
    if (options.omit && options.omit[key]) continue;
    if (omitNested[path]) continue;
    if (specialProperties.has(key)) continue;
    if (to[key] == null) {
      to[key] = from[key];
    } else if (exports.isObject(from[key])) {
      if (!exports.isObject(to[key])) to[key] = {};
      if (from[key] != null) {
        if (options.isDiscriminatorSchemaMerge &&
            ((from[key].$isSingleNested && to[key].$isMongooseDocumentArray) ||
             (from[key].$isMongooseDocumentArray && to[key].$isSingleNested))) {
          continue;
        } else if (from[key].instanceOfSchema) {
          if (to[key].instanceOfSchema) {
            schemaMerge(to[key], from[key].clone(), options.isDiscriminatorSchemaMerge);
          } else {
            to[key] = from[key].clone();
          }
          continue;
        } else if (from[key] instanceof ObjectId) {
          to[key] = new ObjectId(from[key]);
          continue;
        }
      }
      merge(to[key], from[key], options, path ? path + '.' + key : key);
    } else if (options.overwrite) {
      to[key] = from[key];
    }
  }
};

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

exports.isPOJO = function isPOJO(arg) {
  if (arg == null || typeof arg !== 'object') return false;
  const proto = Object.getPrototypeOf(arg);
  return !proto || proto.constructor.name === 'Object';
};

exports.isNativeObject = function(arg) {
  return Array.isArray(arg) ||
    arg instanceof Date ||
    arg instanceof Boolean ||
    arg instanceof Number ||
    arg instanceof String;
};

exports.isEmptyObject = function(val) {
  return val != null && typeof val === 'object' && Object.keys(val).length === 0;
};

exports.hasKey = function hasKey(obj, key) {
  for (const prop of Object.keys(obj)) {
    if (prop === key) return true;
    if (exports.isPOJO(obj[prop]) && exports.hasKey(obj[prop], key)) return true;
  }
  return false;
};

exports.args = sliced;

exports.tick = function tick(callback) {
  if (typeof callback !== 'function') return;
  return function() {
    try {
      callback.apply(this, arguments);
    } catch (err) {
      immediate(() => { throw err; });
    }
  };
};

exports.isMongooseType = function(v) {
  return v instanceof ObjectId || v instanceof Decimal || v instanceof Buffer;
};

exports.isMongooseObject = isMongooseObject;

exports.expires = function expires(object) {
  if (!(object && object.constructor.name === 'Object')) return;
  if (!('expires' in object)) return;
  const when = typeof object.expires !== 'string'
    ? object.expires
    : Math.round(ms(object.expires) / 1000);
  object.expireAfterSeconds = when;
  delete object.expires;
};

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
  function makeSingles(arr) {
    const ret = [];
    arr.forEach(function(o) {
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
};

function _populateObj(obj) {
  if (Array.isArray(obj.populate)) {
    const ret = [];
    obj.populate.forEach(function(p) {
      if (/[\s]/.test(p.path)) {
        const copy = Object.assign({}, p);
        copy.path.split(' ').forEach(pth => {
          copy.path = pth;
          ret.push(exports.populate(copy)[0]);
        });
      } else {
        ret.push(exports.populate(p)[0]);
      }
    });
    obj.populate = exports.populate(ret);
  } else if (obj.populate != null && typeof obj.populate === 'object') {
    obj.populate = exports.populate(obj.populate);
  }
  const ret = [];
  const paths = obj.path.split(' ');
  if (obj.options != null) obj.options = exports.clone(obj.options);
  for (const path of paths) {
    ret.push(new PopulateOptions(Object.assign({}, obj, { path })));
  }
  return ret;
}

exports.getValue = function(path, obj, map) {
  return mpath.get(path, obj, '_doc', map);
};

exports.setValue = function(path, val, obj, map, _copying) {
  mpath.set(path, val, obj, '_doc', map, _copying);
};

exports.object = {};
exports.object.vals = function vals(o) {
  const keys = Object.keys(o);
  const ret = new Array(keys.length);
  for (let i = keys.length - 1; i >= 0; --i) {
    ret[i] = o[keys[i]];
  }
  return ret;
};

exports.object.shallowCopy = exports.options;

const hop = Object.prototype.hasOwnProperty;
exports.object.hasOwnProperty = function(obj, prop) {
  return hop.call(obj, prop);
};

exports.isNullOrUndefined = function(val) {
  return val === null || val === undefined;
};

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
exports.hasUserDefinedProperty = function(obj, key) {
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
exports.isArrayIndex = function(val) {
  if (typeof val === 'number') return val >= 0 && val <= MAX_ARRAY_INDEX;
  if (typeof val === 'string' && /^\d+$/.test(val)) {
    const num = +val;
    return num >= 0 && num <= MAX_ARRAY_INDEX;
  }
  return false;
};

exports.array.unique = function(arr) {
  const primitives = new Set();
  const ids = new Set();
  const ret = [];
  for (const item of arr) {
    if (item == null || typeof item === 'number' || typeof item === 'string') {
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
exports.buffer.areEqual = function(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

exports.getFunctionName = getFunctionName;

exports.decorate = function(destination, source) {
  for (const key in source) {
    if (specialProperties.has(key)) continue;
    destination[key] = source[key];
  }
};

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
        to[key] = exports.clone(val, { flattenDecimals: false });
      }
    }
  }
};

exports.each = function(arr, fn) {
  for (const item of arr) fn(item);
};

exports.getOption = function(name) {
  const sources = Array.prototype.slice.call(arguments, 1);
  for (const source of sources) {
    if (source[name] != null) return source[name];
  }
  return null;
};

exports.noop = function() {};

exports.errorToPOJO = function errorToPOJO(error) {
  if (!(error instanceof Error)) {
    throw new Error('`error` must be `instanceof Error`.');
  }
  const ret = {};
  for (const prop of Object.getOwnPropertyNames(error)) {
    ret[prop] = error[prop];
  }
  return ret;
};

exports.nodeMajorVersion = function nodeMajorVersion() {
  return parseInt(process.versions.node.split('.')[0], 10);
};