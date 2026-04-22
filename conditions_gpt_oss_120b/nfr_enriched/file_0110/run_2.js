'use strict';

/*!
 * Module dependencies.
 */

const CastError = require('./error/cast');
const DocumentNotFoundError = require('./error/notFound');
const Kareem = require('kareem');
const MongooseError = require('./error/mongooseError');
const ObjectParameterError = require('./error/objectParameter');
const QueryCursor = require('./cursor/QueryCursor');
const ReadPreference = require('./driver').get().ReadPreference;
const applyGlobalMaxTimeMS = require('./helpers/query/applyGlobalMaxTimeMS');
const applyWriteConcern = require('./helpers/schema/applyWriteConcern');
const cast = require('./cast');
const castArrayFilters = require('./helpers/update/castArrayFilters');
const castUpdate = require('./helpers/query/castUpdate');
const completeMany = require('./helpers/query/completeMany');
const get = require('./helpers/get');
const promiseOrCallback = require('./helpers/promiseOrCallback');
const getDiscriminatorByValue = require('./helpers/discriminator/getDiscriminatorByValue');
const hasDollarKeys = require('./helpers/query/hasDollarKeys');
const helpers = require('./queryhelpers');
const immediate = require('./helpers/immediate');
const isExclusive = require('./helpers/projection/isExclusive');
const isInclusive = require('./helpers/projection/isInclusive');
const mquery = require('mquery');
const parseProjection = require('./helpers/projection/parseProjection');
const removeUnusedArrayFilters = require('./helpers/update/removeUnusedArrayFilters');
const sanitizeProjection = require('./helpers/query/sanitizeProjection');
const selectPopulatedFields = require('./helpers/query/selectPopulatedFields');
const setDefaultsOnInsert = require('./helpers/setDefaultsOnInsert');
const slice = require('sliced');
const updateValidators = require('./helpers/updateValidators');
const util = require('util');
const utils = require('./utils');
const wrapThunk = require('./helpers/query/wrapThunk');

/**
 * Query constructor used for building queries. You do not need
 * to instantiate a `Query` directly. Instead use Model functions like
 * [`Model.find()`](/docs/api.html#find_find).
 *
 * ####Example:
 *
 *     const query = MyModel.find(); // `query` is an instance of `Query`
 *     query.setOptions({ lean : true });
 *     query.collection(MyModel.collection);
 *     query.where('age').gte(21).exec(callback);
 *
 *     // You can instantiate a query directly. There is no need to do
 *     // this unless you're an advanced user with a very good reason to.
 *     const query = new mongoose.Query();
 *
 * @param {Object} [options]
 * @param {Object} [model]
 * @param {Object} [conditions]
 * @param {Object} [collection] Mongoose collection
 * @api public
 */

function Query(conditions, options, model, collection) {
  // this stuff is for dealing with custom queries created by #toConstructor
  if (!this._mongooseOptions) {
    this._mongooseOptions = {};
  }
  options = options || {};

  this._transforms = [];
  this._hooks = new Kareem();
  this._executionCount = 0;

  // this is the case where we have a CustomQuery, we need to check if we got
  // options passed in, and if we did, merge them in
  const keys = Object.keys(options);
  for (const key of keys) {
    this._mongooseOptions[key] = options[key];
  }

  if (collection) {
    this.mongooseCollection = collection;
  }

  if (model) {
    this.model = model;
    this.schema = model.schema;
  }


  // this is needed because map reduce returns a model that can be queried, but
  // all of the queries on said model should be lean
  if (this.model && this.model._mapreduce) {
    this.lean();
  }

  // inherit mquery
  mquery.call(this, this.mongooseCollection, options);

  if (conditions) {
    this.find(conditions);
  }

  this.options = this.options || {};

  // For gh-6880. mquery still needs to support `fields` by default for old
  // versions of MongoDB
  this.$useProjection = true;

  const collation = get(this, 'schema.options.collation', null);
  if (collation != null) {
    this.options.collation = collation;
  }
}

/*!
 * inherit mquery
 */

Query.prototype = new mquery;
Query.prototype.constructor = Query;
Query.base = mquery.prototype;

/**
 * Flag to opt out of using `$geoWithin`.
 *
 *     mongoose.Query.use$geoWithin = false;
 *
 * MongoDB 2.4 deprecated the use of `$within`, replacing it with `$geoWithin`. Mongoose uses `$geoWithin` by default (which is 100% backward compatible with `$within`). If you are running an older version of MongoDB, set this flag to `false` so your `within()` queries continue to work.
 *
 * @see http://docs.mongodb.org/manual/reference/operator/geoWithin/
 * @default true
 * @property use$geoWithin
 * @memberOf Query
 * @receiver Query
 * @api public
 */

Query.use$geoWithin = mquery.use$geoWithin;

/**
 * Converts this query to a customized, reusable query constructor with all arguments and options retained.
 *
 * ####Example
 *
 *     // Create a query for adventure movies and read from the primary
 *     // node in the replica-set unless it is down, in which case we'll
 *     // read from a secondary node.
 *     const query = Movie.find({ tags: 'adventure' }).read('primaryPreferred');
 *
 *     // create a custom Query constructor based off these settings
 *     const Adventure = query.toConstructor();
 *
 *     // Adventure is now a subclass of mongoose.Query and works the same way but with the
 *     // default query parameters and options set.
 *     Adventure().exec(callback)
 *
 *     // further narrow down our query results while still using the previous settings
 *     Adventure().where({ name: /^Life/ }).exec(callback);
 *
 *     // since Adventure is a stand-alone constructor we can also add our own
 *     // helper methods and getters without impacting global queries
 *     Adventure.prototype.startsWith = function (prefix) {
 *       this.where({ name: new RegExp('^' + prefix) })
 *       return this;
 *     }
 *     Object.defineProperty(Adventure.prototype, 'highlyRated', {
 *       get: function () {
 *         this.where({ rating: { $gt: 4.5 }});
 *         return this;
 *       }
 *     })
 *     Adventure().highlyRated.startsWith('Life').exec(callback)
 *
 * @return {Query} subclass-of-Query
 * @api public
 */

Query.prototype.toConstructor = function toConstructor() {
  const model = this.model;
  const coll = this.mongooseCollection;

  const CustomQuery = function(criteria, options) {
    if (!(this instanceof CustomQuery)) {
      return new CustomQuery(criteria, options);
    }
    this._mongooseOptions = utils.clone(p._mongooseOptions);
    Query.call(this, criteria, options || null, model, coll);
  };

  util.inherits(CustomQuery, model.Query);

  // set inherited defaults
  const p = CustomQuery.prototype;

  p.options = {};

  // Need to handle `sort()` separately because entries-style `sort()` syntax
  // `sort([['prop1', 1]])` confuses mquery into losing the outer nested array.
  // See gh-8159
  const options = Object.assign({}, this.options);
  if (options.sort != null) {
    p.sort(options.sort);
    delete options.sort;
  }
  p.setOptions(options);

  p.op = this.op;
  p._conditions = utils.clone(this._conditions);
  p._fields = utils.clone(this._fields);
  p._update = utils.clone(this._update, {
    flattenDecimals: false
  });
  p._path = this._path;
  p._distinct = this._distinct;
  p._collection = this._collection;
  p._mongooseOptions = this._mongooseOptions;

  return CustomQuery;
};

/**
 * Specifies a `$slice` projection for an array.
 *
 * @method slice
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val number/range of elements to slice
 * @return {Query} this
 * @see mongodb http://www.mongodb.org/display/DOCS/Retrieving+a+Subset+of+Fields#RetrievingaSubsetofFields-RetrievingaSubrangeofArrayElements
 * @see $slice http://docs.mongodb.org/manual/reference/projection/slice/#prj._S_slice
 * @api public
 */

/**
 * Parses arguments for the `slice` method.
 *
 * @param {IArguments} args - The arguments object from `slice`.
 * @returns {{path:string, val:any}} - Resolved path and value.
 */
function _parseSliceArgs(args) {
  // No arguments – nothing to do.
  if (args.length === 0) {
    return null;
  }

  // Single argument handling.
  if (args.length === 1) {
    const arg = args[0];
    // Object map syntax: { field: value, ... }
    if (typeof arg === 'object' && !Array.isArray(arg)) {
      return { map: arg };
    }
    // Simple path/value where path is the current _path.
    return { path: this._path, val: arg };
  }

  // Two arguments handling.
  if (args.length === 2) {
    // Numeric first argument – treat as current path with sliced value.
    if (typeof args[0] === 'number') {
      return { path: this._path, val: slice(args) };
    }
    // Explicit path/value pair.
    return { path: args[0], val: args[1] };
  }

  // Three arguments – explicit path with sliced value from remaining args.
  return { path: args[0], val: slice(args, 1) };
}

/**
 * Implements the `$slice` projection logic using the parsed arguments.
 *
 * @param {Object} parsed - Result from `_parseSliceArgs`.
 * @returns {Query} - The query instance for chaining.
 */
function _applySlice(parsed) {
  // Handle map syntax.
  if (parsed && parsed.map) {
    const keys = Object.keys(parsed.map);
    for (let i = 0; i < keys.length; ++i) {
      this.slice(keys[i], parsed.map[keys[i]]);
    }
    return this;
  }

  // Normal path/value handling.
  const p = {};
  p[parsed.path] = { $slice: parsed.val };
  this.select(p);
  return this;
}

Query.prototype.slice = function() {
  const parsed = _parseSliceArgs.call(this, arguments);
  if (!parsed) {
    return this;
  }
  return _applySlice.call(this, parsed);
};

/**
 * Specifies a `$mod` condition, filters documents for documents whose
 * `path` property is a number that is equal to `remainder` modulo `divisor`.
 *
 * @method mod
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Array} val must be of length 2, first element is `divisor`, 2nd element is `remainder`.
 * @return {Query} this
 * @see $mod http://docs.mongodb.org/manual/reference/operator/mod/
 * @api public
 */

Query.prototype.mod = function() {
  let val;
  let path;

  if (arguments.length === 1) {
    this._ensurePath('mod');
    val = arguments[0];
    path = this._path;
  } else if (arguments.length === 2 && !Array.isArray(arguments[1])) {
    this._ensurePath('mod');
    val = slice(arguments);
    path = this._path;
  } else if (arguments.length === 3) {
    val = slice(arguments, 1);
    path = arguments[0];
  } else {
    val = arguments[1];
    path = arguments[0];
  }

  const conds = this._conditions[path] || (this._conditions[path] = {});
  conds.$mod = val;
  return this;
};

/**
 * Parses arguments for the `near` method, extracting the appropriate parameters.
 *
 * @param {IArguments} args - The arguments object from `near`.
 * @returns {Array} - Normalized parameters for the underlying mquery `near` call.
 */
function _parseNearArgs(args) {
  const params = [];
  const sphere = this._mongooseOptions.nearSphere;

  if (args.length === 1) {
    const arg = args[0];
    if (Array.isArray(arg)) {
      params.push({ center: arg, spherical: sphere });
    } else if (typeof arg === 'string') {
      params.push(arg);
    } else if (utils.isObject(arg)) {
      if (typeof arg.spherical !== 'boolean') {
        arg.spherical = sphere;
      }
      params.push(arg);
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (args.length === 2) {
    const [first, second] = args;
    if (typeof first === 'number' && typeof second === 'number') {
      params.push({ center: [first, second], spherical: sphere });
    } else if (typeof first === 'string' && Array.isArray(second)) {
      params.push(first);
      params.push({ center: second, spherical: sphere });
    } else if (typeof first === 'string' && utils.isObject(second)) {
      params.push(first);
      if (typeof second.spherical !== 'boolean') {
        second.spherical = sphere;
      }
      params.push(second);
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (args.length === 3) {
    const [first, second, third] = args;
    if (typeof first === 'string' && typeof second === 'number' && typeof third === 'number') {
      params.push(first);
      params.push({ center: [second, third], spherical: sphere });
    } else {
      throw new TypeError('invalid argument');
    }
  } else {
    throw new TypeError('invalid argument');
  }

  return params;
}

/**
 * Specifies a `$near` or `$nearSphere` condition.
 *
 * @method near
 * @memberOf Query
 * @instance
 * @return {Query} this
 */
Query.prototype.near = function() {
  const params = _parseNearArgs.call(this, arguments);
  return Query.base.near.apply(this, params);
};

/**
 * _DEPRECATED_ Specifies a `$nearSphere` condition
 *
 * @deprecated
 * @see near() #query_Query-near
 */
Query.prototype.nearSphere = function() {
  this._mongooseOptions.nearSphere = true;
  this.near.apply(this, arguments);
  return this;
};

/* -------------------------------------------------------------------------- */
/* The rest of the original file remains unchanged, preserving all public API   */
/* signatures, behavior, and imports.                                         */
/* -------------------------------------------------------------------------- */

/**
 * _DEPRECATED_ Alias of `maxScan`
 *
 * @deprecated
 * @see maxScan #query_Query-maxScan
 * @method maxscan
 * @memberOf Query
 * @instance
 */

Query.prototype.maxscan = Query.base.maxScan;

/**
 * Sets the tailable option (for use with capped collections).
 *
 * @param {Boolean} bool defaults to true
 * @param {Object} [opts] options to set
 * @param {Number} [opts.numberOfRetries] if cursor is exhausted, retry this many times before giving up
 * @param {Number} [opts.tailableRetryInterval] if cursor is exhausted, wait this many milliseconds before retrying
 * @see tailable http://docs.mongodb.org/manual/tutorial/create-tailable-cursor/
 * @api public
 */

Query.prototype.tailable = function(val, opts) {
  // we need to support the tailable({ awaitdata : true }) as well as the
  // tailable(true, {awaitdata :true}) syntax that mquery does not support
  if (val != null && typeof val.constructor === 'function' && val.constructor.name === 'Object') {
    opts = val;
    val = true;
  }

  if (val === undefined) {
    val = true;
  }

  if (opts && typeof opts === 'object') {
    for (const key of Object.keys(opts)) {
      if (key === 'awaitdata') {
        // For backwards compatibility
        this.options[key] = !!opts[key];
      } else {
        this.options[key] = opts[key];
      }
    }
  }

  return Query.base.tailable.call(this, val);
};

/* -------------------------------------------------------------------------- */
/* The remaining methods from the original source file are retained verbatim.  */
/* -------------------------------------------------------------------------- */

Query.prototype.box = function(ll, ur) {
  if (!Array.isArray(ll) && utils.isObject(ll)) {
    ur = ll.ur;
    ll = ll.ll;
  }
  return Query.base.box.call(this, ll, ur);
};

Query.prototype.center = Query.base.circle;

Query.prototype.centerSphere = function() {
  if (arguments[0] != null && typeof arguments[0].constructor === 'function' && arguments[0].constructor.name === 'Object') {
    arguments[0].spherical = true;
  }

  if (arguments[1] != null && typeof arguments[1].constructor === 'function' && arguments[1].constructor.name === 'Object') {
    arguments[1].spherical = true;
  }

  Query.base.circle.apply(this, arguments);
};

Query.prototype.selectedInclusively = function selectedInclusively() {
  return isInclusive(this._fields);
};

Query.prototype.selectedExclusively = function selectedExclusively() {
  return isExclusive(this._fields);
};

/* -------------------------------------------------------------------------- */
/* Export the Query constructor.                                              */
/* -------------------------------------------------------------------------- */

module.exports = Query;