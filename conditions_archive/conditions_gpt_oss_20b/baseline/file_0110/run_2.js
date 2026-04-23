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
const ReadPreference = require('mquery').ReadPreference;
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
 * @param {Object} [options]
 * @param {Object} [model]
 * @param {Object} [conditions]
 * @param {Object} [collection] Mongoose collection
 * @api public
 */

function Query(conditions, options, model, collection) {
  if (!this._mongooseOptions) {
    this._mongooseOptions = {};
  }
  options = options || {};

  this._transforms = [];
  this._hooks = new Kareem();
  this._executionCount = 0;

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

  if (this.model && this.model._mapreduce) {
    this.lean();
  }

  mquery.call(this, this.mongooseCollection, options);

  if (conditions) {
    this.find(conditions);
  }

  this.options = this.options || {};

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

  const p = CustomQuery.prototype;

  p.options = {};

  const options = Object.assign({}, this.options);
  if (options.sort != null) {
    p.sort(options.sort);
    delete options.sort;
  }
  p.setOptions(options);

  p.op = this.op;
  p._conditions = utils.clone(this._conditions);
  p._fields = utils.clone(this._fields);
  p._update = utils.clone(this._update, { flattenDecimals: false });
  p._path = this._path;
  p._distinct = this._distinct;
  p._collection = this._collection;
  p._mongooseOptions = this._mongooseOptions;

  return CustomQuery;
};

/**
 * Specifies a javascript function or expression to pass to MongoDBs query system.
 *
 * @method $where
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `path` for use with chaining.
 *
 * @method where
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$slice` projection for an array.
 *
 * @method slice
 * @memberOf Query
 * @instance
 * @api public
 */

Query.prototype.slice = function() {
  if (arguments.length === 0) {
    return this;
  }

  this._validate('slice');

  let path;
  let val;

  if (arguments.length === 1) {
    const arg = arguments[0];
    if (typeof arg === 'object' && !Array.isArray(arg)) {
      const keys = Object.keys(arg);
      const numKeys = keys.length;
      for (let i = 0; i < numKeys; ++i) {
        this.slice(keys[i], arg[keys[i]]);
      }
      return this;
    }
    this._ensurePath('slice');
    path = this._path;
    val = arguments[0];
  } else if (arguments.length === 2) {
    if ('number' === typeof arguments[0]) {
      this._ensurePath('slice');
      path = this._path;
      val = slice(arguments);
    } else {
      path = arguments[0];
      val = arguments[1];
    }
  } else if (arguments.length === 3) {
    path = arguments[0];
    val = slice(arguments, 1);
  }

  const p = {};
  p[path] = { $slice: val };
  this.select(p);

  return this;
};

/**
 * Specifies the complementary comparison value for paths specified with `where()`
 *
 * @method equals
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies arguments for an `$or` condition.
 *
 * @method or
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies arguments for a `$nor` condition.
 *
 * @method nor
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies arguments for a `$and` condition.
 *
 * @method and
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$gt` query condition.
 *
 * @method gt
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$gte` query condition.
 *
 * @method gte
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$lt` query condition.
 *
 * @method lt
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$lte` query condition.
 *
 * @method lte
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$ne` query condition.
 *
 * @method ne
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies an `$in` query condition.
 *
 * @method in
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies an `$nin` query condition.
 *
 * @method nin
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies an `$all` query condition.
 *
 * @method all
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$size` query condition.
 *
 * @method size
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$regex` query condition.
 *
 * @method regex
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `maxDistance` query condition.
 *
 * @method maxDistance
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$mod` condition, filters documents for documents whose
 * `path` property is a number that is equal to `remainder` modulo `divisor`.
 *
 * @method mod
 * @memberOf Query
 * @instance
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
 * Specifies an `$exists` condition
 *
 * @method exists
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies an `$elemMatch` condition
 *
 * @method elemMatch
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Defines a `$within` or `$geoWithin` argument for geo-spatial queries.
 *
 * @method within
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies this query as a `count` query.
 *
 * @method count
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies this query as a `estimatedDocumentCount()` query.
 *
 * @method estimatedDocumentCount
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies this query as a `countDocuments()` query.
 *
 * @method countDocuments
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Thunk around distinct()
 *
 * @param {Function} [callback]
 * @api private
 */

Query.prototype.__distinct = wrapThunk(function __distinct(callback) {
  this._castConditions();

  if (this.error()) {
    callback(this.error());
    return null;
  }

  applyGlobalMaxTimeMS(this.options, this.model);

  const options = this._optionsForExec();

  this._collection.collection
    .distinct(this._distinct, this._conditions, options, callback);
});

/**
 * Declares or executes this query as a distinct() operation.
 *
 * @param {String} [field]
 * @param {Object|Query} [filter]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */

Query.prototype.distinct = function(field, conditions, callback) {
  this.op = 'distinct';
  if (!callback) {
    if (typeof conditions === 'function') {
      callback = conditions;
      conditions = undefined;
    } else if (typeof field === 'function') {
      callback = field;
      field = undefined;
      conditions = undefined;
    }
  }

  conditions = utils.toObject(conditions);

  if (mquery.canMerge(conditions)) {
    this.merge(conditions);
    prepareDiscriminatorCriteria(this);
  } else if (conditions != null) {
    this.error(new ObjectParameterError(conditions, 'filter', 'distinct'));
  }

  if (field != null) {
    this._distinct = field;
  }

  if (callback != null) {
    this.exec(callback);
  }

  return this;
};

/**
 * Sets the sort order
 *
 * @param {Object|String} arg
 * @return {Query} this
 * @api public
 */

Query.prototype.sort = function(arg) {
  if (arguments.length > 1) {
    throw new Error('sort() only takes 1 Argument');
  }

  return Query.base.sort.call(this, arg);
};

/**
 * Declares an intersects query for `geometry()`.
 *
 * @method intersects
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$geometry` condition
 *
 * @method geometry
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$near` or `$nearSphere` condition
 *
 * @method near
 * @memberOf Query
 * @instance
 * @api public
 */

function parseNearArgs(args, sphere) {
  const params = [];
  if (args.length === 1) {
    const a = args[0];
    if (Array.isArray(a)) {
      params.push({ center: a, spherical: sphere });
    } else if (typeof a === 'string') {
      params.push(a);
    } else if (typeof a === 'object') {
      if (typeof a.spherical !== 'boolean') {
        a.spherical = sphere;
      }
      params.push(a);
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (args.length === 2) {
    const [a, b] = args;
    if (typeof a === 'number' && typeof b === 'number') {
      params.push({ center: [a, b], spherical: sphere });
    } else if (typeof a === 'string' && Array.isArray(b)) {
      params.push(a);
      params.push({ center: b, spherical: sphere });
    } else if (typeof a === 'string' && typeof b === 'object') {
      params.push(a);
      if (typeof b.spherical !== 'boolean') {
        b.spherical = sphere;
      }
      params.push(b);
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (args.length === 3) {
    const [a, b, c] = args;
    if (typeof a === 'string' && typeof b === 'number' && typeof c === 'number') {
      params.push(a);
      params.push({ center: [b, c], spherical: sphere });
    } else {
      throw new TypeError('invalid argument');
    }
  } else {
    throw new TypeError('invalid argument');
  }
  return params;
}

Query.prototype.near = function() {
  const sphere = this._mongooseOptions.nearSphere;
  const params = parseNearArgs(Array.from(arguments), sphere);
  return Query.base.near.apply(this, params);
};

/**
 * _DEPRECATED_ Specifies a `$nearSphere` condition
 *
 * @deprecated
 * @api public
 */

Query.prototype.nearSphere = function() {
  this._mongooseOptions.nearSphere = true;
  this.near.apply(this, arguments);
  return this;
};

/**
 * Returns an asyncIterator for use with [`for/await/of` loops](https://thecodebarbarian.com/getting-started-with-async-iterators-in-node-js)
 * This function *only* works for `find()` queries.
 * You do not need to call this function explicitly, the JavaScript runtime
 * will call it for you.
 *
 * @method Symbol.asyncIterator
 * @memberOf Query
 * @instance
 * @api public
 */

if (Symbol.asyncIterator != null) {
  Query.prototype[Symbol.asyncIterator] = function() {
    return this.cursor().transformNull()._transformForAsyncIterator();
  };
}

/**
 * Specifies a `$polygon` condition
 *
 * @method polygon
 * @memberOf Query
 * @instance
 * @api public
 */

/**
 * Specifies a `$box` condition
 *
 * @method box
 * @memberOf Query
 * @instance
 * @api public
 */

Query.prototype.box = function(ll, ur) {
  if (!Array.isArray(ll) && utils.isObject(ll)) {
    ur = ll.ur;
    ll = ll.ll;
  }
  return Query.base.box.call(this, ll, ur);
};

/**
 * Specifies a `$center` or `$centerSphere` condition.
 *
 * @method circle
 * @memberOf Query
 * @instance
 * @api public
 */

Query.prototype.circle = function(path, area) {
  return Query.base.circle.call(this, path, area);
};

/**
 * _DEPRECATED_ Alias for [circle](#query_Query-circle)
 *
 * @deprecated
 * @api public
 */

Query.prototype.center = Query.base.circle;

/**
 * _DEPRECATED_ Specifies a `$centerSphere` condition
 *
 * @deprecated
 * @api public
 */

Query.prototype.centerSphere = function() {
  if (arguments[0] != null && typeof arguments[0].constructor === 'function' && arguments[0].constructor.name === 'Object') {
    arguments[0].spherical = true;
  }

  if (arguments[1] != null && typeof arguments[1].constructor === 'function' && arguments[1].constructor.name === 'Object') {
    arguments[1].spherical = true;
  }

  Query.base.circle.apply(this, arguments);
};

/**
 * Determines if field selection has been made.
 *
 * @method selected
 * @memberOf Query
 * @instance
 * @api public
 */

Query.prototype.selected = function() {
  return this._fields != null;
};

/**
 * Determines if inclusive field selection has been made.
 *
 * @method selectedInclusively
 * @memberOf Query
 * @instance
 * @api public
 */

Query.prototype.selectedInclusively = function selectedInclusively() {
  return isInclusive(this._fields);
};

/**
 * Determines if exclusive field selection has been made.
 *
 * @method selectedExclusively
 * @memberOf Query
 * @instance
 * @api public
 */

Query.prototype.selectedExclusively = function selectedExclusively() {
  return isExclusive(this._fields);
};

/**
 * The model this query is associated with.
 *
 * @api public
 * @property model
 * @memberOf Query
 * @instance
 */

Query.prototype.model;

/*!
 * Export
 */

module.exports = Query;