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
 * Helper to build parameters for the `near` query.
 * @private
 */
function buildNearParams(args, sphere) {
  const params = [];
  const len = args.length;
  if (len === 1) {
    const a0 = args[0];
    if (Array.isArray(a0)) {
      params.push({ center: a0, spherical: sphere });
    } else if (typeof a0 === 'string') {
      params.push(a0);
    } else if (utils.isObject(a0)) {
      const obj = Object.assign({}, a0);
      if (typeof obj.spherical !== 'boolean') obj.spherical = sphere;
      params.push(obj);
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (len === 2) {
    const [a0, a1] = args;
    if (typeof a0 === 'string' && utils.isObject(a1)) {
      const obj = Object.assign({}, a1);
      if (typeof obj.spherical !== 'boolean') obj.spherical = sphere;
      params.push(a0, obj);
    } else if (typeof a0 === 'string' && Array.isArray(a1)) {
      params.push(a0, { center: a1, spherical: sphere });
    } else if (typeof a0 === 'number' && typeof a1 === 'number') {
      params.push({ center: [a0, a1], spherical: sphere });
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (len === 3) {
    const [a0, a1, a2] = args;
    if (typeof a0 === 'string' && typeof a1 === 'number' && typeof a2 === 'number') {
      params.push(a0, { center: [a1, a2], spherical: sphere });
    } else {
      throw new TypeError('invalid argument');
    }
  } else {
    throw new TypeError('invalid argument');
  }
  return params;
}

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
 * Specifies a javascript function or expression to pass to MongoDBs query system.
 *
 * ####Example
 *
 *     query.$where('this.comments.length === 10 || this.name.length === 5')
 *
 *     // or
 *     query.$where(function () {
 *       return this.comments.length === 10 || this.name.length === 5;
 *     })
 *
 * ####NOTE:
 *
 * Only use `$where` when you have a condition that cannot be met using other MongoDB operators like `$lt`.
 * **Be sure to read about all of its caveats** before using.
 *
 * @see $where http://docs.mongodb.org/manual/reference/operator/where/
 * @method $where
 * @param {String|Function} js javascript string or function
 * @return {Query} this
 * @memberOf Query
 * @instance
 * @method $where
 * @api public
 */

/**
 * Specifies a `path` for use with chaining.
 *
 * ####Example
 *
 *     // instead of writing:
 *     User.find({age: {$gte: 21, $lte: 65}}, callback);
 *
 *     // we can instead write:
 *     User.find().where('age').gte(21).lte(65);
 *
 *     // passing query conditions is permitted
 *     User.find().where({ name: 'vonderful' })
 *
 *     // chaining
 *     User
 *     .where('age').gte(21).lte(65)
 *     .where('name', /^vonderful/i)
 *     .where('friends').slice(10)
 *     .exec(callback)
 *
 * @method where
 * @memberOf Query
 * @instance
 * @param {String|Object} [path]
 * @param {any} [val]
 * @return {Query} this
 * @api public
 */

/**
 * Specifies a `$slice` projection for an array.
 *
 * ####Example
 *
 *     query.slice('comments', 5)
 *     query.slice('comments', -5)
 *     query.slice('comments', [10, 5])
 *     query.where('comments').slice(5)
 *     query.where('comments').slice([-10, 5])
 *
 * @method slice
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val number/range of elements to slice
 * @return {Query} this
 * @see mongodb http://www.mongodb.org/display/DOCS/Retrieving+a+Subset+of+Fields#RetrievingaSubrangeofArrayElements
 * @see $slice http://docs.mongodb.org/manual/reference/projection/slice/#prj._S_slice
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
 * ####Example
 *
 *     User.where('age').equals(49);
 *
 *     // is the same as
 *     User.where('age', 49);
 *
 * @method equals
 * @memberOf Query
 * @instance
 * @param {Object} val
 * @return {Query} this
 * @api public
 */

/**
 * Specifies arguments for an `$or` condition.
 *
 * ####Example
 *
 *     query.or([{ color: 'red' }, { status: 'emergency' }])
 *
 * @see $or http://docs.mongodb.org/manual/reference/operator/or/
 * @method or
 * @memberOf Query
 * @instance
 * @param {Array} array array of conditions
 * @return {Query} this
 * @api public
 */

/**
 * Specifies arguments for a `$nor` condition.
 *
 * ####Example
 *
 *     query.nor([{ color: 'green' }, { status: 'ok' }])
 *
 * @see $nor http://docs.mongodb.org/manual/reference/operator/nor/
 * @method nor
 * @memberOf Query
 * @instance
 * @param {Array} array array of conditions
 * @return {Query} this
 * @api public
 */

/**
 * Specifies arguments for a `$and` condition.
 *
 * ####Example
 *
 *     query.and([{ color: 'green' }, { status: 'ok' }])
 *
 * @method and
 * @memberOf Query
 * @instance
 * @see $and http://docs.mongodb.org/manual/reference/operator/and/
 * @param {Array} array array of conditions
 * @return {Query} this
 * @api public
 */

/**
 * Specifies a `$gt` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * ####Example
 *
 *     Thing.find().where('age').gt(21)
 *
 *     // or
 *     Thing.find().gt('age', 21)
 *
 * @method gt
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val
 * @see $gt http://docs.mongodb.org/manual/reference/operator/gt/
 * @api public
 */

/**
 * Specifies a `$gte` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * @method gte
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val
 * @see $gte http://docs.mongodb.org/manual/reference/operator/gt/
 * @api public
 */

/**
 * Specifies a `$lt` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * @method lt
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val
 * @see $lt http://docs.mongodb.org/manual/reference/operator/lt/
 * @api public
 */

/**
 * Specifies a `$lte` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * @method lte
 * @see $lte http://docs.mongodb.org/manual/reference/operator/lte/
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val
 * @api public
 */

/**
 * Specifies a `$ne` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * @see $ne http://docs.mongodb.org/manual/reference/operator/ne/
 * @method ne
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {any} val
 * @api public
 */

/**
 * Specifies an `$in` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * @see $in http://docs.mongodb.org/manual/reference/operator/in/
 * @method in
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Array} val
 * @api public
 */

/**
 * Specifies an `$nin` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * @see $nin http://docs.mongodb.org/manual/reference/operator/nin/
 * @method nin
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Array} val
 * @api public
 */

/**
 * Specifies an `$all` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * ####Example:
 *
 *     MyModel.find().where('pets').all(['dog', 'cat', 'ferret']);
 *     // Equivalent:
 *     MyModel.find().all('pets', [dog, cat, ferret]);
 *
 * @see $all http://docs.mongodb.org/manual/reference/operator/all/
 * @method all
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Array} val
 * @api public
 */

/**
 * Specifies a `$size` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * ####Example
 *
 *     MyModel.where('tags').size(0).exec(function (err, docs) {
 *       if (err) return handleError(err);
 *
 *       assert(Array.isArray(docs));
 *       console.log('documents with 0 tags', docs);
 *     })
 *
 * @see $size http://docs.mongodb.org/manual/reference/operator/size/
 * @method size
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val
 * @api public
 */

/**
 * Specifies a `$regex` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * @see $regex http://docs.mongodb.org/manual/reference/operator/regex/
 * @method regex
 * @memberOf Query
 * @instance
 * @param {String|RegExp} val
 * @api public
 */

/**
 * Specifies a `maxDistance` query condition.
 *
 * When called with one argument, the most recent path passed to `where()` is used.
 *
 * @see $maxDistance http://docs.mongodb.org/manual/reference/operator/maxDistance/
 * @method maxDistance
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val
 * @api public
 */

/**
 * Specifies a `$mod` condition, filters documents for documents whose
 * `path` property is a number that is equal to `remainder` modulo `divisor`.
 *
 * ####Example
 *
 *     // All find products whose inventory is odd
 *     Product.find().mod('inventory', [2, 1]);
 *     Product.find().where('inventory').mod([2, 1]);
 *     // This syntax is a little strange, but supported.
 *     Product.find().where('inventory').mod(2, 1);
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
 * Specifies an `$exists` condition
 *
 * ####Example
 *
 *     // { name: { $exists: true }}
 *     Thing.where('name').exists()
 *     Thing.where('name').exists(true)
 *     Thing.find().exists('name')
 *
 *     // { name: { $exists: false }}
 *     Thing.where('name').exists(false);
 *     Thing.find().exists('name', false);
 *
 * @method exists
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Boolean} val
 * @return {Query} this
 * @see $exists http://docs.mongodb.org/manual/reference/operator/exists/
 * @api public
 */

/**
 * Specifies an `$elemMatch` condition
 *
 * ####Example
 *
 *     query.elemMatch('comment', { author: 'autobot', votes: {$gte: 5}})
 *
 *     query.where('comment').elemMatch({ author: 'autobot', votes: {$gte: 5}})
 *
 *     query.elemMatch('comment', function (elem) {
 *       elem.where('author').equals('autobot');
 *       elem.where('votes').gte(5);
 *     })
 *
 *     query.where('comment').elemMatch(function (elem) {
 *       elem.where({ author: 'autobot' });
 *       elem.where('votes').gte(5);
 *     })
 *
 * @method elemMatch
 * @memberOf Query
 * @instance
 * @param {String|Object|Function} path
 * @param {Object|Function} filter
 * @return {Query} this
 * @see $elemMatch http://docs.mongodb.org/manual/reference/operator/elemMatch/
 * @api public
 */

/**
 * Defines a `$within` or `$geoWithin` argument for geo-spatial queries.
 *
 * ####Example
 *
 *     query.where(path).within().box()
 *     query.where(path).within().circle()
 *     query.where(path).within().geometry()
 *
 *     query.where('loc').within({ center: [50,50], radius: 10, unique: true, spherical: true });
 *     query.where('loc').within({ box: [[40.73, -73.9], [40.7, -73.988]] });
 *     query.where('loc').within({ polygon: [[],[],[],[]] });
 *
 *     query.where('loc').within([], [], []) // polygon
 *     query.where('loc').within([], []) // box
 *     query.where('loc').within({ type: 'LineString', coordinates: [...] }); // geometry
 *
 * **MUST** be used after `where()`.
 *
 * ####NOTE:
 *
 * As of Mongoose 3.7, `$geoWithin` is always used for queries. To change this behavior, see [Query.use$geoWithin](#query_Query-use%2524geoWithin).
 *
 * ####NOTE:
 *
 * In Mongoose 3.7, `within` changed from a getter to a function. If you need the old syntax, use [this](https://github.com/ebensing/mongoose-within).
 *
 * @method within
 * @see $polygon http://docs.mongodb.org/manual/reference/operator/polygon/
 * @see $box http://docs.mongodb.org/manual/reference/operator/box/
 * @see $geometry http://docs.mongodb.org/manual/reference/operator/geometry/
 * @see $center http://docs.mongodb.org/manual/reference/operator/center/
 * @see $centerSphere http://docs.mongodb.org/manual/reference/operator/centerSphere/
 * @memberOf Query
 * @instance
 * @return {Query} this
 * @api public
 */

/**
 * Specifies this query as a `count` query.
 *
 * This method is deprecated. If you want to count the number of documents in
 * a collection, e.g. `count({})`, use the [`estimatedDocumentCount()` function](/docs/api.html#query_Query-estimatedDocumentCount)
 * instead. Otherwise, use the [`countDocuments()`](/docs/api.html#query_Query-countDocuments) function instead.
 *
 * Passing a `callback` executes the query.
 *
 * This function triggers the following middleware.
 *
 * - `count()`
 *
 * @deprecated
 * @param {Object} [filter] count documents that match this object
 * @param {Function} [callback] optional params are (error, count)
 * @return {Query} this
 * @see count http://docs.mongodb.org/manual/reference/method/db.collection.count/
 * @api public
 */

Query.prototype.count = function(filter, callback) {
  this.op = 'count';
  if (typeof filter === 'function') {
    callback = filter;
    filter = undefined;
  }

  filter = utils.toObject(filter);

  if (mquery.canMerge(filter)) {
    this.merge(filter);
  }

  if (!callback) {
    return this;
  }

  this.exec(callback);

  return this;
};

/**
 * Specifies this query as a `estimatedDocumentCount()` query. Faster than
 * using `countDocuments()` for large collections because
 * `estimatedDocumentCount()` uses collection metadata rather than scanning
 * the entire collection.
 *
 * `estimatedDocumentCount()` does **not** accept a filter. `Model.find({ foo: bar }).estimatedDocumentCount()`
 * is equivalent to `Model.find().estimatedDocumentCount()`
 *
 * This function triggers the following middleware.
 *
 * - `estimatedDocumentCount()`
 *
 * @param {Object} [options] passed transparently to the [MongoDB driver](http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#estimatedDocumentCount)
 * @param {Function} [callback] optional params are (error, count)
 * @return {Query} this
 * @see estimatedDocumentCount http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#estimatedDocumentCount
 * @api public
 */

Query.prototype.estimatedDocumentCount = function(options, callback) {
  this.op = 'estimatedDocumentCount';
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  if (typeof options === 'object' && options != null) {
    this.setOptions(options);
  }

  if (!callback) {
    return this;
  }

  this.exec(callback);

  return this;
};

/**
 * Specifies this query as a `countDocuments()` query. Behaves like `count()`,
 * except it always does a full collection scan when passed an empty filter `{}`.
 *
 * There are also minor differences in how `countDocuments()` handles
 * [`$where` and a couple geospatial operators](http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#countDocuments).
 * versus `count()`.
 *
 * Passing a `callback` executes the query.
 *
 * This function triggers the following middleware.
 *
 * - `countDocuments()`
 *
 * @param {Object} [filter] mongodb selector
 * @param {Function} [callback] optional params are (error, count)
 * @return {Query} this
 * @see countDocuments http://docs.mongodb.org/manual/reference/method/db.collection.countDocuments/
 * @api public
 */

Query.prototype.countDocuments = function(conditions, callback) {
  this.op = 'countDocuments';
  if (typeof conditions === 'function') {
    callback = conditions;
    conditions = undefined;
  }

  conditions = utils.toObject(conditions);

  if (mquery.canMerge(conditions)) {
    this.merge(conditions);
  }

  if (!callback) {
    return this;
  }

  this.exec(callback);

  return this;
};

/**
 * Thunk around distinct()
 *
 * @param {Function} [callback]
 * @see distinct http://docs.mongodb.org/manual/reference/method/db.collection.distinct/
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

  // don't pass in the conditions because we already merged them in
  this._collection.collection.
    distinct(this._distinct, this._conditions, options, callback);
});

/**
 * Declares or executes a distinct() operation.
 *
 * Passing a `callback` executes the query.
 *
 * This function does not trigger any middleware.
 *
 * @param {String} [field]
 * @param {Object|Query} [filter]
 * @param {Function} [callback] optional params are (error, arr)
 * @return {Query} this
 * @see distinct http://docs.mongodb.org/manual/reference/method/db.collection.distinct/
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
 * If an object is passed, values allowed are `asc`, `desc`, `ascending`, `descending`, `1`, and `-1`.
 *
 * If a string is passed, it must be a space delimited list of path names. The
 * sort order of each path is ascending unless the path name is prefixed with `-`
 * which will be treated as descending.
 *
 * @param {Object|String} arg
 * @return {Query} this
 * @see cursor.sort http://docs.mongodb.org/manual/reference/method/cursor.sort/
 * @api public
 */

Query.prototype.sort = function(arg) {
  if (arguments.length > 1) {
    throw new Error('sort() only takes 1 Argument');
  }

  return Query.base.sort.call(this, arg);
};

/**
 * Declares and/or execute this query as a remove() operation. `remove()` is
 * deprecated, you should use [`deleteOne()`](#query_Query-deleteOne)
 * or [`deleteMany()`](#query_Query-deleteMany) instead.
 *
 * This function does not trigger any middleware
 *
 * @param {Object|Query} [filter] mongodb selector
 * @param {Function} [callback] optional params are (error, mongooseDeleteResult)
 * @return {Query} this
 * @deprecated
 * @see deleteWriteOpResult http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#~deleteWriteOpResult
 * @see MongoDB driver remove http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#remove
 * @api public
 */

Query.prototype.remove = function(filter, callback) {
  this.op = 'remove';
  if (typeof filter === 'function') {
    callback = filter;
    filter = null;
  }

  filter = utils.toObject(filter);

  if (mquery.canMerge(filter)) {
    this.merge(filter);

    prepareDiscriminatorCriteria(this);
  } else if (filter != null) {
    this.error(new ObjectParameterError(filter, 'filter', 'remove'));
  }

  if (!callback) {
    return Query.base.remove.call(this);
  }

  this.exec(callback);
  return this;
};

/*!
 * ignore
 */

Query.prototype._remove = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return this;
  }

  callback = _wrapThunkCallback(this, callback);

  return Query.base.remove.call(this, helpers.handleDeleteWriteOpResult(callback));
});

/**
 * Declare and/or execute this query as a `deleteOne()` operation. Works like
 * remove, except it deletes at most one document regardless of the `single`
 * option.
 *
 * This function triggers `deleteOne` middleware.
 *
 * @param {Object|Query} [filter] mongodb selector
 * @param {Object} [options] optional see [`Query.prototype.setOptions()`](http://mongoosejs.com/docs/api.html#query_Query-setOptions)
 * @param {Function} [callback] optional params are (error, mongooseDeleteResult)
 * @return {Query} this
 * @see deleteWriteOpResult http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#~deleteWriteOpResult
 * @see MongoDB Driver deleteOne http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#deleteOne
 * @api public
 */

Query.prototype.deleteOne = function(filter, options, callback) {
  this.op = 'deleteOne';
  if (typeof filter === 'function') {
    callback = filter;
    filter = null;
    options = null;
  } else if (typeof options === 'function') {
    callback = options;
    options = null;
  } else {
    this.setOptions(options);
  }

  filter = utils.toObject(filter);

  if (mquery.canMerge(filter)) {
    this.merge(filter);

    prepareDiscriminatorCriteria(this);
  } else if (filter != null) {
    this.error(new ObjectParameterError(filter, 'filter', 'deleteOne'));
  }

  if (!callback) {
    return Query.base.deleteOne.call(this);
  }

  this.exec.call(this, callback);

  return this;
};

/*!
 * Internal thunk for `deleteOne()`
 */

Query.prototype._deleteOne = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return this;
  }

  callback = _wrapThunkCallback(this, callback);

  return Query.base.deleteOne.call(this, helpers.handleDeleteWriteOpResult(callback));
});

/**
 * Declare and/or execute this query as a `deleteMany()` operation. Works like
 * remove, except it deletes _every_ document that matches `filter` in the
 * collection, regardless of the value of `single`.
 *
 * This function triggers `deleteMany` middleware.
 *
 * @param {Object|Query} [filter] mongodb selector
 * @param {Object} [options] optional see [`Query.prototype.setOptions()`](http://mongoosejs.com/docs/api.html#query_Query-setOptions)
 * @param {Function} [callback] optional params are (error, mongooseDeleteResult)
 * @return {Query} this
 * @see deleteWriteOpResult http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#~deleteWriteOpResult
 * @see MongoDB Driver deleteMany http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#deleteMany
 * @api public
 */

Query.prototype.deleteMany = function(filter, options, callback) {
  this.op = 'deleteMany';
  if (typeof filter === 'function') {
    callback = filter;
    filter = null;
    options = null;
  } else if (typeof options === 'function') {
    callback = options;
    options = null;
  } else {
    this.setOptions(options);
  }

  filter = utils.toObject(filter);

  if (mquery.canMerge(filter)) {
    this.merge(filter);

    prepareDiscriminatorCriteria(this);
  } else if (filter != null) {
    this.error(new ObjectParameterError(filter, 'filter', 'deleteMany'));
  }

  if (!callback) {
    return Query.base.deleteMany.call(this);
  }

  this.exec.call(this, callback);

  return this;
};

/*!
 * Internal thunk around `deleteMany()`
 */

Query.prototype._deleteMany = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return this;
  }

  callback = _wrapThunkCallback(this, callback);

  return Query.base.deleteMany.call(this, helpers.handleDeleteWriteOpResult(callback));
});

/*!
 * hydrates a document
 *
 * @param {Model} model
 * @param {Document} doc
 * @param {Object} res 3rd parameter to callback
 * @param {Object} fields
 * @param {Query} self
 * @param {Array} [pop] array of paths used in population
 * @param {Function} callback
 */

function completeOne(model, doc, res, options, fields, userProvidedFields, pop, callback) {
  const opts = pop ?
    { populated: pop }
    : undefined;

  if (options.rawResult && doc == null) {
    _init(null);
    return null;
  }

  const casted = helpers.createModel(model, doc, fields, userProvidedFields, options);
  try {
    casted.init(doc, opts, _init);
  } catch (error) {
    _init(error);
  }

  function _init(err) {
    if (err) {
      return immediate(() => callback(err));
    }


    if (options.rawResult) {
      if (doc && casted) {
        if (options.session != null) {
          casted.$session(options.session);
        }
        res.value = casted;
      } else {
        res.value = null;
      }
      return immediate(() => callback(null, res));
    }
    if (options.session != null) {
      casted.$session(options.session);
    }
    immediate(() => callback(null, casted));
  }
}

/*!
 * If the model is a discriminator type and not root, then add the key & value to the criteria.
 */

function prepareDiscriminatorCriteria(query) {
  if (!query || !query.model || !query.model.schema) {
    return;
  }

  const schema = query.model.schema;

  if (schema && schema.discriminatorMapping && !schema.discriminatorMapping.isRoot) {
    query._conditions[schema.discriminatorMapping.key] = schema.discriminatorMapping.value;
  }
}

/**
 * Issues a mongodb [findAndModify](http://www.mongodb.org/display/DOCS/findAndModify+Command) update command.
 *
 * Finds a matching document, updates it according to the `update` arg, passing any `options`, and returns the found
 * document (if any) to the callback. The query executes if
 * `callback` is passed.
 *
 * This function triggers the following middleware.
 *
 * - `findOneAndUpdate()`
 *
 * @param {Object|Query} [filter]
 * @param {Object} [doc]
 * @param {Object} [options]
 * @param {Boolean} [options.rawResult] if true, returns the [raw result from the MongoDB driver](http://mongodb.github.io/node-mongodb-native/2.0/api/Collection.html#findAndModify)
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {ClientSession} [options.session=null] The session associated with this query. See [transactions docs](/docs/transactions.html).
 * @param {Boolean|String} [options.multipleCastError] by default, mongoose only returns the first error that occurred in casting the query. Turn on this option to aggregate all the cast errors.
 * @param {Boolean} [options.new=false] By default, `findOneAndUpdate()` returns the document as it was **before** `update` was applied. If you set `new: true`, `findOneAndUpdate()` will instead give you the object after `update` was applied.
 * @param {Object} [options.lean] if truthy, mongoose will return the document as a plain JavaScript object rather than a mongoose document. See [`Query.lean()`](/docs/api.html#query_Query-lean) and [the Mongoose lean tutorial](/docs/tutorials/lean.html).
 * @param {ClientSession} [options.session=null] The session associated with this query. See [transactions docs](/docs/transactions.html).
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {Boolean} [options.omitUndefined=false] If true, delete any properties whose value is `undefined` when casting an update. In other words, if this is set, Mongoose will delete `baz` from the update in `Model.updateOne({}, { foo: 'bar', baz: undefined })` before sending the update to the server.
 * @param {Boolean} [options.timestamps=null] If set to `false` and [schema-level timestamps](/docs/guide.html#timestamps) are enabled, skip timestamps for this update. Note that this allows you to overwrite timestamps. Does nothing if schema-level timestamps are not set.
 * @param {Boolean} [options.returnOriginal=null] An alias for the `new` option. `returnOriginal: false` is equivalent to `new: true`.
 * @param {Function} [callback] optional params are (error, doc), _unless_ `rawResult` is used, in which case params are (error, writeOpResult)
 * @see Tutorial /docs/tutorials/findoneandupdate.html
 * @see mongodb http://www.mongodb.org/display/DOCS/findAndModify+Command
 * @see writeOpResult http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#~WriteOpResult
 * @return {Query} this
 * @api public
 */

Query.prototype.findOneAndUpdate = function(criteria, doc, options, callback) {
  this.op = 'findOneAndUpdate';
  this._validate();

  switch (arguments.length) {
    case 3:
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      break;
    case 2:
      if (typeof doc === 'function') {
        callback = doc;
        doc = criteria;
        criteria = undefined;
      }
      options = undefined;
      break;
    case 1:
      if (typeof criteria === 'function') {
        callback = criteria;
        criteria = options = doc = undefined;
      } else {
        doc = criteria;
        criteria = options = undefined;
      }
  }

  if (mquery.canMerge(criteria)) {
    this.merge(criteria);
  }

  // apply doc
  if (doc) {
    this._mergeUpdate(doc);
  }

  options = options ? utils.clone(options) : {};

  if (options.projection) {
    this.select(options.projection);
    delete options.projection;
  }
  if (options.fields) {
    this.select(options.fields);
    delete options.fields;
  }


  const returnOriginal = get(this, 'model.base.options.returnOriginal');
  if (options.new == null && options.returnDocument == null && options.returnOriginal == null && returnOriginal != null) {
    options.returnOriginal = returnOriginal;
  }

  this.setOptions(options);

  if (!callback) {
    return this;
  }

  this.exec(callback);

  return this;
};

/*!
 * Thunk around findOneAndUpdate()
 *
 * @param {Function} [callback]
 * @api private
 */

Query.prototype._findOneAndUpdate = wrapThunk(function(callback) {
  if (this.error() != null) {
    return callback(this.error());
  }

  this._findAndModify('update', callback);
});

/**
 * Issues a mongodb [findAndModify](http://www.mongodb.org/display/DOCS/findAndModify+Command) remove command.
 *
 * Finds a matching document, removes it, passing the found document (if any) to
 * the callback. Executes if `callback` is passed.
 *
 * This function triggers the following middleware.
 *
 * - `findOneAndRemove()`
 *
 * @param {Object} [conditions]
 * @param {Object} [options]
 * @param {Boolean} [options.rawResult] if true, returns the [raw result from the MongoDB driver](http://mongodb.github.io/node-mongodb-native/2.0/api/Collection.html#findAndModify)
 * @param {ClientSession} [options.session=null] The session associated with this query. See [transactions docs](/docs/transactions.html).
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {Function} [callback] optional params are (error, doc)
 * @return {Query} this
 * @see mongodb http://www.mongodb.org/display/DOCS/findAndModify+Command
 * @api public
 */

Query.prototype.findOneAndRemove = function(conditions, options, callback) {
  this.op = 'findOneAndRemove';
  this._validate();

  switch (arguments.length) {
    case 2:
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      break;
    case 1:
      if (typeof conditions === 'function') {
        callback = conditions;
        conditions = undefined;
        options = undefined;
      }
      break;
  }

  if (mquery.canMerge(conditions)) {
    this.merge(conditions);
  }

  options && this.setOptions(options);

  if (!callback) {
    return this;
  }

  this.exec(callback);

  return this;
};

/**
 * Issues a MongoDB [findOneAndDelete](https://docs.mongodb.com/manual/reference/method/db.collection.findOneAndDelete/) command.
 *
 * Finds a matching document, removes it, and passes the found document (if any)
 * to the callback. Executes if `callback` is passed.
 *
 * This function triggers the following middleware.
 *
 * - `findOneAndDelete()`
 *
 * @param {Object} [conditions]
 * @param {Object} [options]
 * @param {Boolean} [options.rawResult] if true, returns the [raw result from the MongoDB driver](http://mongodb.github.io/node-mongodb-native/2.0/api/Collection.html#findAndModify)
 * @param {ClientSession} [options.session=null] The session associated with this query. See [transactions docs](/docs/transactions.html).
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {Function} [callback] optional params are (error, doc)
 * @return {Query} this
 * @see mongodb http://www.mongodb.org/display/DOCS/findAndModify+Command
 * @api public
 */

Query.prototype.findOneAndDelete = function(conditions, options, callback) {
  this.op = 'findOneAndDelete';
  this._validate();

  switch (arguments.length) {
    case 2:
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      break;
    case 1:
      if (typeof conditions === 'function') {
        callback = conditions;
        conditions = undefined;
        options = undefined;
      }
      break;
  }

  if (mquery.canMerge(conditions)) {
    this.merge(conditions);
  }

  options && this.setOptions(options);

  if (!callback) {
    return this;
  }

  this.exec(callback);

  return this;
};

/*!
 * Thunk around findOneAndDelete()
 *
 * @param {Function} [callback]
 * @return {Query} this
 * @api private
 */
Query.prototype._findOneAndDelete = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return null;
  }

  const filter = this._conditions;
  const options = this._optionsForExec();
  let fields = null;

  if (this._fields != null) {
    options.projection = this._castFields(utils.clone(this._fields));
    fields = options.projection;
    if (fields instanceof Error) {
      callback(fields);
      return null;
    }
  }

  this._collection.collection.findOneAndDelete(filter, options, _wrapThunkCallback(this, (err, res) => {
    if (err) {
      return callback(err);
    }

    const doc = res.value;

    return this._completeOne(doc, res, callback);
  }));
});

/**
 * Issues a MongoDB [findOneAndReplace](https://docs.mongodb.com/manual/reference/method/db.collection.findOneAndReplace/) command.
 *
 * Finds a matching document, removes it, and passes the found document (if any)
 * to the callback. Executes if `callback` is passed.
 *
 * This function triggers the following middleware.
 *
 * - `findOneAndReplace()`
 *
 * @method findOneAndReplace
 * @memberOf Query
 * @instance
 * @param {Object} [filter]
 * @param {Object} [replacement]
 * @param {Object} [options]
 * @param {Boolean} [options.rawResult] if true, returns the [raw result from the MongoDB driver](http://mongodb.github.io/node-mongodb-native/2.0/api/Collection.html#findAndModify)
 * @param {ClientSession} [options.session=null] The session associated with this query. See [transactions docs](/docs/transactions.html).
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {Boolean} [options.new=false] By default, `findOneAndUpdate()` returns the document as it was **before** `update` was applied. If you set `new: true`, `findOneAndUpdate()` will instead give you the object after `update` was applied.
 * @param {Object} [options.lean] if truthy, mongoose will return the document as a plain JavaScript object rather than a mongoose document. See [`Query.lean()`](/docs/api.html#query_Query-lean) and [the Mongoose lean tutorial](/docs/tutorials/lean.html).
 * @param {ClientSession} [options.session=null] The session associated with this query. See [transactions docs](/docs/transactions.html).
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {Boolean} [options.omitUndefined=false] If true, delete any properties whose value is `undefined` when casting an update. In other words, if this is set, Mongoose will delete `baz` from the update in `Model.updateOne({}, { foo: 'bar', baz: undefined })` before sending the update to the server.
 * @param {Boolean} [options.timestamps=null] If set to `false` and [schema-level timestamps](/docs/guide.html#timestamps) are enabled, skip timestamps for this update. Note that this allows you to overwrite timestamps. Does nothing if schema-level timestamps are not set.
 * @param {Boolean} [options.returnOriginal=null] An alias for the `new` option. `returnOriginal: false` is equivalent to `new: true`.
 * @param {Function} [callback] optional params are (error, document)
 * @return {Query} this
 * @api public
 */

Query.prototype.findOneAndReplace = function(filter, replacement, options, callback) {
  this.op = 'findOneAndReplace';
  this._validate();

  switch (arguments.length) {
    case 3:
      if (typeof options === 'function') {
        callback = options;
        options = void 0;
      }
      break;
    case 2:
      if (typeof replacement === 'function') {
        callback = replacement;
        replacement = void 0;
      }
      break;
    case 1:
      if (typeof filter === 'function') {
        callback = filter;
        filter = void 0;
        replacement = void 0;
        options = void 0;
      }
      break;
  }

  if (mquery.canMerge(filter)) {
    this.merge(filter);
  }

  if (replacement != null) {
    if (hasDollarKeys(replacement)) {
      throw new Error('The replacement document must not contain atomic operators.');
    }
    this._mergeUpdate(replacement);
  }

  options = options || {};

  const returnOriginal = get(this, 'model.base.options.returnOriginal');
  if (options.new == null && options.returnDocument == null && options.returnOriginal == null && returnOriginal != null) {
    options.returnOriginal = returnOriginal;
  }
  this.setOptions(options);
  this.setOptions({ overwrite: true });

  if (!callback) {
    return this;
  }

  this.exec(callback);

  return this;
};

/*!
 * Thunk around findOneAndReplace()
 *
 * @param {Function} [callback]
 * @return {Query} this
 * @api private
 */
Query.prototype._findOneAndReplace = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return null;
  }

  const filter = this._conditions;
  const options = this._optionsForExec();
  convertNewToReturnDocument(options);
  let fields = null;

  let castedDoc = new this.model(this._update, null, true);
  this._update = castedDoc;

  this._applyPaths();
  if (this._fields != null) {
    options.projection = this._castFields(utils.clone(this._fields));
    fields = options.projection;
    if (fields instanceof Error) {
      callback(fields);
      return null;
    }
  }

  castedDoc.validate(err => {
    if (err != null) {
      return callback(err);
    }

    if (castedDoc.toBSON) {
      castedDoc = castedDoc.toBSON();
    }

    this._collection.collection.findOneAndReplace(filter, castedDoc, options, _wrapThunkCallback(this, (err, res) => {
      if (err) {
        return callback(err);
      }

      const doc = res.value;

      return this._completeOne(doc, res, callback);
    }));
  });
});

/*!
 * Support the `new` option as an alternative to `returnOriginal` for backwards
 * compat.
 */

function convertNewToReturnDocument(options) {
  if ('new' in options) {
    options.returnDocument = options['new'] ? 'after' : 'before';
    delete options['new'];
  }
  if ('returnOriginal' in options) {
    options.returnDocument = options['returnOriginal'] ? 'before' : 'after';
    delete options['returnOriginal'];
  }
}

/*!
 * Thunk around findOneAndRemove()
 *
 * @param {Function} [callback]
 * @return {Query} this
 * @api private
 */
Query.prototype._findOneAndRemove = wrapThunk(function(callback) {
  if (this.error() != null) {
    callback(this.error());
    return;
  }

  this._findAndModify('remove', callback);
});

/*!
 * Get options from query opts, falling back to the base mongoose object.
 */

function _getOption(query, option, def) {
  const opts = query._optionsForExec(query.model);

  if (option in opts) {
    return opts[option];
  }
  if (option in query.model.base.options) {
    return query.model.base.options[option];
  }
  return def;
}

/*!
 * Override mquery.prototype._findAndModify to provide casting etc.
 *
 * @param {String} type - either "remove" or "update"
 * @param {Function} callback
 * @api private
 */

Query.prototype._findAndModify = function(type, callback) {
  if (typeof callback !== 'function') {
    throw new Error('Expected callback in _findAndModify');
  }

  const model = this.model;
  const schema = model.schema;
  const _this = this;
  let fields;

  const castedQuery = castQuery(this);
  if (castedQuery instanceof Error) {
    return callback(castedQuery);
  }

  _castArrayFilters(this);

  const opts = this._optionsForExec(model);

  if ('strict' in opts) {
    this._mongooseOptions.strict = opts.strict;
  }

  const isOverwriting = this.options.overwrite && !hasDollarKeys(this._update);
  if (isOverwriting) {
    this._update = new this.model(this._update, null, true);
  }

  if (type === 'remove') {
    opts.remove = true;
  } else {
    if (!('new' in opts) && !('returnOriginal' in opts) && !('returnDocument' in opts)) {
      opts.new = false;
    }
    if (!('upsert' in opts)) {
      opts.upsert = false;
    }
    if (opts.upsert || opts['new']) {
      opts.remove = false;
    }

    if (!isOverwriting) {
      this._update = castDoc(this, opts.overwrite);
      const _opts = Object.assign({}, opts, {
        setDefaultsOnInsert: this._mongooseOptions.setDefaultsOnInsert
      });
      this._update = setDefaultsOnInsert(this._conditions, schema, this._update, _opts);
      if (!this._update || Object.keys(this._update).length === 0) {
        if (opts.upsert) {
          // still need to do the upsert to empty doc
          const doc = utils.clone(castedQuery);
          delete doc._id;
          this._update = { $set: doc };
        } else {
          this.findOne(callback);
          return this;
        }
      } else if (this._update instanceof Error) {
        return callback(this._update);
      } else {
        // In order to make MongoDB 2.6 happy (see
        // https://jira.mongodb.org/browse/SERVER-12266 and related issues)
        // if we have an actual update document but $set is empty, junk the $set.
        if (this._update.$set && Object.keys(this._update.$set).length === 0) {
          delete this._update.$set;
        }
      }
    }

    if (Array.isArray(opts.arrayFilters)) {
      opts.arrayFilters = removeUnusedArrayFilters(this._update, opts.arrayFilters);
    }
  }

  this._applyPaths();

  const options = this._mongooseOptions;

  if (this._fields) {
    fields = utils.clone(this._fields);
    opts.projection = this._castFields(fields);
    if (opts.projection instanceof Error) {
      return callback(opts.projection);
    }
  }

  if (opts.sort) convertSortToArray(opts);

  const cb = function(err, doc, res) {
    if (err) {
      return callback(err);
    }

    _this._completeOne(doc, res, callback);
  };

  let useFindAndModify = true;
  const runValidators = _getOption(this, 'runValidators', false);
  const base = _this.model && _this.model.base;
  const conn = get(model, 'collection.conn', {});
  if ('useFindAndModify' in base.options) {
    useFindAndModify = base.get('useFindAndModify');
  }
  if ('useFindAndModify' in conn.config) {
    useFindAndModify = conn.config.useFindAndModify;
  }
  if ('useFindAndModify' in options) {
    useFindAndModify = options.useFindAndModify;
  }
  if (useFindAndModify === false) {
    // Bypass mquery
    const collection = _this._collection.collection;
    convertNewToReturnDocument(opts);

    if (type === 'remove') {
      collection.findOneAndDelete(castedQuery, opts, _wrapThunkCallback(_this, function(error, res) {
        return cb(error, res ? res.value : res, res);
      }));

      return this;
    }

    // honors legacy overwrite option for backward compatibility
    const updateMethod = isOverwriting ? 'findOneAndReplace' : 'findOneAndUpdate';

    if (runValidators) {
      this.validate(this._update, opts, isOverwriting, error => {
        if (error) {
          return callback(error);
        }
        if (this._update && this._update.toBSON) {
          this._update = this._update.toBSON();
        }

        collection[updateMethod](castedQuery, this._update, opts, _wrapThunkCallback(_this, function(error, res) {
          return cb(error, res ? res.value : res, res);
        }));
      });
    } else {
      if (this._update && this._update.toBSON) {
        this._update = this._update.toBSON();
      }
      collection[updateMethod](castedQuery, this._update, opts, _wrapThunkCallback(_this, function(error, res) {
        return cb(error, res ? res.value : res, res);
      }));
    }

    return this;
  }

  if (runValidators) {
    this.validate(this._update, opts, isOverwriting, function(error) {
      if (error) {
        return callback(error);
      }
      _legacyFindAndModify.call(_this, castedQuery, _this._update, opts, cb);
    });
  } else {
    _legacyFindAndModify.call(_this, castedQuery, _this._update, opts, cb);
  }

  return this;
};

/*!
 * ignore
 */

function _completeOneLean(doc, res, opts, callback) {
  if (opts.rawResult) {
    return callback(null, res);
  }
  return callback(null, doc);
}


/*!
 * ignore
 */

const _legacyFindAndModify = util.deprecate(function(filter, update, opts, cb) {
  if (update && update.toBSON) {
    update = update.toBSON();
  }
  const collection = this._collection;
  const sort = opts != null && Array.isArray(opts.sort) ? opts.sort : [];
  const _cb = _wrapThunkCallback(this, function(error, res) {
    return cb(error, res ? res.value : res, res);
  });
  collection.collection._findAndModify(filter, sort, update, opts, _cb);
}, 'Mongoose: `findOneAndUpdate()` and `findOneAndDelete()` without the ' +
  '`useFindAndModify` option set to false are deprecated. See: ' +
  'https://mongoosejs.com/docs/5.x/docs/deprecations.html#findandmodify');

/*!
 * Override mquery.prototype._mergeUpdate to handle mongoose objects in
 * updates.
 *
 * @param {Object} doc
 * @api private
 */

Query.prototype._mergeUpdate = function(doc) {
  if (doc == null || (typeof doc === 'object' && Object.keys(doc).length === 0)) {
    return;
  }

  if (!this._update) {
    this._update = Array.isArray(doc) ? [] : {};
  }
  if (doc instanceof Query) {
    if (Array.isArray(this._update)) {
      throw new Error('Cannot mix array and object updates');
    }
    if (doc._update) {
      utils.mergeClone(this._update, doc._update);
    }
  } else if (Array.isArray(doc)) {
    if (!Array.isArray(this._update)) {
      throw new Error('Cannot mix array and object updates');
    }
    this._update = this._update.concat(doc);
  } else {
    if (Array.isArray(this._update)) {
      throw new Error('Cannot mix array and object updates');
    }
    utils.mergeClone(this._update, doc);
  }
};

/*!
 * The mongodb driver 1.3.23 only supports the nested array sort
 * syntax. We must convert it or sorting findAndModify will not work.
 */

function convertSortToArray(opts) {
  if (Array.isArray(opts.sort)) {
    return;
  }
  if (!utils.isObject(opts.sort)) {
    return;
  }

  const sort = [];

  for (const key in opts.sort) {
    if (utils.object.hasOwnProperty(opts.sort, key)) {
      sort.push([key, opts.sort[key]]);
    }
  }

  opts.sort = sort;
}

/*!
 * ignore
 */

function _updateThunk(op, callback) {
  this._castConditions();

  _castArrayFilters(this);

  if (this.error() != null) {
    callback(this.error());
    return null;
  }

  callback = _wrapThunkCallback(this, callback);
  const oldCb = callback;
  callback = function(error, result) {
    oldCb(error, result ? result.result : { ok: 0, n: 0, nModified: 0 });
  };

  const castedQuery = this._conditions;
  const options = this._optionsForExec(this.model);

  ++this._executionCount;

  this._update = utils.clone(this._update, options);
  const isOverwriting = this.options.overwrite && !hasDollarKeys(this._update);
  if (isOverwriting) {
    if (op === 'updateOne' || op === 'updateMany') {
      return callback(new MongooseError('The MongoDB server disallows ' +
        'overwriting documents using `' + op + '`. See: ' +
        'https://mongoosejs.com/docs/deprecations.html#update'));
    }
    this._update = new this.model(this._update, null, true);
  } else {
    this._update = castDoc(this, options.overwrite);

    if (this._update instanceof Error) {
      callback(this._update);
      return null;
    }

    if (this._update == null || Object.keys(this._update).length === 0) {
      callback(null, 0);
      return null;
    }

    const _opts = Object.assign({}, options, {
      setDefaultsOnInsert: this._mongooseOptions.setDefaultsOnInsert
    });
    this._update = setDefaultsOnInsert(this._conditions, this.model.schema,
      this._update, _opts);
  }

  if (Array.isArray(options.arrayFilters)) {
    options.arrayFilters = removeUnusedArrayFilters(this._update, options.arrayFilters);
  }

  const runValidators = _getOption(this, 'runValidators', false);
  if (runValidators) {
    this.validate(this._update, options, isOverwriting, err => {
      if (err) {
        return callback(err);
      }

      if (this._update.toBSON) {
        this._update = this._update.toBSON();
      }
      this._collection[op](castedQuery, this._update, options, callback);
    });
    return null;
  }

  if (this._update.toBSON) {
    this._update = this._update.toBSON();
  }

  this._collection[op](castedQuery, this._update, options, callback);
  return null;
}

/*!
 * Mongoose calls this function internally to validate the query if
 * `runValidators` is set
 *
 * @param {Object} castedDoc the update, after casting
 * @param {Object} options the options from `_optionsForExec()`
 * @param {Function} callback
 * @api private
 */

Query.prototype.validate = function validate(castedDoc, options, isOverwriting, callback) {
  return promiseOrCallback(callback, cb => {
    try {
      if (isOverwriting) {
        castedDoc.validate(cb);
      } else {
        updateValidators(this, this.model.schema, castedDoc, options, cb);
      }
    } catch (err) {
      immediate(function() {
        cb(err);
      });
    }
  });
};

/*!
 * Internal thunk for .update()
 *
 * @param {Function} callback
 * @see Model.update #model_Model.update
 * @api private
 */
Query.prototype._execUpdate = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'update', callback);
});

/*!
 * Internal thunk for .updateMany()
 *
 * @param {Function} callback
 * @see Model.update #model_Model.update
 * @api private
 */
Query.prototype._updateMany = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'updateMany', callback);
});

/*!
 * Internal thunk for .updateOne()
 *
 * @param {Function} callback
 * @see Model.update #model_Model.update
 * @api private
 */
Query.prototype._updateOne = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'updateOne', callback);
});

/*!
 * Internal thunk for .replaceOne()
 *
 * @param {Function} callback
 * @see Model.replaceOne #model_Model.replaceOne
 * @api private
 */
Query.prototype._replaceOne = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'replaceOne', callback);
});

/**
 * Declare and/or execute this query as an update() operation.
 *
 * _All paths passed that are not [atomic](https://docs.mongodb.com/manual/tutorial/model-data-for-atomic-operations/#pattern) operations will become `$set` ops._
 *
 * This function triggers the following middleware.
 *
 * - `update()`
 *
 * @param {Object} [filter]
 * @param {Object} [doc] the update command
 * @param {Object} [options]
 * @param {Boolean} [options.multipleCastError] by default, mongoose only returns the first error that occurred in casting the query. Turn on this option to aggregate all the cast errors.
 * @param {Boolean} [options.omitUndefined=false] If true, delete any properties whose value is `undefined` when casting an update. In other words, if this is set, Mongoose will delete `baz` from the update in `Model.updateOne({}, { foo: 'bar', baz: undefined })` before sending the update to the server.
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {Boolean} [options.upsert=false] if true, and no documents found, insert a new document
 * @param {Object} [options.writeConcern=null] sets the [write concern](https://docs.mongodb.com/manual/reference/write-concern/) for replica sets. Overrides the [schema-level write concern](/docs/guide.html#writeConcern)
 * @param {Boolean} [options.timestamps=null] If set to `false` and [schema-level timestamps](/docs/guide.html#timestamps) are enabled, skip timestamps for this update. Does nothing if schema-level timestamps are not set.
 * @param {Function} [callback] params are (error, writeOpResult)
 * @return {Query} this
 * @see Model.update #model_Model.update
 * @see Query docs https://mongoosejs.com/docs/queries.html
 * @see update http://docs.mongodb.org/manual/reference/method/db.collection.update/
 * @see writeOpResult http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#~WriteOpResult
 * @see MongoDB docs https://mongodb.com/docs/reference/command/update/#update-command-output
 * @api public
 */

Query.prototype.update = function(conditions, doc, options, callback) {
  if (typeof options === 'function') {
    // .update(conditions, doc, callback)
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    // .update(doc, callback);
    callback = doc;
    doc = conditions;
    conditions = {};
    options = null;
  } else if (typeof conditions === 'function') {
    // .update(callback)
    callback = conditions;
    conditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof conditions === 'object' && !doc && !options && !callback) {
    // .update(doc)
    doc = conditions;
    conditions = undefined;
    options = undefined;
    callback = undefined;
  }

  return _update(this, 'update', conditions, doc, options, callback);
};

/**
 * Declare and/or execute this query as a `updateMany()` operation. Same as
 * `update()`, except MongoDB will update _all_ documents that match
 * `filter` in the collection, regardless of the value of `single`.
 *
 * @param {Object} [filter]
 * @param {Object|Array} [update] the update command
 * @param {Object} [options]
 * @param {Boolean} [options.multipleCastError] by default, mongoose only returns the first error that occurred in casting the query. Turn on this option to aggregate all the cast errors.
 * @param {Boolean} [options.omitUndefined=false] If true, delete any properties whose value is `undefined` when casting an update. In other words, if this is set, Mongoose will delete `baz` from the update in `Model.updateOne({}, { foo: 'bar', baz: undefined })` before sending the update to the server.
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {Boolean} [options.upsert=false] if true, and no documents found, insert a new document
 * @param {Object} [options.writeConcern=null] sets the [write concern](https://docs.mongodb.com/manual/reference/write-concern/) for replica sets. Overrides the [schema-level write concern](/docs/guide.html#writeConcern)
 * @param {Boolean} [options.timestamps=null] If set to `false` and [schema-level timestamps](/docs/guide.html#timestamps) are enabled, skip timestamps for this update. Does nothing if schema-level timestamps are not set.
 * @param {Function} [callback] params are (error, writeOpResult)
 * @return {Query} this
 * @see Model.update #model_Model.update
 * @see Query docs https://mongoosejs.com/docs/queries.html
 * @see update http://docs.mongodb.org/manual/reference/method/db.collection.update/
 * @see writeOpResult http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#~WriteOpResult
 * @see MongoDB docs https://mongodb.com/docs/reference/command/update/#update-command-output
 * @api public
 */

Query.prototype.updateMany = function(conditions, doc, options, callback) {
  if (typeof options === 'function') {
    // .update(conditions, doc, callback)
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    // .update(doc, callback);
    callback = doc;
    doc = conditions;
    conditions = {};
    options = null;
  } else if (typeof conditions === 'function') {
    // .update(callback)
    callback = conditions;
    conditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof conditions === 'object' && !doc && !options && !callback) {
    // .update(doc)
    doc = conditions;
    conditions = undefined;
    options = undefined;
    callback = undefined;
  }

  return _update(this, 'updateMany', conditions, doc, options, callback);
};

/**
 * Declare and/or execute this query as an `updateOne()` operation. Same as
 * `update()`, except it does not support the `multi` or `overwrite` options.
 *
 * @param {Object} [filter]
 * @param {Object|Array} [update] the update command
 * @param {Object} [options]
 * @param {Boolean} [options.multipleCastError] by default, mongoose only returns the first error that occurred in casting the query. Turn on this option to aggregate all the cast errors.
 * @param {Boolean} [options.omitUndefined=false] If true, delete any properties whose value is `undefined` when casting an update. In other words, if this is set, Mongoose will delete `baz` from the update in `Model.updateOne({}, { foo: 'bar', baz: undefined })` before sending the update to the server.
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {Boolean} [options.upsert=false] if true, and no documents found, insert a new document
 * @param {Object} [options.writeConcern=null] sets the [write concern](https://docs.mongodb.com/manual/reference/write-concern/) for replica sets. Overrides the [schema-level write concern](/docs/guide.html#writeConcern)
 * @param {Boolean} [options.timestamps=null] If set to `false` and [schema-level timestamps](/docs/guide.html#timestamps) are enabled, skip timestamps for this update. Does nothing if schema-level timestamps are not set.
 * @param {Function} [callback] params are (error, writeOpResult)
 * @return {Query} this
 * @see Model.update #model_Model.update
 * @see Query docs https://mongoosejs.com/docs/queries.html
 * @see update http://docs.mongodb.org/manual/reference/method/db.collection.update/
 * @see writeOpResult http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#~WriteOpResult
 * @see MongoDB docs https://mongodb.com/docs/reference/command/update/#update-command-output
 * @api public
 */

Query.prototype.updateOne = function(conditions, doc, options, callback) {
  if (typeof options === 'function') {
    // .update(conditions, doc, callback)
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    // .update(doc, callback);
    callback = doc;
    doc = conditions;
    conditions = {};
    options = null;
  } else if (typeof conditions === 'function') {
    // .update(callback)
    callback = conditions;
    conditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof conditions === 'object' && !doc && !options && !callback) {
    // .update(doc)
    doc = conditions;
    conditions = undefined;
    options = undefined;
    callback = undefined;
  }

  return _update(this, 'updateOne', conditions, doc, options, callback);
};

/**
 * Declare and/or execute this query as a replaceOne() operation. Same as
 * `update()`, except MongoDB will replace the existing document and will
 * not accept any [atomic](https://docs.mongodb.com/manual/tutorial/model-data-for-atomic-operations/#pattern) operators (`$set`, etc.)
 *
 * @param {Object} [filter]
 * @param {Object} [doc] the update command
 * @param {Object} [options]
 * @param {Boolean} [options.multipleCastError] by default, mongoose only returns the first error that occurred in casting the query. Turn on this option to aggregate all the cast errors.
 * @param {Boolean} [options.omitUndefined=false] If true, delete any properties whose value is `undefined` when casting an update. In other words, if this is set, Mongoose will delete `baz` from the update in `Model.updateOne({}, { foo: 'bar', baz: undefined })` before sending the update to the server.
 * @param {Boolean|String} [options.strict] overwrites the schema's [strict mode option](http://mongoosejs.com/docs/guide.html#strict)
 * @param {Boolean} [options.upsert=false] if true, and no documents found, insert a new document
 * @param {Object} [options.writeConcern=null] sets the [write concern](https://docs.mongodb.com/manual/reference/write-concern/) for replica sets. Overrides the [schema-level write concern](/docs/guide.html#writeConcern)
 * @param {Boolean} [options.timestamps=null] If set to `false` and [schema-level timestamps](/docs/guide.html#timestamps) are enabled, skip timestamps for this update. Does nothing if schema-level timestamps are not set.
 * @param {Function} [callback] params are (error, writeOpResult)
 * @return {Query} this
 * @see Model.update #model_Model.update
 * @see Query docs https://mongoosejs.com/docs/queries.html
 * @see update http://docs.mongodb.org/manual/reference/method/db.collection.update/
 * @see writeOpResult http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#~WriteOpResult
 * @see MongoDB docs https://mongodb.com/docs/reference/command/update/#update-command-output
 * @api public
 */

Query.prototype.replaceOne = function(conditions, doc, options, callback) {
  if (typeof options === 'function') {
    // .update(conditions, doc, callback)
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    // .update(doc, callback);
    callback = doc;
    doc = conditions;
    conditions = {};
    options = null;
  } else if (typeof conditions === 'function') {
    // .update(callback)
    callback = conditions;
    conditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof conditions === 'object' && !doc && !options && !callback) {
    // .update(doc)
    doc = conditions;
    conditions = undefined;
    options = undefined;
    callback = undefined;
  }

  this.setOptions({ overwrite: true });
  return _update(this, 'replaceOne', conditions, doc, options, callback);
};

/*!
 * Internal helper for update, updateMany, updateOne, replaceOne
 */

function _update(query, op, filter, doc, options, callback) {
  // make sure we don't send in the whole Document to merge()
  query.op = op;
  filter = utils.toObject(filter);
  doc = doc || {};

  // strict is an option used in the update checking, make sure it gets set
  if (options != null) {
    if ('strict' in options) {
      query._mongooseOptions.strict = options.strict;
    }
  }

  if (!(filter instanceof Query) &&
      filter != null &&
      filter.toString() !== '[object Object]') {
    query.error(new ObjectParameterError(filter, 'filter', op));
  } else {
    query.merge(filter);
  }

  if (utils.isObject(options)) {
    query.setOptions(options);
  }

  query._mergeUpdate(doc);

  // Hooks
  if (callback) {
    query.exec(callback);

    return query;
  }

  return Query.base[op].call(query, filter, void 0, options, callback);
}

/**
 * Runs a function `fn` and treats the return value of `fn` as the new value
 * for the query to resolve to.
 *
 * Any functions you pass to `map()` will run **after** any post hooks.
 *
 * @param {Function} fn function to run to transform the query result
 * @return {Query} this
 */

Query.prototype.map = function(fn) {
  this._transforms.push(fn);
  return this;
};

/**
 * Make this query throw an error if no documents match the given `filter`.
 * This is handy for integrating with async/await, because `orFail()` saves you
 * an extra `if` statement to check if no document was found.
 *
 * @param {Function|Error} [err] optional error to throw if no docs match `filter`. If not specified, `orFail()` will throw a `DocumentNotFoundError`
 * @return {Query} this
 */

Query.prototype.orFail = function(err) {
  this.map(res => {
    switch (this.op) {
      case 'find':
        if (res.length === 0) {
          throw _orFailError(err, this);
        }
        break;
      case 'findOne':
        if (res == null) {
          throw _orFailError(err, this);
        }
        break;
      case 'update':
      case 'updateMany':
      case 'updateOne':
        if (get(res, 'nModified') === 0) {
          throw _orFailError(err, this);
        }
        break;
      case 'findOneAndDelete':
      case 'findOneAndRemove':
        if (get(res, 'lastErrorObject.n') === 0) {
          throw _orFailError(err, this);
        }
        break;
      case 'findOneAndUpdate':
      case 'findOneAndReplace':
        if (get(res, 'lastErrorObject.updatedExisting') === false) {
          throw _orFailError(err, this);
        }
        break;
      case 'deleteMany':
      case 'deleteOne':
      case 'remove':
        if (res.n === 0) {
          throw _orFailError(err, this);
        }
        break;
      default:
        break;
    }

    return res;
  });
  return this;
};

/*!
 * Get the error to throw for `orFail()`
 */

function _orFailError(err, query) {
  if (typeof err === 'function') {
    err = err.call(query);
  }

  if (err == null) {
    err = new DocumentNotFoundError(query.getQuery(), query.model.modelName);
  }

  return err;
}

/**
 * Executes the query
 *
 * @param {String|Function} [operation]
 * @param {Function} [callback] optional params depend on the function being called
 * @return {Promise}
 * @api public
 */

Query.prototype.exec = function exec(op, callback) {
  const _this = this;
  // Ensure that `exec()` is the first thing that shows up in
  // the stack when cast errors happen.
  const castError = new CastError();

  if (typeof op === 'function') {
    callback = op;
    op = null;
  } else if (typeof op === 'string') {
    this.op = op;
  }

  callback = this.model.$handleCallbackError(callback);

  return promiseOrCallback(callback, (cb) => {
    cb = this.model.$wrapCallback(cb);

    if (!_this.op) {
      cb();
      return;
    }

    this._hooks.execPre('exec', this, [], (error) => {
      if (error != null) {
        return cb(_cleanCastErrorStack(castError, error));
      }
      let thunk = '_' + this.op;
      if (this.op === 'update') {
        thunk = '_execUpdate';
      } else if (this.op === 'distinct') {
        thunk = '__distinct';
      }
      this[thunk].call(this, (error, res) => {
        if (error) {
          return cb(_cleanCastErrorStack(castError, error));
        }

        this._hooks.execPost('exec', this, [], {}, (error) => {
          if (error) {
            return cb(_cleanCastErrorStack(castError, error));
          }

          cb(null, res);
        });
      });
    });
  }, this.model.events);
};

/*!
 * ignore
 */

function _cleanCastErrorStack(castError, error) {
  if (error instanceof CastError) {
    castError.copy(error);
    return castError;
  }

  return error;
}

/*!
 * ignore
 */

function _wrapThunkCallback(query, cb) {
  return function(error, res) {
    if (error != null) {
      return cb(error);
    }

    for (const fn of query._transforms) {
      try {
        res = fn(res);
      } catch (error) {
        return cb(error);
      }
    }

    return cb(null, res);
  };
}

/**
 * Executes the query returning a `Promise` which will be
 * resolved with either the doc(s) or rejected with the error.
 *
 * @param {Function} [resolve]
 * @param {Function} [reject]
 * @return {Promise}
 * @api public
 */

Query.prototype.then = function(resolve, reject) {
  return this.exec().then(resolve, reject);
};

/**
 * Executes the query returning a `Promise` which will be
 * resolved with either the doc(s) or rejected with the error.
 * Like `.then()`, but only takes a rejection handler.
 *
 * @param {Function} [reject]
 * @return {Promise}
 * @api public
 */

Query.prototype.catch = function(reject) {
  return this.exec().then(null, reject);
};

/**
 * Add pre [middleware](/docs/middleware.html) to this query instance. Doesn't affect
 * other queries.
 *
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */

Query.prototype.pre = function(fn) {
  this._hooks.pre('exec', fn);
  return this;
};

/**
 * Add post [middleware](/docs/middleware.html) to this query instance. Doesn't affect
 * other queries.
 *
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */

Query.prototype.post = function(fn) {
  this._hooks.post('exec', fn);
  return this;
};

/*!
 * Casts obj for an update command.
 *
 * @param {Object} obj
 * @return {Object} obj after casting its values
 * @api private
 */

Query.prototype._castUpdate = function _castUpdate(obj, overwrite) {
  let strict;
  let schema = this.schema;

  const discriminatorKey = schema.options.discriminatorKey;
  const baseSchema = schema._baseSchema ? schema._baseSchema : schema;
  if (this._mongooseOptions.overwriteDiscriminatorKey &&
      obj[discriminatorKey] != null &&
      baseSchema.discriminators) {
    const _schema = baseSchema.discriminators[obj[discriminatorKey]];
    if (_schema != null) {
      schema = _schema;
    }
  }

  if ('strict' in this._mongooseOptions) {
    strict = this._mongooseOptions.strict;
  } else if (this.schema && this.schema.options) {
    strict = this.schema.options.strict;
  } else {
    strict = true;
  }

  let omitUndefined = false;
  if ('omitUndefined' in this._mongooseOptions) {
    omitUndefined = this._mongooseOptions.omitUndefined;
  }

  let useNestedStrict;
  if ('useNestedStrict' in this.options) {
    useNestedStrict = this.options.useNestedStrict;
  }

  let upsert;
  if ('upsert' in this.options) {
    upsert = this.options.upsert;
  }

  const filter = this._conditions;
  if (schema != null &&
      utils.hasUserDefinedProperty(filter, schema.options.discriminatorKey) &&
      typeof filter[schema.options.discriminatorKey] !== 'object' &&
      schema.discriminators != null) {
    const discriminatorValue = filter[schema.options.discriminatorKey];
    const byValue = getDiscriminatorByValue(this.model.discriminators, discriminatorValue);
    schema = schema.discriminators[discriminatorValue] ||
      (byValue && byValue.schema) ||
      schema;
  }

  return castUpdate(schema, obj, {
    overwrite: overwrite,
    strict: strict,
    omitUndefined,
    useNestedStrict: useNestedStrict,
    upsert: upsert,
    arrayFilters: this.options.arrayFilters
  }, this, this._conditions);
};

/*!
 * castQuery
 * @api private
 */

function castQuery(query) {
  try {
    return query.cast(query.model);
  } catch (err) {
    return err;
  }
}

/*!
 * castDoc
 * @api private
 */

function castDoc(query, overwrite) {
  try {
    return query._castUpdate(query._update, overwrite);
  } catch (err) {
    return err;
  }
}

/**
 * Specifies paths which should be populated with other documents.
 *
 * @param {Object|String} path either the path to populate or an object specifying all parameters
 * @param {Object|String} [select] Field selection for the population query
 * @param {Model} [model] The model you wish to use for population. If not specified, populate will look up the model by the name in the Schema's `ref` field.
 * @param {Object} [match] Conditions for the population query
 * @param {Object} [options] Options for the population query (sort, etc)
 * @param {String} [options.path=null] The path to populate.
 * @param {boolean} [options.retainNullValues=false] by default, Mongoose removes null and undefined values from populated arrays. Use this option to make `populate()` retain `null` and `undefined` array entries.
 * @param {boolean} [options.getters=false] if true, Mongoose will call any getters defined on the `localField`. By default, Mongoose gets the raw value of `localField`. For example, you would need to set this option to `true` if you wanted to add a `lowercase` getter to your `localField`.
 * @param {boolean} [options.clone=false] When you do `BlogPost.find().populate('author')`, blog posts with the same author will share 1 copy of an `author` doc. Enable this option to make Mongoose clone populated docs before assigning them.
 * @param {Object|Function} [options.match=null] Add an additional filter to the populate query. Can be a filter object containing [MongoDB query syntax](https://docs.mongodb.com/manual/tutorial/query-documents/), or a function that returns a filter object.
 * @param {Function} [options.transform=null] Function that Mongoose will call on every populated document that allows you to transform the populated document.
 * @param {Object} [options.options=null] Additional options like `limit` and `lean`.
 * @see population ./populate.html
 * @see Query#select #query_Query-select
 * @see Model.populate #model_Model.populate
 * @return {Query} this
 * @api public
 */

Query.prototype.populate = function() {
  // Bail when given no truthy arguments
  if (!Array.from(arguments).some(Boolean)) {
    return this;
  }

  const res = utils.populate.apply(null, arguments);

  // Propagate readConcern and readPreference and lean from parent query,
  // unless one already specified
  if (this.options != null) {
    const readConcern = this.options.readConcern;
    const readPref = this.options.readPreference;

    for (const populateOptions of res) {
      if (readConcern != null && get(populateOptions, 'options.readConcern') == null) {
        populateOptions.options = populateOptions.options || {};
        populateOptions.options.readConcern = readConcern;
      }
      if (readPref != null && get(populateOptions, 'options.readPreference') == null) {
        populateOptions.options = populateOptions.options || {};
        populateOptions.options.readPreference = readPref;
      }
    }
  }

  const opts = this._mongooseOptions;

  if (opts.lean != null) {
    const lean = opts.lean;
    for (const populateOptions of res) {
      if (get(populateOptions, 'options.lean') == null) {
        populateOptions.options = populateOptions.options || {};
        populateOptions.options.lean = lean;
      }
    }
  }

  if (!utils.isObject(opts.populate)) {
    opts.populate = {};
  }

  const pop = opts.populate;

  for (const populateOptions of res) {
    const path = populateOptions.path;
    if (pop[path] && pop[path].populate && populateOptions.populate) {
      populateOptions.populate = pop[path].populate.concat(populateOptions.populate);
    }

    pop[populateOptions.path] = populateOptions;
  }
  return this;
};

/**
 * Gets a list of paths to be populated by this query
 *
 * @return {Array} an array of strings representing populated paths
 * @api public
 */

Query.prototype.getPopulatedPaths = function getPopulatedPaths() {
  const obj = this._mongooseOptions.populate || {};
  const ret = Object.keys(obj);
  for (const path of Object.keys(obj)) {
    const pop = obj[path];
    if (!Array.isArray(pop.populate)) {
      continue;
    }
    _getPopulatedPaths(ret, pop.populate, path + '.');
  }
  return ret;
};

/*!
 * ignore
 */

function _getPopulatedPaths(list, arr, prefix) {
  for (const pop of arr) {
    list.push(prefix + pop.path);
    if (!Array.isArray(pop.populate)) {
      continue;
    }
    _getPopulatedPaths(list, pop.populate, prefix + pop.path + '.');
  }
}

/**
 * Casts this query to the schema of `model`
 *
 * @param {Model} [model] the model to cast to. If not set, defaults to `this.model`
 * @param {Object} [obj]
 * @return {Object}
 * @api public
 */

Query.prototype.cast = function(model, obj) {
  obj || (obj = this._conditions);

  model = model || this.model;
  const discriminatorKey = model.schema.options.discriminatorKey;
  if (obj != null &&
      obj.hasOwnProperty(discriminatorKey)) {
    model = getDiscriminatorByValue(this.model.discriminators, obj[discriminatorKey]) || model;
  }

  try {
    return cast(model.schema, obj, {
      upsert: this.options && this.options.upsert,
      strict: (this.options && 'strict' in this.options) ?
        this.options.strict :
        get(model, 'schema.options.strict', null),
      strictQuery: (this.options && this.options.strictQuery) ||
        get(model, 'schema.options.strictQuery', null)
    }, this);
  } catch (err) {
    // CastError, assign model
    if (typeof err.setModel === 'function') {
      err.setModel(model);
    }
    throw err;
  }
};

/**
 * Casts selected field arguments for field selection with mongo 2.2
 *
 * @param {Object} fields
 * @see https://github.com/Automattic/mongoose/issues/1091
 * @see http://docs.mongodb.org/manual/reference/projection/elemMatch/
 * @api private
 */

Query.prototype._castFields = function _castFields(fields) {
  let selected,
      elemMatchKeys,
      keys,
      key,
      out,
      i;

  if (fields) {
    keys = Object.keys(fields);
    elemMatchKeys = [];
    i = keys.length;

    // collect $elemMatch args
    while (i--) {
      key = keys[i];
      if (fields[key].$elemMatch) {
        selected || (selected = {});
        selected[key] = fields[key];
        elemMatchKeys.push(key);
      }
    }
  }

  if (selected) {
    // they passed $elemMatch, cast em
    try {
      out = this.cast(this.model, selected);
    } catch (err) {
      return err;
    }

    // apply the casted field args
    i = elemMatchKeys.length;
    while (i--) {
      key = elemMatchKeys[i];
      fields[key] = out[key];
    }
  }

  return fields;
};

/**
 * Applies schematype selected options to this query.
 * @api private
 */

Query.prototype._applyPaths = function applyPaths() {
  this._fields = this._fields || {};
  helpers.applyPaths(this._fields, this.model.schema);

  let _selectPopulatedPaths = true;

  if ('selectPopulatedPaths' in this.model.base.options) {
    _selectPopulatedPaths = this.model.base.options.selectPopulatedPaths;
  }
  if ('selectPopulatedPaths' in this.model.schema.options) {
    _selectPopulatedPaths = this.model.schema.options.selectPopulatedPaths;
  }

  if (_selectPopulatedPaths) {
    selectPopulatedFields(this._fields, this._userProvidedFields, this._mongooseOptions.populate);
  }
};

/**
 * Returns a wrapper around a [mongodb driver cursor](http://mongodb.github.io/node-mongodb-native/2.1/api/Cursor.html).
 * A QueryCursor exposes a Streams3 interface, as well as a `.next()` function.
 *
 * @return {QueryCursor}
 * @param {Object} [options]
 * @see QueryCursor
 * @api public
 */

Query.prototype.cursor = function cursor(opts) {
  this._applyPaths();
  this._fields = this._castFields(this._fields);
  this.setOptions({ projection: this._fieldsForExec() });
  if (opts) {
    this.setOptions(opts);
  }

  const options = Object.assign({}, this._optionsForExec(), {
    projection: this.projection()
  });
  try {
    this.cast(this.model);
  } catch (err) {
    return (new QueryCursor(this, options))._markError(err);
  }

  return new QueryCursor(this, options);
};

// the rest of these are basically to support older Mongoose syntax with mquery

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

/**
 * Declares an intersects query for `geometry()`.
 *
 * @param {Object} [arg]
 * @return {Query} this
 * @see $geometry http://docs.mongodb.org/manual/reference/operator/geometry/
 * @see geoIntersects http://docs.mongodb.org/manual/reference/operator/geoIntersects/
 * @api public
 */

/**
 * Specifies a `$geometry` condition
 *
 * @param {Object} object Must contain a `type` property which is a String and a `coordinates` property which is an Array.
 * @return {Query} this
 * @see $geometry http://docs.mongodb.org/manual/reference/operator/geometry/
 * @see http://docs.mongodb.org/manual/release-notes/2.4/#new-geospatial-indexes-with-geojson-and-improved-spherical-geometry
 * @see http://www.mongodb.org/display/DOCS/Geospatial+Indexing
 * @api public
 */

/**
 * Specifies a `$near` or `$nearSphere` condition
 *
 * @param {String} [path]
 * @param {Object} val
 * @return {Query} this
 * @see $near http://docs.mongodb.org/manual/reference/operator/near/
 * @see $nearSphere http://docs.mongodb.org/manual/reference/method/nearSphere/
 * @see $maxDistance http://docs.mongodb.org/manual/reference/operator/maxDistance/
 * @see http://www.mongodb.org/display/DOCS/Geospatial+Indexing
 * @api public
 */

/*!
 * Overwriting mquery is needed to support a couple different near() forms found in older
 * versions of mongoose
 * near([1,1])
 * near(1,1)
 * near(field, [1,2])
 * near(field, 1, 2)
 * In addition to all of the normal forms supported by mquery
 */

Query.prototype.near = function() {
  const params = [];
  const sphere = this._mongooseOptions.nearSphere;

  const args = Array.from(arguments);
  const len = args.length;

  if (len === 1) {
    const a0 = args[0];
    if (Array.isArray(a0)) {
      params.push({ center: a0, spherical: sphere });
    } else if (typeof a0 === 'string') {
      params.push(a0);
    } else if (utils.isObject(a0)) {
      const obj = Object.assign({}, a0);
      if (typeof obj.spherical !== 'boolean') {
        obj.spherical = sphere;
      }
      params.push(obj);
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (len === 2) {
    const [a0, a1] = args;
    if (typeof a0 === 'number' && typeof a1 === 'number') {
      params.push({ center: [a0, a1], spherical: sphere });
    } else if (typeof a0 === 'string' && Array.isArray(a1)) {
      params.push(a0);
      params.push({ center: a1, spherical: sphere });
    } else if (typeof a0 === 'string' && utils.isObject(a1)) {
      const obj = Object.assign({}, a1);
      if (typeof obj.spherical !== 'boolean') {
        obj.spherical = sphere;
      }
      params.push(a0);
      params.push(obj);
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (len === 3) {
    const [a0, a1, a2] = args;
    if (typeof a0 === 'string' && typeof a1 === 'number' && typeof a2 === 'number') {
      params.push(a0);
      params.push({ center: [a1, a2], spherical: sphere });
    } else {
      throw new TypeError('invalid argument');
    }
  } else {
    throw new TypeError('invalid argument');
  }

  return Query.base.near.apply(this, params);
};

/**
 * _DEPRECATED_ Specifies a `$nearSphere` condition
 *
 * @deprecated
 * @see near() #query_Query-near
 * @see $near http://docs.mongodb.org/manual/reference/operator/near/
 * @see $nearSphere http://docs.mongodb.org/manual/reference/operator/nearSphere/
 * @see $maxDistance http://docs.mongodb.org/manual/reference/operator/maxDistance/
 */

Query.prototype.nearSphere = function() {
  this._mongooseOptions.nearSphere = true;
  this.near.apply(this, arguments);
  return this;
};

/**
 * Returns an asyncIterator for use with `for/await/of` loops
 * This function *only* works for `find()` queries.
 *
 * @param {String} [operation]
 * @param {Function} [callback] optional params depend on the function being called
 * @return {Promise}
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
 * @param {String|Array} [path]
 * @param {Array|Object} [coordinatePairs...]
 * @return {Query} this
 * @see $polygon http://docs.mongodb.org/manual/reference/operator/polygon/
 * @see http://docs.mongodb.org/display/DOCS/Geospatial+Indexing
 * @api public
 */

/**
 * Specifies a `$box` condition
 *
 * @param {Object} val
 * @param [Array] Upper Right Coords
 * @return {Query} this
 * @see $box http://docs.mongodb.org/manual/reference/operator/box/
 * @see within() Query#within #query_Query-within
 * @see http://docs.mongodb.org/display/DOCS/Geospatial+Indexing
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
 * @param {String} [path]
 * @param {Object} area
 * @return {Query} this
 * @see $center http://docs.mongodb.org/manual/reference/operator/center/
 * @see $centerSphere http://docs.mongodb.org/manual/reference/operator/centerSphere/
 * @see $geoWithin http://docs.mongodb.org/manual/reference/operator/geoWithin/
 * @see http://www.mongodb.org/display/DOCS/Geospatial+Indexing
 * @api public
 */

/**
 * _DEPRECATED_ Alias for `circle`
 *
 * @deprecated
 * @method center
 * @memberOf Query
 * @instance
 * @api public
 */

Query.prototype.center = Query.base.circle;

/**
 * _DEPRECATED_ Specifies a `$centerSphere` condition
 *
 * @deprecated
 * @param {String} [path]
 * @param {Object} val
 * @return {Query} this
 * @see http://www.mongodb.org/display/DOCS/Geospatial+Indexing
 * @see $centerSphere http://docs.mongodb.org/manual/reference/operator/centerSphere/
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
 * @return {Boolean}
 * @api public
 */

Query.prototype.selected = function selected() {
  return isInclusive(this._fields);
};

/**
 * Determines if inclusive field selection has been made.
 *
 * @return {Boolean}
 * @api public
 */

Query.prototype.selectedInclusively = function selectedInclusively() {
  return isInclusive(this._fields);
};

/**
 * Determines if exclusive field selection has been made.
 *
 * @return {Boolean}
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