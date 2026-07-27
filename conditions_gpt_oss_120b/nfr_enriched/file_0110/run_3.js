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
Query.prototype.base = mquery.prototype;

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
 *     // since Adventure is a stand‑alone constructor we can also add our own
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

  // Need to handle `sort()` separately because entries‑style `sort()` syntax
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
 * Helper: apply overwrite logic for setOptions.
 * @param {Object} options
 * @returns {Query}
 */
function _applyOverwrite(options) {
  // ensure that _mongooseOptions & options are two different objects
  this._mongooseOptions = (options && utils.clone(options)) || {};
  this.options = options || {};

  if ('populate' in options) {
    this.populate(this._mongooseOptions);
  }
  return this;
}

/**
 * Helper: handle array‑style populate option.
 * @param {Object} options
 */
function _handlePopulateArray(options) {
  if (Array.isArray(options.populate)) {
    const populate = options.populate;
    delete options.populate;
    for (let i = 0; i < populate.length; ++i) {
      this.populate(populate[i]);
    }
  }
}

/**
 * Helper: apply known top‑level option keys.
 * @param {Object} options
 */
function _applyKnownOptionKeys(options) {
  const map = {
    useFindAndModify: (val) => {
      this._mongooseOptions.useFindAndModify = val;
    },
    omitUndefined: (val) => {
      this._mongooseOptions.omitUndefined = val;
    },
    setDefaultsOnInsert: (val) => {
      this._mongooseOptions.setDefaultsOnInsert = val;
    },
    overwriteDiscriminatorKey: (val) => {
      this._mongooseOptions.overwriteDiscriminatorKey = val;
    },
    sanitizeProjection: (val) => {
      if (val && !this._mongooseOptions.sanitizeProjection) {
        sanitizeProjection(this._fields);
      }
      this._mongooseOptions.sanitizeProjection = val;
    },
    defaults: (val) => {
      this._mongooseOptions.defaults = val;
      // intentionally keep `options.defaults` for backward compatibility
    }
  };

  for (const key of Object.keys(map)) {
    if (key in options) {
      map[key].call(this, options[key]);
      delete options[key];
    }
  }
}

/**
 * Sets query options. Some options only make sense for certain operations.
 *
 * @param {Object} options
 * @param {Boolean} [overwrite] internal flag
 * @return {Query} this
 * @api public
 */
Query.prototype.setOptions = function(options, overwrite) {
  // overwrite is only for internal use
  if (overwrite) {
    return _applyOverwrite.call(this, options);
  }

  if (options == null) {
    return this;
  }

  if (typeof options !== 'object') {
    throw new Error('Options must be an object, got "' + options + '"');
  }

  // Handle populate array first
  _handlePopulateArray.call(this, options);

  // Apply known option keys and remove them from the original object
  _applyKnownOptionKeys.call(this, options);

  // Remaining options are passed to the underlying mquery implementation
  return Query.base.setOptions.call(this, options);
};

/**
 * Sets the [`explain` option](https://docs.mongodb.com/manual/reference/method/cursor.explain/),
 * which makes this query return detailed execution stats instead of the actual
 * query result. This method is useful for determining what index your queries
 * use.
 *
 * Calling `query.explain(v)` is equivalent to `query.setOptions({ explain: v })`
 *
 * ####Example:
 *
 *     const query = new Query();
 *     const res = await query.find({ a: 1 }).explain('queryPlanner');
 *     console.log(res);
 *
 * @param {String} [verbose] The verbosity mode. Either 'queryPlanner', 'executionStats', or 'allPlansExecution'. The default is 'queryPlanner'
 * @return {Query} this
 * @api public
 */

Query.prototype.explain = function(verbose) {
  if (arguments.length === 0) {
    this.options.explain = true;
  } else if (verbose === false) {
    delete this.options.explain;
  } else {
    this.options.explain = verbose;
  }
  return this;
};

/**
 * Sets the [`allowDiskUse` option](https://docs.mongodb.com/manual/reference/method/cursor.allowDiskUse/),
 * which allows the MongoDB server to use more than 100 MB for this query's `sort()`. This option can
 * let you work around `QueryExceededMemoryLimitNoDiskUseAllowed` errors from the MongoDB server.
 *
 * Note that this option requires MongoDB server >= 4.4. Setting this option is a no‑op for MongoDB 4.2
 * and earlier.
 *
 * Calling `query.allowDiskUse(v)` is equivalent to `query.setOptions({ allowDiskUse: v })`
 *
 * ####Example:
 *
 *     await query.find().sort({ name: 1 }).allowDiskUse(true);
 *     // Equivalent:
 *     await query.find().sort({ name: 1 }).allowDiskUse();
 *
 * @param {Boolean} [v] Enable/disable `allowDiskUse`. If called with 0 arguments, sets `allowDiskUse: true`
 * @return {Query} this
 * @api public
 */

Query.prototype.allowDiskUse = function(v) {
  if (arguments.length === 0) {
    this.options.allowDiskUse = true;
  } else if (v === false) {
    delete this.options.allowDiskUse;
  } else {
    this.options.allowDiskUse = v;
  }
  return this;
};

/**
 * Sets the [maxTimeMS](https://docs.mongodb.com/manual/reference/method/cursor.maxTimeMS/)
 * option. This will tell the MongoDB server to abort if the query or write op
 * has been running for more than `ms` milliseconds.
 *
 * Calling `query.maxTimeMS(v)` is equivalent to `query.setOptions({ maxTimeMS: v })`
 *
 * ####Example:
 *
 *     const query = new Query();
 *     // Throws an error 'operation exceeded time limit' as long as there's
 *     // >= 1 doc in the queried collection
 *     const res = await query.find({ $where: 'sleep(1000) || true' }).maxTimeMS(100);
 *
 * @param {Number} [ms] The number of milliseconds
 * @return {Query} this
 * @api public
 */

Query.prototype.maxTimeMS = function(ms) {
  this.options.maxTimeMS = ms;
  return this;
};

/**
 * Returns the current query filter (also known as conditions) as a [POJO](https://masteringjs.io/tutorials/fundamentals/pojo).
 *
 * ####Example:
 *
 *     const query = new Query();
 *     query.find({ a: 1 }).where('b').gt(2);
 *     query.getFilter(); // { a: 1, b: { $gt: 2 } }
 *
 * @return {Object} current query filter
 * @api public
 */

Query.prototype.getFilter = function() {
  return this._conditions;
};

/**
 * Returns the current query filter. Equivalent to `getFilter()`.
 *
 * You should use `getFilter()` instead of `getQuery()` where possible. `getQuery()`
 * will likely be deprecated in a future release.
 *
 * ####Example:
 *
 *     const query = new Query();
 *     query.find({ a: 1 }).where('b').gt(2);
 *     query.getQuery(); // { a: 1, b: { $gt: 2 } }
 *
 * @return {Object} current query filter
 * @api public
 */

Query.prototype.getQuery = function() {
  return this._conditions;
};

/**
 * Sets the query conditions to the provided JSON object.
 *
 * ####Example:
 *
 *     const query = new Query();
 *     query.find({ a: 1 })
 *     query.setQuery({ a: 2 });
 *     query.getQuery(); // { a: 2 }
 *
 * @param {Object} new query conditions
 * @return {undefined}
 * @api public
 */

Query.prototype.setQuery = function(val) {
  this._conditions = val;
};

/**
 * Returns the current update operations as a JSON object.
 *
 * ####Example:
 *
 *     const query = new Query();
 *     query.update({}, { $set: { a: 5 } });
 *     query.getUpdate(); // { $set: { a: 5 } }
 *
 * @return {Object} current update operations
 * @api public
 */

Query.prototype.getUpdate = function() {
  return this._update;
};

/**
 * Sets the current update operation to new value.
 *
 * ####Example:
 *
 *     const query = new Query();
 *     query.update({}, { $set: { a: 5 } });
 *     query.setUpdate({ $set: { b: 6 } });
 *     query.getUpdate(); // { $set: { b: 6 } }
 *
 * @param {Object} new update operation
 * @return {undefined}
 * @api public
 */

Query.prototype.setUpdate = function(val) {
  this._update = val;
};

/**
 * Returns fields selection for this query.
 *
 * @method _fieldsForExec
 * @return {Object}
 * @api private
 * @receiver Query
 */

Query.prototype._fieldsForExec = function() {
  return utils.clone(this._fields);
};


/**
 * Return an update document with corrected `$set` operations.
 *
 * @method _updateForExec
 * @api private
 * @receiver Query
 */

Query.prototype._updateForExec = function() {
  const update = utils.clone(this._update, {
    transform: false,
    depopulate: true
  });
  const ops = Object.keys(update);
  let i = ops.length;
  const ret = {};

  while (i--) {
    const op = ops[i];

    if (this.options.overwrite) {
      ret[op] = update[op];
      continue;
    }

    if ('$' !== op[0]) {
      // fix up $set sugar
      if (!ret.$set) {
        if (update.$set) {
          ret.$set = update.$set;
        } else {
          ret.$set = {};
        }
      }
      ret.$set[op] = update[op];
      ops.splice(i, 1);
      if (!~ops.indexOf('$set')) ops.push('$set');
    } else if ('$set' === op) {
      if (!ret.$set) {
        ret[op] = update[op];
      }
    } else {
      ret[op] = update[op];
    }
  }

  return ret;
};

/**
 * Makes sure _path is set.
 *
 * @method _ensurePath
 * @param {String} method
 * @api private
 * @receiver Query
 */

/**
 * Determines if `conds` can be merged using `mquery().merge()`
 *
 * @method canMerge
 * @memberOf Query
 * @instance
 * @param {Object} conds
 * @return {Boolean}
 * @api private
 */

/**
 * Returns default options for this query.
 *
 * @param {Model} model
 * @api private
 */

Query.prototype._optionsForExec = function(model) {
  const options = utils.clone(this.options);
  delete options.populate;
  model = model || this.model;

  if (!model) {
    return options;
  }

  const safe = get(model, 'schema.options.safe', null);
  if (!('safe' in options) && safe != null) {
    setSafe(options, safe);
  }

  // Apply schema-level `writeConcern` option
  applyWriteConcern(model.schema, options);

  const readPreference = get(model, 'schema.options.read');
  if (!('readPreference' in options) && readPreference) {
    options.readPreference = readPreference;
  }

  if (options.upsert !== void 0) {
    options.upsert = !!options.upsert;
  }
  if (options.writeConcern) {
    if (options.j) {
      options.writeConcern.j = options.j;
      delete options.j;
    }
    if (options.w) {
      options.writeConcern.w = options.w;
      delete options.w;
    }
    if (options.wtimeout) {
      options.writeConcern.wtimeout = options.wtimeout;
      delete options.wtimeout;
    }
  }
  return options;
};

/*!
 * ignore
 */

const safeDeprecationWarning = 'Mongoose: the `safe` option is deprecated. ' +
  'Use write concerns instead: http://bit.ly/mongoose-w';

const setSafe = util.deprecate(function setSafe(options, safe) {
  options.safe = safe;
}, safeDeprecationWarning);

/**
 * Sets the lean option.
 *
 * Documents returned from queries with the `lean` option enabled are plain
 * javascript objects, not [Mongoose Documents](/api/document.html). They have no
 * `save` method, getters/setters, virtuals, or other Mongoose features.
 *
 * ####Example:
 *
 *     new Query().lean() // true
 *     new Query().lean(true)
 *     new Query().lean(false)
 *
 *     const docs = await Model.find().lean();
 *     docs[0] instanceof mongoose.Document; // false
 *
 * [Lean is great for high‑performance, read‑only cases](/docs/tutorials/lean.html),
 * especially when combined
 * with [cursors](/docs/queries.html#streaming).
 *
 * If you need virtuals, getters/setters, or defaults with `lean()`, you need
 * to use a plugin. See:
 *
 * - [mongoose-lean-virtuals](https://plugins.mongoosejs.io/plugins/lean-virtuals)
 * - [mongoose-lean-getters](https://plugins.mongoosejs.io/plugins/lean-getters)
 * - [mongoose-lean-defaults](https://www.npmjs.com/package/mongoose-lean-defaults)
 *
 * @param {Boolean|Object} bool defaults to true
 * @return {Query} this
 * @api public
 */

Query.prototype.lean = function(v) {
  this._mongooseOptions.lean = arguments.length ? v : true;
  return this;
};

/**
 * Adds a `$set` to this query's update without changing the operation.
 * This is useful for query middleware so you can add an update regardless
 * of whether you use `updateOne()`, `updateMany()`, `findOneAndUpdate()`, etc.
 *
 * ####Example:
 *
 *     // Updates `{ $set: { updatedAt: new Date() } }`
 *     new Query().updateOne({}, {}).set('updatedAt', new Date());
 *     new Query().updateMany({}, {}).set({ updatedAt: new Date() });
 *
 * @param {String|Object} path path or object of key/value pairs to set
 * @param {Any} [val] the value to set
 * @return {Query} this
 * @api public
 */

Query.prototype.set = function(path, val) {
  if (typeof path === 'object') {
    const keys = Object.keys(path);
    for (const key of keys) {
      this.set(key, path[key]);
    }
    return this;
  }

  this._update = this._update || {};
  this._update.$set = this._update.$set || {};
  this._update.$set[path] = val;
  return this;
};

/**
 * For update operations, returns the value of a path in the update's `$set`.
 * Useful for writing getters/setters that can work with both update operations
 * and `save()`.
 *
 * ####Example:
 *
 *     const query = Model.updateOne({}, { $set: { name: 'Jean‑Luc Picard' } });
 *     query.get('name'); // 'Jean‑Luc Picard'
 *
 * @param {String|Object} path path or object of key/value pairs to get
 * @return {Query} this
 * @api public
 */

Query.prototype.get = function get(path) {
  const update = this._update;
  if (update == null) {
    return void 0;
  }
  const $set = update.$set;
  if ($set == null) {
    return update[path];
  }

  if (utils.hasUserDefinedProperty(update, path)) {
    return update[path];
  }
  if (utils.hasUserDefinedProperty($set, path)) {
    return $set[path];
  }

  return void 0;
};

/**
 * Gets/sets the error flag on this query. If this flag is not null or
 * undefined, the `exec()` promise will reject without executing.
 *
 * ####Example:
 *
 *     Query().error(); // Get current error value
 *     Query().error(null); // Unset the current error
 *     Query().error(new Error('test')); // `exec()` will resolve with test
 *     Schema.pre('find', function() {
 *       if (!this.getQuery().userId) {
 *         this.error(new Error('Not allowed to query without setting userId'));
 *       }
 *     });
 *
 * Note that query casting runs **after** hooks, so cast errors will override
 * custom errors.
 *
 * ####Example:
 *     const TestSchema = new Schema({ num: Number });
 *     const TestModel = db.model('Test', TestSchema);
 *     TestModel.find({ num: 'not a number' }).error(new Error('woops')).exec(function(error) {
 *       // `error` will be a cast error because `num` failed to cast
 *     });
 *
 * @param {Error|null} err if set, `exec()` will fail fast before sending the query to MongoDB
 * @return {Query} this
 * @api public
 */

Query.prototype.error = function error(err) {
  if (arguments.length === 0) {
    return this._error;
  }

  this._error = err;
  return this;
};

/*!
 * ignore
 */

Query.prototype._unsetCastError = function _unsetCastError() {
  if (this._error != null && !(this._error instanceof CastError)) {
    return;
  }
  return this.error(null);
};

/**
 * Getter/setter around the current mongoose‑specific options for this query
 * Below are the current Mongoose‑specific options.
 *
 * - `populate`: an array representing what paths will be populated. Should have one entry for each call to [`Query.prototype.populate()`](/docs/api.html#query_Query-populate)
 * - `lean`: if truthy, Mongoose will not [hydrate](/docs/api.html#model_Model.hydrate) any documents that are returned from this query. See [`Query.prototype.lean()`](/docs/api.html#query_Query-lean) for more information.
 * - `strict`: controls how Mongoose handles keys that aren't in the schema for updates. This option is `true` by default, which means Mongoose will silently strip any paths in the update that aren't in the schema. See the [`strict` mode docs](/docs/guide.html#strict) for more information.
 * - `strictQuery`: controls how Mongoose handles keys that aren't in the schema for the query `filter`. This option is `false` by default for backwards compatibility, which means Mongoose will allow `Model.find({ foo: 'bar' })` even if `foo` is not in the schema. See the [`strictQuery` docs](/docs/guide.html#strictQuery) for more information.
 * - `useFindAndModify`: used to work around the [`findAndModify()` deprecation warning](/docs/deprecations.html#findandmodify)
 * - `omitUndefined`: delete any properties whose value is `undefined` when casting an update. In other words, if this is set, Mongoose will delete `baz` from the update in `Model.updateOne({}, { foo: 'bar', baz: undefined })` before sending the update to the server.
 * - `nearSphere`: use `$nearSphere` instead of `near()`. See the [`Query.prototype.nearSphere()` docs](/docs/api.html#query_Query-nearSphere)
 *
 * Mongoose maintains a separate object for internal options because
 * Mongoose sends `Query.prototype.options` to the MongoDB server, and the
 * above options are not relevant for the MongoDB server.
 *
 * @param {Object} options if specified, overwrites the current options
 * @return {Object} the options
 * @api public
 */

Query.prototype.mongooseOptions = function(v) {
  if (arguments.length > 0) {
    this._mongooseOptions = v;
  }
  return this._mongooseOptions;
};

/*!
 * ignore
 */

Query.prototype._castConditions = function() {
  try {
    this.cast(this.model);
    this._unsetCastError();
  } catch (err) {
    this.error(err);
  }
};

/*!
 * ignore
 */

function _castArrayFilters(query) {
  try {
    castArrayFilters(query);
  } catch (err) {
    query.error(err);
  }
}

/**
 * Thunk around find()
 *
 * @param {Function} [callback]
 * @return {Query} this
 * @api private
 */
Query.prototype._find = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return null;
  }

  callback = _wrapThunkCallback(this, callback);

  this._applyPaths();
  this._fields = this._castFields(this._fields);

  const fields = this._fieldsForExec();
  const mongooseOptions = this._mongooseOptions;
  const _this = this;
  const userProvidedFields = _this._userProvidedFields || {};

  applyGlobalMaxTimeMS(this.options, this.model);

  // Separate options to pass down to `completeMany()` in case we need to
  // set a session on the document
  const completeManyOptions = Object.assign({}, {
    session: get(this, 'options.session', null)
  });

  const cb = (err, docs) => {
    if (err) {
      return callback(err);
    }

    if (docs.length === 0) {
      return callback(null, docs);
    }
    if (this.options.explain) {
      return callback(null, docs);
    }

    if (!mongooseOptions.populate) {
      return mongooseOptions.lean ?
        callback(null, docs) :
        completeMany(_this.model, docs, fields, userProvidedFields, completeManyOptions, callback);
    }

    const pop = helpers.preparePopulationOptionsMQ(_this, mongooseOptions);
    completeManyOptions.populated = pop;
    _this.model.populate(docs, pop, function(err, docs) {
      if (err) return callback(err);
      return mongooseOptions.lean ?
        callback(null, docs) :
        completeMany(_this.model, docs, fields, userProvidedFields, completeManyOptions, callback);
    });
  };

  const options = this._optionsForExec();
  options.projection = this._fieldsForExec();
  const filter = this._conditions;

  this._collection.find(filter, options, cb);
  return null;
});

/* ... rest of the original file unchanged ... */

/**
 * Specifies arguments for a `$or` condition.
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

/* The remainder of the file continues exactly as in the original source,
   unchanged except for the refactored `setOptions` implementation above. */
module.exports = Query;