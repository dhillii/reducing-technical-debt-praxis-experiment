```javascript
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
 * Helper to build a parameter object for query methods.
 *
 * @class QueryParamBuilder
 * @classdesc Builder pattern for constructing query parameter objects.
 */
class QueryParamBuilder {
  constructor() {
    this.params = {};
  }
  /** @param {*} criteria */
  criteria(criteria) { this.params.criteria = criteria; return this; }
  /** @param {*} doc */
  doc(doc) { this.params.doc = doc; return this; }
  /** @param {*} projection */
  projection(projection) { this.params.projection = projection; return this; }
  /** @param {*} options */
  options(options) { this.params.options = options; return this; }
  /** @param {Function} callback */
  callback(callback) { this.params.callback = callback; return this; }
  /** @returns {Object} */
  build() { return this.params; }
}

/**
 * Normalizes arguments for query methods that accept up to four parameters.
 *
 * @param {IArguments} args - The `arguments` object from the calling method.
 * @param {Object} defaults - Default values for the normalized parameters.
 * @returns {{criteria:*, doc:*, options:*, callback:Function}}
 */
function normalizeQueryArgs(args, defaults = {}) {
  const builder = new QueryParamBuilder();
  const [a0, a1, a2, a3] = args;

  // Detect legacy signatures and map them to the builder.
  if (typeof a0 === 'function') {
    builder.callback(a0);
  } else if (typeof a0 === 'object' && !Array.isArray(a0) && a0 !== null && !(a0 instanceof Query)) {
    // Single object may be a param object.
    if ('criteria' in a0 || 'doc' in a0 || 'options' in a0 || 'callback' in a0) {
      return { ...defaults, ...a0 };
    }
    // Legacy: (conditions, projection, options, callback)
    builder.criteria(a0);
    if (typeof a1 === 'function') {
      builder.callback(a1);
    } else {
      builder.projection(a1);
      if (typeof a2 === 'function') {
        builder.callback(a2);
      } else {
        builder.options(a2);
        if (typeof a3 === 'function') builder.callback(a3);
      }
    }
  } else {
    // Legacy positional arguments.
    builder.criteria(a0);
    if (typeof a1 === 'function') {
      builder.callback(a1);
    } else {
      builder.doc(a1);
      if (typeof a2 === 'function') {
        builder.callback(a2);
      } else {
        builder.options(a2);
        if (typeof a3 === 'function') builder.callback(a3);
      }
    }
  }

  return { ...defaults, ...builder.build() };
}

/**
 * Query constructor used for building queries. You do not need
 * to instantiate a `Query` directly. Instead use Model functions like
 * [`Model.find()`](/docs/api.html#find_find).
 *
 * @param {Object} [conditions]
 * @param {Object} [options]
 * @param {Object} [model]
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
 * @method slice
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val number/range of elements to slice
 * @return {Query} this
 */
Query.prototype.slice = function () {
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
 * @method read
 * @memberOf Query
 * @instance
 * @param {String} pref one of the listed preference options or aliases
 * @param {Array} [tags] optional tags for this query
 * @return {Query} this
 * @api public
 */
Query.prototype.read = function read(pref, tags) {
  // first cast into a ReadPreference object to support tags
  const read = new ReadPreference(pref, tags);
  this.options.readPreference = read;
  return this;
};

/**
 * @method session
 * @memberOf Query
 * @instance
 * @param {ClientSession} [session] from `await conn.startSession()`
 * @return {Query} this
 * @api public
 */
Query.prototype.session = function session(v) {
  if (v == null) {
    delete this.options.session;
  }
  this.options.session = v;
  return this;
};

/**
 * @method writeConcern
 * @memberOf Query
 * @instance
 * @param {Object} writeConcern the write concern value to set
 * @return {Query} this
 * @api public
 */
Query.prototype.writeConcern = function writeConcern(val) {
  if (val == null) {
    delete this.options.writeConcern;
    return this;
  }
  this.options.writeConcern = val;
  return this;
};

/**
 * @method w
 * @memberOf Query
 * @instance
 * @param {String|number} val
 * @return {Query} this
 * @api public
 */
Query.prototype.w = function w(val) {
  if (val == null) {
    delete this.options.w;
  }
  if (this.options.writeConcern != null) {
    this.options.writeConcern.w = val;
  } else {
    this.options.w = val;
  }
  return this;
};

/**
 * @method j
 * @memberOf Query
 * @instance
 * @param {boolean} val
 * @return {Query} this
 * @api public
 */
Query.prototype.j = function j(val) {
  if (val == null) {
    delete this.options.j;
  }
  if (this.options.writeConcern != null) {
    this.options.writeConcern.j = val;
  } else {
    this.options.j = val;
  }
  return this;
};

/**
 * @method wtimeout
 * @memberOf Query
 * @instance
 * @param {number} ms number of milliseconds to wait
 * @return {Query} this
 * @api public
 */
Query.prototype.wtimeout = function wtimeout(ms) {
  if (ms == null) {
    delete this.options.wtimeout;
  }
  if (this.options.writeConcern != null) {
    this.options.writeConcern.wtimeout = ms;
  } else {
    this.options.wtimeout = ms;
  }
  return this;
};

/**
 * @method getOptions
 * @return {Object} the options
 * @api public
 */
Query.prototype.getOptions = function () {
  return this.options;
};

/**
 * @method setOptions
 * @param {Object} options
 * @return {Query} this
 * @api public
 */
Query.prototype.setOptions = function (options, overwrite) {
  // overwrite is only for internal use
  if (overwrite) {
    // ensure that _mongooseOptions & options are two different objects
    this._mongooseOptions = (options && utils.clone(options)) || {};
    this.options = options || {};

    if ('populate' in options) {
      this.populate(this._mongooseOptions);
    }
    return this;
  }
  if (options == null) {
    return this;
  }
  if (typeof options !== 'object') {
    throw new Error('Options must be an object, got "' + options + '"');
  }

  if (Array.isArray(options.populate)) {
    const populate = options.populate;
    delete options.populate;
    const _numPopulate = populate.length;
    for (let i = 0; i < _numPopulate; ++i) {
      this.populate(populate[i]);
    }
  }

  if ('useFindAndModify' in options) {
    this._mongooseOptions.useFindAndModify = options.useFindAndModify;
    delete options.useFindAndModify;
  }
  if ('omitUndefined' in options) {
    this._mongooseOptions.omitUndefined = options.omitUndefined;
    delete options.omitUndefined;
  }
  if ('setDefaultsOnInsert' in options) {
    this._mongooseOptions.setDefaultsOnInsert = options.setDefaultsOnInsert;
    delete options.setDefaultsOnInsert;
  }
  if ('overwriteDiscriminatorKey' in options) {
    this._mongooseOptions.overwriteDiscriminatorKey = options.overwriteDiscriminatorKey;
    delete options.overwriteDiscriminatorKey;
  }
  if ('sanitizeProjection' in options) {
    if (options.sanitizeProjection && !this._mongooseOptions.sanitizeProjection) {
      sanitizeProjection(this._fields);
    }

    this._mongooseOptions.sanitizeProjection = options.sanitizeProjection;
    delete options.sanitizeProjection;
  }

  if ('defaults' in options) {
    this._mongooseOptions.defaults = options.defaults;
    // deleting options.defaults will cause 7287 to fail
  }

  return Query.base.setOptions.call(this, options);
};

/**
 * @method explain
 * @param {String} [verbose]
 * @return {Query} this
 * @api public
 */
Query.prototype.explain = function (verbose) {
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
 * @method allowDiskUse
 * @param {Boolean} [v]
 * @return {Query} this
 * @api public
 */
Query.prototype.allowDiskUse = function (v) {
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
 * @method maxTimeMS
 * @param {Number} [ms]
 * @return {Query} this
 * @api public
 */
Query.prototype.maxTimeMS = function (ms) {
  this.options.maxTimeMS = ms;
  return this;
};

/**
 * @method getFilter
 * @return {Object} current query filter
 * @api public
 */
Query.prototype.getFilter = function () {
  return this._conditions;
};

/**
 * @method getQuery
 * @return {Object} current query filter
 * @api public
 */
Query.prototype.getQuery = function () {
  return this._conditions;
};

/**
 * @method setQuery
 * @param {Object} new query conditions
 * @return {undefined}
 * @api public
 */
Query.prototype.setQuery = function (val) {
  this._conditions = val;
};

/**
 * @method getUpdate
 * @return {Object} current update operations
 * @api public
 */
Query.prototype.getUpdate = function () {
  return this._update;
};

/**
 * @method setUpdate
 * @param {Object} new update operation
 * @return {undefined}
 * @api public
 */
Query.prototype.setUpdate = function (val) {
  this._update = val;
};

/**
 * @method _fieldsForExec
 * @return {Object}
 * @api private
 * @receiver Query
 */
Query.prototype._fieldsForExec = function () {
  return utils.clone(this._fields);
};

/**
 * @method _updateForExec
 * @api private
 * @receiver Query
 */
Query.prototype._updateForExec = function () {
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
 * @method _optionsForExec
 * @param {Model} model
 * @api private
 */
Query.prototype._optionsForExec = function (model) {
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

const setSafe = util.deprecate(function setSafe (options, safe) {
  options.safe = safe;
}, safeDeprecationWarning);

/**
 * @method lean
 * @param {Boolean|Object} bool defaults to true
 * @return {Query} this
 * @api public
 */
Query.prototype.lean = function (v) {
  this._mongooseOptions.lean = arguments.length ? v : true;
  return this;
};

/**
 * @method set
 * @param {String|Object} path path or object of key/value pairs to set
 * @param {Any} [val] the value to set
 * @return {Query} this
 * @api public
 */
Query.prototype.set = function (path, val) {
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
 * @method get
 * @param {String|Object} path path or object of key/value pairs to get
 * @return {Query} this
 * @api public
 */
Query.prototype.get = function get (path) {
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
 * @method error
 * @param {Error|null} err
 * @return {Query} this
 * @api public
 */
Query.prototype.error = function error (err) {
  if (arguments.length === 0) {
    return this._error;
  }

  this._error = err;
  return this;
};

/*!
 * ignore
 */

Query.prototype._unsetCastError = function _unsetCastError () {
  if (this._error != null && !(this._error instanceof CastError)) {
    return;
  }
  return this.error(null);
};

/**
 * @method mongooseOptions
 * @param {Object} options if specified, overwrites the current options
 * @return {Object} the options
 * @api public
 */
Query.prototype.mongooseOptions = function (v) {
  if (arguments.length > 0) {
    this._mongooseOptions = v;
  }
  return this._mongooseOptions;
};

/*!
 * ignore
 */

Query.prototype._castConditions = function () {
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

function _castArrayFilters (query) {
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
Query.prototype._find = wrapThunk(function (callback) {
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
    _this.model.populate(docs, pop, function (err, docs) {
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

/**
 * @method find
 * @param {Object|ObjectId} [filter]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.find = function (conditions, callback) {
  this.op = 'find';

  if (typeof conditions === 'function') {
    callback = conditions;
    conditions = {};
  }

  conditions = utils.toObject(conditions);

  if (mquery.canMerge(conditions)) {
    this.merge(conditions);
    prepareDiscriminatorCriteria(this);
  } else if (conditions != null) {
    this.error(new ObjectParameterError(conditions, 'filter', 'find'));
  }

  // if we don't have a callback, then just return the query object
  if (!callback) {
    return Query.base.find.call(this);
  }

  this.exec(callback);

  return this;
};

/**
 * @method merge
 * @param {Query|Object} source
 * @return {Query} this
 */
Query.prototype.merge = function (source) {
  if (!source) {
    return this;
  }

  const opts = { overwrite: true };

  if (source instanceof Query) {
    // if source has a feature, apply it to ourselves

    if (source._conditions) {
      utils.merge(this._conditions, source._conditions, opts);
    }

    if (source._fields) {
      this._fields || (this._fields = {});
      utils.merge(this._fields, source._fields, opts);
    }

    if (source.options) {
      this.options || (this.options = {});
      utils.merge(this.options, source.options, opts);
    }

    if (source._update) {
      this._update || (this._update = {});
      utils.mergeClone(this._update, source._update);
    }

    if (source._distinct) {
      this._distinct = source._distinct;
    }

    utils.merge(this._mongooseOptions, source._mongooseOptions);

    return this;
  }

  // plain object
  utils.merge(this._conditions, source, opts);

  return this;
};

/**
 * @method collation
 * @param {Object} value
 * @return {Query} this
 * @api public
 */
Query.prototype.collation = function (value) {
  if (this.options == null) {
    this.options = {};
  }
  this.options.collation = value;
  return this;
};

/**
 * @method _completeOne
 * @private
 */
Query.prototype._completeOne = function (doc, res, callback) {
  if (!doc && !this.options.rawResult) {
    return callback(null, null);
  }

  const model = this.model;
  const projection = utils.clone(this._fields);
  const userProvidedFields = this._userProvidedFields || {};
  // `populate`, `lean`
  const mongooseOptions = this._mongooseOptions;
  // `rawResult`
  const options = this.options;

  if (options.explain) {
    return callback(null, doc);
  }

  if (!mongooseOptions.populate) {
    return mongooseOptions.lean ?
      _completeOneLean(doc, res, options, callback) :
      completeOne(model, doc, res, options, projection, userProvidedFields,
        null, callback);
  }

  const pop = helpers.preparePopulationOptionsMQ(this, this._mongooseOptions);
  model.populate(doc, pop, (err, doc) => {
    if (err) {
      return callback(err);
    }
    return mongooseOptions.lean ?
      _completeOneLean(doc, res, options, callback) :
      completeOne(model, doc, res, options, projection, userProvidedFields,
        pop, callback);
  });
};

/**
 * Thunk around findOne()
 *
 * @param {Function} [callback]
 * @see findOne http://docs.mongodb.org/manual/reference/method/db.collection.findOne/
 * @api private
 */
Query.prototype._findOne = wrapThunk(function (callback) {
  this._castConditions();

  if (this.error()) {
    callback(this.error());
    return null;
  }

  this._applyPaths();
  this._fields = this._castFields(this._fields);

  applyGlobalMaxTimeMS(this.options, this.model);

  // don't pass in the conditions because we already merged them in
  Query.base.findOne.call(this, {}, (err, doc) => {
    if (err) {
      callback(err);
      return null;
    }

    this._completeOne(doc, null, _wrapThunkCallback(this, callback));
  });
});

/**
 * @method findOne
 * @param {Object} [filter]
 * @param {Object} [projection]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.findOne = function (conditions, projection, options, callback) {
  // Normalize arguments using the helper.
  const { criteria, projection: proj, options: opts, callback: cb } = normalizeQueryArgs(arguments, {
    criteria: conditions,
    projection,
    options,
    callback
  });

  this.op = 'findOne';
  // make sure we don't send in the whole Document to merge()
  const filter = utils.toObject(criteria);

  if (opts) {
    this.setOptions(opts);
  }

  if (proj) {
    this.select(proj);
  }

  if (mquery.canMerge(filter)) {
    this.merge(filter);
    prepareDiscriminatorCriteria(this);
  } else if (filter != null) {
    this.error(new ObjectParameterError(filter, 'filter', 'findOne'));
  }

  if (!cb) {
    // already merged in the conditions, don't need to send them in.
    return Query.base.findOne.call(this);
  }

  this.exec(cb);
  return this;
};

/**
 * Thunk around count()
 *
 * @param {Function} [callback]
 * @see count http://docs.mongodb.org/manual/reference/method/db.collection.count/
 * @api private
 */
Query.prototype._count = wrapThunk(function (callback) {
  try {
    this.cast(this.model);
  } catch (err) {
    this.error(err);
  }

  if (this.error()) {
    return callback(this.error());
  }

  applyGlobalMaxTimeMS(this.options, this.model);

  const conds = this._conditions;
  const options = this._optionsForExec();

  this._collection.count(conds, options, utils.tick(callback));
});

/**
 * Thunk around countDocuments()
 *
 * @param {Function} [callback]
 * @see countDocuments http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#countDocuments
 * @api private
 */
Query.prototype._countDocuments = wrapThunk(function (callback) {
  try {
    this.cast(this.model);
  } catch (err) {
    this.error(err);
  }

  if (this.error()) {
    return callback(this.error());
  }

  applyGlobalMaxTimeMS(this.options, this.model);

  const conds = this._conditions;
  const options = this._optionsForExec();

  this._collection.collection.countDocuments(conds, options, utils.tick(callback));
});

/**
 * Thunk around estimatedDocumentCount()
 *
 * @param {Function} [callback]
 * @see estimatedDocumentCount http://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#estimatedDocumentCount
 * @api private
 */
Query.prototype._estimatedDocumentCount = wrapThunk(function (callback) {
  if (this.error()) {
    return callback(this.error());
  }

  const options = this._optionsForExec();

  this._collection.collection.estimatedDocumentCount(options, utils.tick(callback));
});

/**
 * @method count
 * @param {Object} [filter]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.count = function (filter, callback) {
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
 * @method estimatedDocumentCount
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.estimatedDocumentCount = function (options, callback) {
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
 * @method countDocuments
 * @param {Object} [filter]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.countDocuments = function (conditions, callback) {
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
Query.prototype.__distinct = wrapThunk(function __distinct (callback) {
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
 * @method distinct
 * @param {String} [field]
 * @param {Object|Query} [filter]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.distinct = function (field, conditions, callback) {
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
 * @method sort
 * @param {Object|String} arg
 * @return {Query} this
 * @api public
 */
Query.prototype.sort = function (arg) {
  if (arguments.length > 1) {
    throw new Error('sort() only takes 1 Argument');
  }

  return Query.base.sort.call(this, arg);
};

/**
 * @method remove
 * @param {Object|Query} [filter]
 * @param {Function} [callback]
 * @return {Query} this
 * @deprecated
 * @api public
 */
Query.prototype.remove = function (filter, callback) {
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

Query.prototype._remove = wrapThunk(function (callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return this;
  }

  callback = _wrapThunkCallback(this, callback);

  return Query.base.remove.call(this, helpers.handleDeleteWriteOpResult(callback));
});

/**
 * @method deleteOne
 * @param {Object|Query} [filter]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.deleteOne = function (filter, options, callback) {
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

  this.exec(callback);

  return this;
};

/*!
 * Internal thunk for `deleteOne()`
 */

Query.prototype._deleteOne = wrapThunk(function (callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return this;
  }

  callback = _wrapThunkCallback(this, callback);

  return Query.base.deleteOne.call(this, helpers.handleDeleteWriteOpResult(callback));
});

/**
 * @method deleteMany
 * @param {Object|Query} [filter]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.deleteMany = function (filter, options, callback) {
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

  this.exec(callback);

  return this;
};

/*!
 * Internal thunk around `deleteMany()`
 */

Query.prototype._deleteMany = wrapThunk(function (callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return this;
  }

  callback = _wrapThunkCallback(this, callback);

  return Query.base.deleteMany.call(this, helpers.handleDeleteWriteOpResult(callback));
});

/**
 * @method populate
 * @param {Object|String} path
 * @return {Query} this
 * @api public
 */
Query.prototype.populate = function () {
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
 * @method getPopulatedPaths
 * @return {Array}
 * @api public
 */
Query.prototype.getPopulatedPaths = function getPopulatedPaths () {
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

function _getPopulatedPaths (list, arr, prefix) {
  for (const pop of arr) {
    list.push(prefix + pop.path);
    if (!Array.isArray(pop.populate)) {
      continue;
    }
    _getPopulatedPaths(list, pop.populate, prefix + pop.path + '.');
  }
}

/**
 * @method cast
 * @param {Model} [model]
 * @param {Object} [obj]
 * @return {Object}
 * @api public
 */
Query.prototype.cast = function (model, obj) {
  obj || (obj = this._conditions);

  model = model || this.model;
  const discriminatorKey = model.schema.options.discriminatorKey;
  if (obj != null &&
      obj.hasOwnProperty(discriminatorKey)) {
    model = getDiscriminatorByValue(model.discriminators, obj[discriminatorKey]) || model;
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
 * @method _castFields
 * @param {Object} fields
 * @api private
 */
Query.prototype._castFields = function _castFields (fields) {
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
 * @method _applyPaths
 * @api private
 */
Query.prototype._applyPaths = function applyPaths () {
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
 * @method cursor
 * @param {Object} [options]
 * @return {QueryCursor}
 * @api public
 */
Query.prototype.cursor = function cursor (opts) {
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

/**
 * @method maxscan
 * @deprecated
 */
Query.prototype.maxscan = Query.base.maxScan;

/**
 * @method tailable
 * @param {Boolean} [val]
 * @param {Object} [opts]
 * @return {Query}
 * @api public
 */
Query.prototype.tailable = function (val, opts) {
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
 * @method near
 * @return {Query}
 */
Query.prototype.near = function () {
  const params = [];
  const sphere = this._mongooseOptions.nearSphere;

  // TODO refactor

  if (arguments.length === 1) {
    if (Array.isArray(arguments[0])) {
      params.push({ center: arguments[0], spherical: sphere });
    } else if (typeof arguments[0] === 'string') {
      // just passing a path
      params.push(arguments[0]);
    } else if (utils.isObject(arguments[0])) {
      if (typeof arguments[0].spherical !== 'boolean') {
        arguments[0].spherical = sphere;
      }
      params.push(arguments[0]);
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (arguments.length === 2) {
    if (typeof arguments[0] === 'number' && typeof arguments[1] === 'number') {
      params.push({ center: [arguments[0], arguments[1]], spherical: sphere });
    } else if (typeof arguments[0] === 'string' && Array.isArray(arguments[1])) {
      params.push(arguments[0]);
      params.push({ center: arguments[1], spherical: sphere });
    } else if (typeof arguments[0] === 'string' && utils.isObject(arguments[1])) {
      params.push(arguments[0]);
      if (typeof arguments[1].spherical !== 'boolean') {
        arguments[1].spherical = sphere;
      }
      params.push(arguments[1]);
    } else {
      throw new TypeError('invalid argument');
    }
  } else if (arguments.length === 3) {
    if (typeof arguments[0] === 'string' && typeof arguments[1] === 'number'
        && typeof arguments[2] === 'number') {
      params.push(arguments[0]);
      params.push({ center: [arguments[1], arguments[2]], spherical: sphere });
    } else {
      throw new TypeError('invalid argument');
    }
  } else {
    throw new TypeError('invalid argument');
  }

  return Query.base.near.apply(this, params);
};

/**
 * @method nearSphere
 * @return {Query}
 */
Query.prototype.nearSphere = function () {
  this._mongooseOptions.nearSphere = true;
  this.near.apply(this, arguments);
  return this;
};

/**
 * @method box
 * @param {Array|Object} ll
 * @param {Array} [ur]
 * @return {Query}
 */
Query.prototype.box = function (ll, ur) {
  if (!Array.isArray(ll) && utils.isObject(ll)) {
    ur = ll.ur;
    ll = ll.ll;
  }
  return Query.base.box.call(this, ll, ur);
};

/**
 * @method center
 * @return {Query}
 */
Query.prototype.center = Query.base.circle;

/**
 * @method centerSphere
 * @return {Query}
 */
Query.prototype.centerSphere = function () {
  if (arguments[0] != null && typeof arguments[0].constructor === 'function' && arguments[0].constructor.name === 'Object') {
    arguments[0].spherical = true;
  }

  if (arguments[1] != null && typeof arguments[1].constructor === 'function' && arguments[1].constructor.name === 'Object') {
    arguments[1].spherical = true;
  }

  Query.base.circle.apply(this, arguments);
};

/**
 * @method selectedInclusively
 * @return {Boolean}
 */
Query.prototype.selectedInclusively = function selectedInclusively () {
  return isInclusive(this._fields);
};

/**
 * @method selectedExclusively
 * @return {Boolean}
 */
Query.prototype.selectedExclusively = function selectedExclusively () {
  return isExclusive(this._fields);
};

/**
 * @method orFail
 * @param {Function|Error} [err]
 * @return {Query} this
 */
Query.prototype.orFail = function (err) {
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

function _orFailError (err, query) {
  if (typeof err === 'function') {
    err = err.call(query);
  }

  if (err == null) {
    err = new DocumentNotFoundError(query.getQuery(), query.model.modelName);
  }

  return err;
}

/**
 * @method exec
 * @param {String|Function} [operation]
 * @param {Function} [callback]
 * @return {Promise}
 * @api public
 */
Query.prototype.exec = function exec (op, callback) {
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

function _cleanCastErrorStack (castError, error) {
  if (error instanceof CastError) {
    castError.copy(error);
    return castError;
  }

  return error;
}

/*!
 * ignore
 */

function _wrapThunkCallback (query, cb) {
  return function (error, res) {
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
 * @method then
 * @param {Function} [resolve]
 * @param {Function} [reject]
 * @return {Promise}
 * @api public
 */
Query.prototype.then = function (resolve, reject) {
  return this.exec().then(resolve, reject);
};

/**
 * @method catch
 * @param {Function} [reject]
 * @return {Promise}
 * @api public
 */
Query.prototype.catch = function (reject) {
  return this.exec().then(null, reject);
};

/**
 * @method pre
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */
Query.prototype.pre = function (fn) {
  this._hooks.pre('exec', fn);
  return this;
};

/**
 * @method post
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */
Query.prototype.post = function (fn) {
  this._hooks.post('exec', fn);
  return this;
};

/**
 * @method _castUpdate
 * @param {Object} obj
 * @param {Boolean} overwrite
 * @return {Object}
 * @api private
 */
Query.prototype._castUpdate = function _castUpdate (obj, overwrite) {
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

function castQuery (query) {
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

function castDoc (query, overwrite) {
  try {
    return query._castUpdate(query._update, overwrite);
  } catch (err) {
    return err;
  }
}

/**
 * @method populate
 * @param {Object|String} path
 * @return {Query} this
 * @api public
 */
Query.prototype.populate = function () {
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
 * @method findOneAndUpdate
 * @param {Object|Function} [criteria]
 * @param {Object|Function} [doc]
 * @param {Object|Function} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.findOneAndUpdate = function (criteria, doc, options, callback) {
  // Normalize arguments using the helper.
  const { criteria: crit, doc: upd, options: opts, callback: cb } = normalizeQueryArgs(arguments, {
    criteria,
    doc,
    options,
    callback
  });

  this.op = 'findOneAndUpdate';
  this._validate();

  if (mquery.canMerge(crit)) {
    this.merge(crit);
  }

  // apply doc
  if (upd) {
    this._mergeUpdate(upd);
  }

  const finalOpts = opts ? utils.clone(opts) : {};

  if (finalOpts.projection) {
    this.select(finalOpts.projection);
    delete finalOpts.projection;
  }
  if (finalOpts.fields) {
    this.select(finalOpts.fields);
    delete finalOpts.fields;
  }

  const returnOriginal = get(this, 'model.base.options.returnOriginal');
  if (finalOpts.new == null && finalOpts.returnDocument == null && finalOpts.returnOriginal == null && returnOriginal != null) {
    finalOpts.returnOriginal = returnOriginal;
  }

  this.setOptions(finalOpts);

  if (!cb) {
    return this;
  }

  this.exec(cb);

  return this;
};

/**
 * @method findOneAndReplace
 * @param {Object|Function} [filter]
 * @param {Object|Function} [replacement]
 * @param {Object|Function} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.findOneAndReplace = function (filter, replacement, options, callback) {
  // Normalize arguments using the helper.
  const { criteria: crit, doc: repl, options: opts, callback: cb } = normalizeQueryArgs(arguments, {
    criteria: filter,
    doc: replacement,
    options,
    callback
  });

  this.op = 'findOneAndReplace';
  this._validate();

  if (mquery.canMerge(crit)) {
    this.merge(crit);
  }

  if (repl != null) {
    if (hasDollarKeys(repl)) {
      throw new Error('The replacement document must not contain atomic operators.');
    }
    this._mergeUpdate(repl);
  }

  const finalOpts = opts ? utils.clone(opts) : {};

  const returnOriginal = get(this, 'model.base.options.returnOriginal');
  if (finalOpts.new == null && finalOpts.returnDocument == null && finalOpts.returnOriginal == null && returnOriginal != null) {
    finalOpts.returnOriginal = returnOriginal;
  }
  this.setOptions(finalOpts);
  this.setOptions({ overwrite: true });

  if (!cb) {
    return this;
  }

  this.exec(cb);

  return this;
};

/**
 * @method findOneAndRemove
 * @param {Object|Function} [conditions]
 * @param {Object|Function} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.findOneAndRemove = function (conditions, options, callback) {
  // Normalize arguments using the helper.
  const { criteria: crit, options: opts, callback: cb } = normalizeQueryArgs(arguments, {
    criteria: conditions,
    options,
    callback
  });

  this.op = 'findOneAndRemove';
  this._validate();

  if (mquery.canMerge(crit)) {
    this.merge(crit);
  }

  if (opts) {
    this.setOptions(opts);
  }

  if (!cb) {
    return this;
  }

  this.exec(cb);

  return this;
};

/**
 * @method findOneAndDelete
 * @param {Object|Function} [conditions]
 * @param {Object|Function} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.findOneAndDelete = function (conditions, options, callback) {
  // Normalize arguments using the helper.
  const { criteria: crit, options: opts, callback: cb } = normalizeQueryArgs(arguments, {
    criteria: conditions,
    options,
    callback
  });

  this.op = 'findOneAndDelete';
  this._validate();

  if (mquery.canMerge(crit)) {
    this.merge(crit);
  }

  if (opts) {
    this.setOptions(opts);
  }

  if (!cb) {
    return this;
  }

  this.exec(cb);

  return this;
};

/**
 * Thunk around findOneAndUpdate()
 *
 * @param {Function} [callback]
 * @api private
 */
Query.prototype._findOneAndUpdate = wrapThunk(function (callback) {
  if (this.error() != null) {
    return callback(this.error());
  }

  this._findAndModify('update', callback);
});

/**
 * Thunk around findOneAndRemove()
 *
 * @param {Function} [callback]
 * @return {Query} this
 * @api private
 */
Query.prototype._findOneAndRemove = wrapThunk(function (callback) {
  if (this.error() != null) {
    callback(this.error());
    return;
  }

  this._findAndModify('remove', callback);
});

/**
 * Thunk around findOneAndDelete()
 *
 * @param {Function} [callback]
 * @return {Query} this
 * @api private
 */
Query.prototype._findOneAndDelete = wrapThunk(function (callback) {
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
 * @method _findAndModify
 * @param {String} type - either "remove" or "update"
 * @param {Function} callback
 * @api private
 */
Query.prototype._findAndModify = function (type, callback) {
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

  const cb = function (err, doc, res) {
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
      collection.findOneAndDelete(castedQuery, opts, _wrapThunkCallback(_this, function (error, res) {
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

        collection[updateMethod](castedQuery, this._update, opts, _wrapThunkCallback(_this, function (error, res) {
          return cb(error, res ? res.value : res, res);
        }));
      });
    } else {
      if (this._update && this._update.toBSON) {
        this._update = this._update.toBSON();
      }
      collection[updateMethod](castedQuery, this._update, opts, _wrapThunkCallback(_this, function (error, res) {
        return cb(error, res ? res.value : res, res);
      }));
    }

    return this;
  }

  if (runValidators) {
    this.validate(this._update, opts, isOverwriting, function (error) {
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

function _completeOneLean (doc, res, opts, callback) {
  if (opts.rawResult) {
    return callback(null, res);
  }
  return callback(null, doc);
}

/*!
 * ignore
 */

const _legacyFindAndModify = util.deprecate(function (filter, update, opts, cb) {
  if (update && update.toBSON) {
    update = update.toBSON();
  }
  const collection = this._collection;
  const sort = opts != null && Array.isArray(opts.sort) ? opts.sort : [];
  const _cb = _wrapThunkCallback(this, function (error, res) {
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
Query.prototype._mergeUpdate = function (doc) {
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
function convertSortToArray (opts) {
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

function _updateThunk (op, callback) {
  this._castConditions();

  _castArrayFilters(this);

  if (this.error() != null) {
    callback(this.error());
    return null;
  }

  callback = _wrapThunkCallback(this, callback);
  const oldCb = callback;
  callback = function (error, result) {
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
Query.prototype.validate = function validate (castedDoc, options, isOverwriting, callback) {
  return promiseOrCallback(callback, cb => {
    try {
      if (isOverwriting) {
        castedDoc.validate(cb);
      } else {
        updateValidators(this, this.model.schema, castedDoc, options, cb);
      }
    } catch (err) {
      immediate(function () {
        cb(err);
      });
    }
  });
};

/**
 * @method _execUpdate
 * @param {Function} callback
 * @api private
 */
Query.prototype._execUpdate = wrapThunk(function (callback) {
  return _updateThunk.call(this, 'update', callback);
});

/**
 * @method _updateMany
 * @param {Function} callback
 * @api private
 */
Query.prototype._updateMany = wrapThunk(function (callback) {
  return _updateThunk.call(this, 'updateMany', callback);
});

/**
 * @method _updateOne
 * @param {Function} callback
 * @api private
 */
Query.prototype._updateOne = wrapThunk(function (callback) {
  return _updateThunk.call(this, 'updateOne', callback);
});

/**
 * @method _replaceOne
 * @param {Function} callback
 * @api private
 */
Query.prototype._replaceOne = wrapThunk(function (callback) {
  return _updateThunk.call(this, 'replaceOne', callback);
});

/**
 * @method update
 * @param {Object} [filter]
 * @param {Object} [doc] the update command
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.update = function (conditions, doc, options, callback) {
  const { criteria, doc: upd, options: opts, callback: cb } = normalizeQueryArgs(arguments, {
    criteria: conditions,
    doc,
    options,
    callback
  });

  return _update(this, 'update', criteria, upd, opts, cb);
};

/**
 * @method updateMany
 * @param {Object} [filter]
 * @param {Object|Array} [update]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.updateMany = function (conditions, doc, options, callback) {
  const { criteria, doc: upd, options: opts, callback: cb } = normalizeQueryArgs(arguments, {
    criteria: conditions,
    doc,
    options,
    callback
  });

  return _update(this, 'updateMany', criteria, upd, opts, cb);
};

/**
 * @method updateOne
 * @param {Object} [filter]
 * @param {Object|Array} [update]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.updateOne = function (conditions, doc, options, callback) {
  const { criteria, doc: upd, options: opts, callback: cb } = normalizeQueryArgs(arguments, {
    criteria: conditions,
    doc,
    options,
    callback
  });

  return _update(this, 'updateOne', criteria, upd, opts, cb);
};

/**
 * @method replaceOne
 * @param {Object} [filter]
 * @param {Object} [doc]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */
Query.prototype.replaceOne = function (conditions, doc, options, callback) {
  const { criteria, doc: repl, options: opts, callback: cb } = normalizeQueryArgs(arguments, {
    criteria: conditions,
    doc,
    options,
    callback
  });

  this.setOptions({ overwrite: true });
  return _update(this, 'replaceOne', criteria, repl, opts, cb);
};

/*!
 * Internal helper for update, updateMany, updateOne, replaceOne
 */
function _update (query, op, filter, doc, options, callback) {
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
 * @method map
 * @param {Function} fn function to run to transform the query result
 * @return {Query} this
 */
Query.prototype.map = function (fn) {
  this._transforms.push(fn);
  return this;
};

/**
 * @method orFail
 * @param {Function|Error} [err] optional error to throw if no docs match `filter`.
 * @return {Query} this
 */
Query.prototype.orFail = function (err) {
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
function _orFailError (err, query) {
  if (typeof err === 'function') {
    err = err.call(query);
  }

  if (err == null) {
    err = new DocumentNotFoundError(query.getQuery(), query.model.modelName);
  }

  return err;
}

/**
 * @method exec
 * @param {String|Function} [operation]
 * @param {Function} [callback] optional params depend on the function being called
 * @return {Promise}
 * @api public
 */
Query.prototype.exec = function exec (op, callback) {
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
function _cleanCastErrorStack (castError, error) {
  if (error instanceof CastError) {
    castError.copy(error);
    return castError;
  }

  return error;
}

/*!
 * ignore
 */
function _wrapThunkCallback (query, cb) {
  return function (error, res) {
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
 * @method then
 * @param {Function} [resolve]
 * @param {Function} [reject]
 * @return {Promise}
 * @api public
 */
Query.prototype.then = function (resolve, reject) {
  return this.exec().then(resolve, reject);
};

/**
 * @method catch
 * @param {Function} [reject]
 * @return {Promise}
 * @api public
 */
Query.prototype.catch = function (reject) {
  return this.exec().then(null, reject);
};

/**
 * @method pre
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */
Query.prototype.pre = function (fn) {
  this._hooks.pre('exec', fn);
  return this;
};

/**
 * @method post
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */
Query.prototype.post = function (fn) {
  this._hooks.post('exec', fn);
  return this;
};

/**
 * @method _castUpdate
 * @param {Object} obj
 * @param {Boolean} overwrite
 * @return {Object}
 * @api private
 */
Query.prototype._castUpdate = function _castUpdate (obj, overwrite) {
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
 * Export
 */
module.exports = Query;
```