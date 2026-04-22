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
 * @api public
 */
Query.use$geoWithin = mquery.use$geoWithin;

/**
 * Helper to parse arguments for methods that accept
 * (filter, doc, options, callback) in any order.
 *
 * @param {Array} args
 * @returns {{filter: Object|undefined, doc: Object|undefined, options: Object|undefined, callback: Function|undefined}}
 */
function parseFilterDocOptions(args) {
  let filter, doc, options, callback;

  if (typeof args[0] === 'function') {
    callback = args[0];
    return { callback };
  }

  filter = args[0];
  if (typeof args[1] === 'function') {
    callback = args[1];
    return { filter, callback };
  }

  doc = args[1];
  if (typeof args[2] === 'function') {
    callback = args[2];
    return { filter, doc, callback };
  }

  options = args[2];
  if (typeof args[3] === 'function') {
    callback = args[3];
  }

  return { filter, doc, options, callback };
}

/**
 * Converts this query to a customized, reusable query constructor with all arguments and options retained.
 *
 * @return {Query} subclass-of-Query
 * @api public
 */
Query.prototype.toConstructor = function toConstructor() {
  const model = this.model;
  const coll = this.mongooseCollection;

  const CustomQuery = function (criteria, options) {
    if (!(this instanceof CustomQuery)) {
      return new CustomQuery(criteria, options);
    }
    this._mongooseOptions = utils.clone(p._mongooseOptions);
    Query.call(this, criteria, options || null, model, coll);
  };

  util.inherits(CustomQuery, model.Query);
  const p = CustomQuery.prototype;
  p.options = {};

  const opts = Object.assign({}, this.options);
  if (opts.sort != null) {
    p.sort(opts.sort);
    delete opts.sort;
  }
  p.setOptions(opts);
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
 * @method $where
 * @memberOf Query
 * @instance
 * @param {String|Function} js javascript string or function
 * @return {Query} this
 * @api public
 */

/**
 * @method where
 * @memberOf Query
 * @instance
 * @param {String|Object} [path]
 * @param {any} [val]
 * @return {Query} this
 * @api public
 */

/**
 * @method slice
 * @memberOf Query
 * @instance
 * @param {String} [path]
 * @param {Number} val number/range of elements to slice
 * @return {Query} this
 * @api public
 */
Query.prototype.slice = function () {
  if (!arguments.length) return this;
  this._validate('slice');

  let path, val;
  if (arguments.length === 1) {
    const arg = arguments[0];
    if (typeof arg === 'object' && !Array.isArray(arg)) {
      const keys = Object.keys(arg);
      for (const k of keys) this.slice(k, arg[k]);
      return this;
    }
    this._ensurePath('slice');
    path = this._path;
    val = arg;
  } else if (arguments.length === 2) {
    if (typeof arguments[0] === 'number') {
      this._ensurePath('slice');
      path = this._path;
      val = slice(arguments);
    } else {
      path = arguments[0];
      val = arguments[1];
    }
  } else {
    path = arguments[0];
    val = slice(arguments, 1);
  }

  this.select({ [path]: { $slice: val } });
  return this;
};

/**
 * @method read
 * @memberOf Query
 * @instance
 * @param {String} pref
 * @param {Array} [tags]
 * @return {Query} this
 * @api public
 */
Query.prototype.read = function read(pref, tags) {
  this.options.readPreference = new ReadPreference(pref, tags);
  return this;
};

/**
 * @method session
 * @memberOf Query
 * @instance
 * @param {ClientSession} [session]
 * @return {Query} this
 * @api public
 */
Query.prototype.session = function session(v) {
  if (v == null) delete this.options.session;
  this.options.session = v;
  return this;
};

/**
 * @method writeConcern
 * @memberOf Query
 * @instance
 * @param {Object} val
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
  if (val == null) delete this.options.w;
  if (this.options.writeConcern) this.options.writeConcern.w = val;
  else this.options.w = val;
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
  if (val == null) delete this.options.j;
  if (this.options.writeConcern) this.options.writeConcern.j = val;
  else this.options.j = val;
  return this;
};

/**
 * @method wtimeout
 * @memberOf Query
 * @instance
 * @param {number} ms
 * @return {Query} this
 * @api public
 */
Query.prototype.wtimeout = function wtimeout(ms) {
  if (ms == null) delete this.options.wtimeout;
  if (this.options.writeConcern) this.options.writeConcern.wtimeout = ms;
  else this.options.wtimeout = ms;
  return this;
};

/**
 * @method getOptions
 * @memberOf Query
 * @instance
 * @return {Object}
 * @api public
 */
Query.prototype.getOptions = function () {
  return this.options;
};

/**
 * @method setOptions
 * @memberOf Query
 * @instance
 * @param {Object} options
 * @return {Query} this
 * @api public
 */
Query.prototype.setOptions = function (options, overwrite) {
  if (overwrite) {
    this._mongooseOptions = (options && utils.clone(options)) || {};
    this.options = options || {};

    if ('populate' in options) this.populate(this._mongooseOptions);
    return this;
  }
  if (!options) return this;
  if (typeof options !== 'object') throw new Error('Options must be an object');

  if (Array.isArray(options.populate)) {
    const populate = options.populate;
    delete options.populate;
    for (const p of populate) this.populate(p);
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
  if ('defaults' in options) this._mongooseOptions.defaults = options.defaults;

  return Query.base.setOptions.call(this, options);
};

/**
 * @method explain
 * @memberOf Query
 * @instance
 * @param {String} [verbose]
 * @return {Query} this
 * @api public
 */
Query.prototype.explain = function (verbose) {
  if (!arguments.length) this.options.explain = true;
  else if (verbose === false) delete this.options.explain;
  else this.options.explain = verbose;
  return this;
};

/**
 * @method allowDiskUse
 * @memberOf Query
 * @instance
 * @param {Boolean} [v]
 * @return {Query} this
 * @api public
 */
Query.prototype.allowDiskUse = function (v) {
  if (!arguments.length) this.options.allowDiskUse = true;
  else if (v === false) delete this.options.allowDiskUse;
  else this.options.allowDiskUse = v;
  return this;
};

/**
 * @method maxTimeMS
 * @memberOf Query
 * @instance
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
 * @memberOf Query
 * @instance
 * @return {Object}
 * @api public
 */
Query.prototype.getFilter = function () {
  return this._conditions;
};

/**
 * @method getQuery
 * @memberOf Query
 * @instance
 * @return {Object}
 * @api public
 */
Query.prototype.getQuery = function () {
  return this._conditions;
};

/**
 * @method setQuery
 * @memberOf Query
 * @instance
 * @param {Object} val
 * @api public
 */
Query.prototype.setQuery = function (val) {
  this._conditions = val;
};

/**
 * @method getUpdate
 * @memberOf Query
 * @instance
 * @return {Object}
 * @api public
 */
Query.prototype.getUpdate = function () {
  return this._update;
};

/**
 * @method setUpdate
 * @memberOf Query
 * @instance
 * @param {Object} val
 * @api public
 */
Query.prototype.setUpdate = function (val) {
  this._update = val;
};

/**
 * @method _fieldsForExec
 * @private
 */
Query.prototype._fieldsForExec = function () {
  return utils.clone(this._fields);
};

/**
 * @method _updateForExec
 * @private
 */
Query.prototype._updateForExec = function () {
  const update = utils.clone(this._update, { transform: false, depopulate: true });
  const ops = Object.keys(update);
  const ret = {};

  for (let i = ops.length - 1; i >= 0; --i) {
    const op = ops[i];
    if (this.options.overwrite) {
      ret[op] = update[op];
      continue;
    }
    if (op[0] !== '$') {
      if (!ret.$set) ret.$set = update.$set || {};
      ret.$set[op] = update[op];
      ops.splice(i, 1);
      if (!~ops.indexOf('$set')) ops.push('$set');
    } else if (op === '$set') {
      if (!ret.$set) ret[op] = update[op];
    } else {
      ret[op] = update[op];
    }
  }
  return ret;
};

/**
 * @method _optionsForExec
 * @private
 */
Query.prototype._optionsForExec = function (model) {
  const options = utils.clone(this.options);
  delete options.populate;
  model = model || this.model;
  if (!model) return options;

  const safe = get(model, 'schema.options.safe', null);
  if (!('safe' in options) && safe != null) setSafe(options, safe);

  applyWriteConcern(model.schema, options);
  const readPreference = get(model, 'schema.options.read');
  if (!('readPreference' in options) && readPreference) options.readPreference = readPreference;

  if (options.upsert !== void 0) options.upsert = !!options.upsert;
  if (options.writeConcern) {
    if (options.j) options.writeConcern.j = options.j, delete options.j;
    if (options.w) options.writeConcern.w = options.w, delete options.w;
    if (options.wtimeout) options.writeConcern.wtimeout = options.wtimeout, delete options.wtimeout;
  }
  return options;
};

/* safe deprecation */
const safeDeprecationWarning = 'Mongoose: the `safe` option is deprecated. Use write concerns instead: http://bit.ly/mongoose-w';
const setSafe = util.deprecate(function setSafe(options, safe) {
  options.safe = safe;
}, safeDeprecationWarning);

/**
 * @method lean
 * @memberOf Query
 * @instance
 * @param {Boolean|Object} v
 * @return {Query} this
 * @api public
 */
Query.prototype.lean = function (v) {
  this._mongooseOptions.lean = arguments.length ? v : true;
  return this;
};

/**
 * @method set
 * @memberOf Query
 * @instance
 * @param {String|Object} path
 * @param {Any} [val]
 * @return {Query} this
 * @api public
 */
Query.prototype.set = function (path, val) {
  if (typeof path === 'object') {
    for (const k of Object.keys(path)) this.set(k, path[k]);
    return this;
  }
  this._update = this._update || {};
  this._update.$set = this._update.$set || {};
  this._update.$set[path] = val;
  return this;
};

/**
 * @method get
 * @memberOf Query
 * @instance
 * @param {String|Object} path
 * @return {Query} this
 * @api public
 */
Query.prototype.get = function (path) {
  const update = this._update;
  if (!update) return void 0;
  const $set = update.$set;
  if ($set == null) return update[path];
  if (utils.hasUserDefinedProperty(update, path)) return update[path];
  if (utils.hasUserDefinedProperty($set, path)) return $set[path];
  return void 0;
};

/**
 * @method error
 * @memberOf Query
 * @instance
 * @param {Error|null} err
 * @return {Query} this
 * @api public
 */
Query.prototype.error = function (err) {
  if (!arguments.length) return this._error;
  this._error = err;
  return this;
};

Query.prototype._unsetCastError = function () {
  if (this._error != null && !(this._error instanceof CastError)) return;
  return this.error(null);
};

Query.prototype._castConditions = function () {
  try {
    this.cast(this.model);
    this._unsetCastError();
  } catch (err) {
    this.error(err);
  }
};

function _castArrayFilters(query) {
  try {
    castArrayFilters(query);
  } catch (err) {
    query.error(err);
  }
}

/* ---------- FIND ---------- */
Query.prototype._find = wrapThunk(function (callback) {
  this._castConditions();
  if (this.error() != null) return callback(this.error()), null;

  callback = _wrapThunkCallback(this, callback);
  this._applyPaths();
  this._fields = this._castFields(this._fields);

  const fields = this._fieldsForExec();
  const mongooseOptions = this._mongooseOptions;
  const userProvidedFields = this._userProvidedFields || {};

  applyGlobalMaxTimeMS(this.options, this.model);
  const completeManyOptions = { session: get(this, 'options.session', null) };

  const cb = (err, docs) => {
    if (err) return callback(err);
    if (!docs.length || this.options.explain) return callback(null, docs);
    if (!mongooseOptions.populate) {
      return mongooseOptions.lean ?
        callback(null, docs) :
        completeMany(this.model, docs, fields, userProvidedFields, completeManyOptions, callback);
    }
    const pop = helpers.preparePopulationOptionsMQ(this, mongooseOptions);
    completeManyOptions.populated = pop;
    this.model.populate(docs, pop, (e, d) => {
      if (e) return callback(e);
      return mongooseOptions.lean ?
        callback(null, d) :
        completeMany(this.model, d, fields, userProvidedFields, completeManyOptions, callback);
    });
  };

  const opts = this._optionsForExec();
  opts.projection = this._fieldsForExec();
  this._collection.find(this._conditions, opts, cb);
  return null;
});

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
  if (!callback) return Query.base.find.call(this);
  this.exec(callback);
  return this;
};

/* ---------- MERGE ---------- */
Query.prototype.merge = function (source) {
  if (!source) return this;
  const opts = { overwrite: true };
  if (source instanceof Query) {
    if (source._conditions) utils.merge(this._conditions, source._conditions, opts);
    if (source._fields) {
      this._fields = this._fields || {};
      utils.merge(this._fields, source._fields, opts);
    }
    if (source.options) {
      this.options = this.options || {};
      utils.merge(this.options, source.options, opts);
    }
    if (source._update) {
      this._update = this._update || {};
      utils.mergeClone(this._update, source._update);
    }
    if (source._distinct) this._distinct = source._distinct;
    utils.merge(this._mongooseOptions, source._mongooseOptions);
    return this;
  }
  utils.merge(this._conditions, source, opts);
  return this;
};

/* ---------- COLLATION ---------- */
Query.prototype.collation = function (value) {
  this.options = this.options || {};
  this.options.collation = value;
  return this;
};

/* ---------- _completeOne ---------- */
Query.prototype._completeOne = function (doc, res, callback) {
  if (!doc && !this.options.rawResult) return callback(null, null);
  const model = this.model;
  const projection = utils.clone(this._fields);
  const userProvidedFields = this._userProvidedFields || {};
  const mongooseOptions = this._mongooseOptions;
  const options = this.options;

  if (options.explain) return callback(null, doc);
  if (!mongooseOptions.populate) {
    return mongooseOptions.lean ?
      _completeOneLean(doc, res, options, callback) :
      completeOne(model, doc, res, options, projection, userProvidedFields, null, callback);
  }

  const pop = helpers.preparePopulationOptionsMQ(this, this._mongooseOptions);
  model.populate(doc, pop, (e, d) => {
    if (e) return callback(e);
    return mongooseOptions.lean ?
      _completeOneLean(d, res, options, callback) :
      completeOne(model, d, res, options, projection, userProvidedFields, pop, callback);
  });
};

/* ---------- _findOne ---------- */
Query.prototype._findOne = wrapThunk(function (callback) {
  this._castConditions();
  if (this.error()) return callback(this.error()), null;
  this._applyPaths();
  this._fields = this._castFields(this._fields);
  applyGlobalMaxTimeMS(this.options, this.model);
  Query.base.findOne.call(this, {}, (err, doc) => {
    if (err) return callback(err), null;
    this._completeOne(doc, null, _wrapThunkCallback(this, callback));
  });
});

/* ---------- FIND ONE ---------- */
Query.prototype.findOne = function (conditions, projection, options, callback) {
  this.op = 'findOne';
  if (typeof conditions === 'function') {
    callback = conditions;
    conditions = projection = options = null;
  } else if (typeof projection === 'function') {
    callback = projection;
    projection = options = null;
  } else if (typeof options === 'function') {
    callback = options;
    options = null;
  }

  conditions = utils.toObject(conditions);
  if (options) this.setOptions(options);
  if (projection) this.select(projection);
  if (mquery.canMerge(conditions)) {
    this.merge(conditions);
    prepareDiscriminatorCriteria(this);
  } else if (conditions != null) {
    this.error(new ObjectParameterError(conditions, 'filter', 'findOne'));
  }
  if (!callback) return Query.base.findOne.call(this);
  this.exec(callback);
  return this;
};

/* ---------- COUNT ---------- */
Query.prototype.count = function (filter, callback) {
  this.op = 'count';
  if (typeof filter === 'function') {
    callback = filter;
    filter = undefined;
  }
  filter = utils.toObject(filter);
  if (mquery.canMerge(filter)) this.merge(filter);
  if (!callback) return this;
  this.exec(callback);
  return this;
};

/* ---------- ESTIMATED DOCUMENT COUNT ---------- */
Query.prototype.estimatedDocumentCount = function (options, callback) {
  this.op = 'estimatedDocumentCount';
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  if (typeof options === 'object' && options != null) this.setOptions(options);
  if (!callback) return this;
  this.exec(callback);
  return this;
};

/* ---------- COUNT DOCUMENTS ---------- */
Query.prototype.countDocuments = function (conditions, callback) {
  this.op = 'countDocuments';
  if (typeof conditions === 'function') {
    callback = conditions;
    conditions = undefined;
  }
  conditions = utils.toObject(conditions);
  if (mquery.canMerge(conditions)) this.merge(conditions);
  if (!callback) return this;
  this.exec(callback);
  return this;
};

/* ---------- DISTINCT ---------- */
Query.prototype.__distinct = wrapThunk(function (callback) {
  this._castConditions();
  if (this.error()) return callback(this.error()), null;
  applyGlobalMaxTimeMS(this.options, this.model);
  const opts = this._optionsForExec();
  this._collection.collection.distinct(this._distinct, this._conditions, opts, callback);
});

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
  if (field != null) this._distinct = field;
  if (callback != null) this.exec(callback);
  return this;
};

/* ---------- SORT ---------- */
Query.prototype.sort = function (arg) {
  if (arguments.length > 1) throw new Error('sort() only takes 1 Argument');
  return Query.base.sort.call(this, arg);
};

/* ---------- REMOVE (DEPRECATED) ---------- */
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
  if (!callback) return Query.base.remove.call(this);
  this.exec(callback);
  return this;
};

Query.prototype._remove = wrapThunk(function (callback) {
  this._castConditions();
  if (this.error() != null) return callback(this.error()), this;
  callback = _wrapThunkCallback(this, callback);
  return Query.base.remove.call(this, helpers.handleDeleteWriteOpResult(callback));
});

/* ---------- DELETE ONE ---------- */
Query.prototype.deleteOne = function (filter, options, callback) {
  this.op = 'deleteOne';
  if (typeof filter === 'function') {
    callback = filter;
    filter = options = null;
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
  if (!callback) return Query.base.deleteOne.call(this);
  this.exec(callback);
  return this;
};

Query.prototype._deleteOne = wrapThunk(function (callback) {
  this._castConditions();
  if (this.error() != null) return callback(this.error()), this;
  callback = _wrapThunkCallback(this, callback);
  return Query.base.deleteOne.call(this, helpers.handleDeleteWriteOpResult(callback));
});

/* ---------- DELETE MANY ---------- */
Query.prototype.deleteMany = function (filter, options, callback) {
  this.op = 'deleteMany';
  if (typeof filter === 'function') {
    callback = filter;
    filter = options = null;
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
  if (!callback) return Query.base.deleteMany.call(this);
  this.exec(callback);
  return this;
};

Query.prototype._deleteMany = wrapThunk(function (callback) {
  this._castConditions();
  if (this.error() != null) return callback(this.error()), this;
  callback = _wrapThunkCallback(this, callback);
  return Query.base.deleteMany.call(this, helpers.handleDeleteWriteOpResult(callback));
});

/* ---------- FIND ONE AND UPDATE ---------- */
Query.prototype.findOneAndUpdate = function (criteria, doc, options, callback) {
  this.op = 'findOneAndUpdate';
  this._validate();

  const args = parseFilterDocOptions(arguments);
  criteria = args.filter;
  doc = args.doc;
  options = args.options;
  callback = args.callback;

  if (mquery.canMerge(criteria)) this.merge(criteria);
  if (doc) this._mergeUpdate(doc);
  options = options ? utils.clone(options) : {};

  if (options.projection) this.select(options.projection), delete options.projection;
  if (options.fields) this.select(options.fields), delete options.fields;

  const returnOriginal = get(this, 'model.base.options.returnOriginal');
  if (options.new == null && options.returnDocument == null && options.returnOriginal == null && returnOriginal != null) {
    options.returnOriginal = returnOriginal;
  }
  this.setOptions(options);
  if (!callback) return this;
  this.exec(callback);
  return this;
};

Query.prototype._findOneAndUpdate = wrapThunk(function (callback) {
  if (this.error() != null) return callback(this.error());
  this._findAndModify('update', callback);
});

/* ---------- FIND ONE AND REMOVE ---------- */
Query.prototype.findOneAndRemove = function (conditions, options, callback) {
  this.op = 'findOneAndRemove';
  this._validate();

  const args = parseFilterDocOptions(arguments);
  conditions = args.filter;
  options = args.options;
  callback = args.callback;

  if (mquery.canMerge(conditions)) this.merge(conditions);
  if (options) this.setOptions(options);
  if (!callback) return this;
  this.exec(callback);
  return this;
};

Query.prototype._findOneAndRemove = wrapThunk(function (callback) {
  if (this.error() != null) return callback(this.error());
  this._findAndModify('remove', callback);
});

/* ---------- FIND ONE AND DELETE ---------- */
Query.prototype.findOneAndDelete = function (conditions, options, callback) {
  this.op = 'findOneAndDelete';
  this._validate();

  const args = parseFilterDocOptions(arguments);
  conditions = args.filter;
  options = args.options;
  callback = args.callback;

  if (mquery.canMerge(conditions)) this.merge(conditions);
  if (options) this.setOptions(options);
  if (!callback) return this;
  this.exec(callback);
  return this;
};

Query.prototype._findOneAndDelete = wrapThunk(function (callback) {
  this._castConditions();
  if (this.error() != null) return callback(this.error()), null;
  const filter = this._conditions;
  const opts = this._optionsForExec();
  let fields = null;
  if (this._fields != null) {
    opts.projection = this._castFields(utils.clone(this._fields));
    fields = opts.projection;
    if (fields instanceof Error) return callback(fields), null;
  }
  this._collection.collection.findOneAndDelete(filter, opts, _wrapThunkCallback(this, (err, res) => {
    if (err) return callback(err);
    const doc = res.value;
    return this._completeOne(doc, res, callback);
  }));
});

/* ---------- FIND ONE AND REPLACE ---------- */
Query.prototype.findOneAndReplace = function (filter, replacement, options, callback) {
  this.op = 'findOneAndReplace';
  this._validate();

  const args = parseFilterDocOptions(arguments);
  filter = args.filter;
  replacement = args.doc;
  options = args.options;
  callback = args.callback;

  if (mquery.canMerge(filter)) this.merge(filter);
  if (replacement != null) {
    if (hasDollarKeys(replacement)) throw new Error('The replacement document must not contain atomic operators.');
    this._mergeUpdate(replacement);
  }
  options = options || {};
  const returnOriginal = get(this, 'model.base.options.returnOriginal');
  if (options.new == null && options.returnDocument == null && options.returnOriginal == null && returnOriginal != null) {
    options.returnOriginal = returnOriginal;
  }
  this.setOptions(options);
  this.setOptions({ overwrite: true });
  if (!callback) return this;
  this.exec(callback);
  return this;
};

Query.prototype._findOneAndReplace = wrapThunk(function (callback) {
  this._castConditions();
  if (this.error() != null) return callback(this.error()), null;
  const filter = this._conditions;
  const opts = this._optionsForExec();
  convertNewToReturnDocument(opts);
  let fields = null;

  let castedDoc = new this.model(this._update, null, true);
  this._update = castedDoc;
  this._applyPaths();

  if (this._fields != null) {
    opts.projection = this._castFields(utils.clone(this._fields));
    fields = opts.projection;
    if (fields instanceof Error) return callback(fields), null;
  }

  castedDoc.validate(err => {
    if (err) return callback(err);
    if (castedDoc.toBSON) castedDoc = castedDoc.toBSON();
    this._collection.collection.findOneAndReplace(filter, castedDoc, opts, _wrapThunkCallback(this, (err, res) => {
      if (err) return callback(err);
      const doc = res.value;
      return this._completeOne(doc, res, callback);
    }));
  });
});

/* ---------- UPDATE ---------- */
Query.prototype.update = function (conditions, doc, options, callback) {
  const args = parseFilterDocOptions(arguments);
  conditions = args.filter;
  doc = args.doc;
  options = args.options;
  callback = args.callback;
  return _update(this, 'update', conditions, doc, options, callback);
};

/* ---------- UPDATE MANY ---------- */
Query.prototype.updateMany = function (conditions, doc, options, callback) {
  const args = parseFilterDocOptions(arguments);
  conditions = args.filter;
  doc = args.doc;
  options = args.options;
  callback = args.callback;
  return _update(this, 'updateMany', conditions, doc, options, callback);
};

/* ---------- UPDATE ONE ---------- */
Query.prototype.updateOne = function (conditions, doc, options, callback) {
  const args = parseFilterDocOptions(arguments);
  conditions = args.filter;
  doc = args.doc;
  options = args.options;
  callback = args.callback;
  return _update(this, 'updateOne', conditions, doc, options, callback);
};

/* ---------- REPLACE ONE ---------- */
Query.prototype.replaceOne = function (conditions, doc, options, callback) {
  const args = parseFilterDocOptions(arguments);
  conditions = args.filter;
  doc = args.doc;
  options = args.options;
  callback = args.callback;
  this.setOptions({ overwrite: true });
  return _update(this, 'replaceOne', conditions, doc, options, callback);
};

/* ---------- INTERNAL UPDATE HELPERS ---------- */
function _update(query, op, filter, doc, options, callback) {
  query.op = op;
  filter = utils.toObject(filter);
  doc = doc || {};

  if (options && 'strict' in options) query._mongooseOptions.strict = options.strict;

  if (!(filter instanceof Query) && filter != null && filter.toString() !== '[object Object]') {
    query.error(new ObjectParameterError(filter, 'filter', op));
  } else {
    query.merge(filter);
  }

  if (utils.isObject(options)) query.setOptions(options);
  query._mergeUpdate(doc);
  if (callback) {
    query.exec(callback);
    return query;
  }
  return Query.base[op].call(query, filter, void 0, options, callback);
}

/* ---------- MAP ---------- */
Query.prototype.map = function (fn) {
  this._transforms.push(fn);
  return this;
};

/* ---------- ORFAIL ---------- */
Query.prototype.orFail = function (err) {
  this.map(res => {
    switch (this.op) {
      case 'find':
        if (res.length === 0) throw _orFailError(err, this);
        break;
      case 'findOne':
        if (res == null) throw _orFailError(err, this);
        break;
      case 'update':
      case 'updateMany':
      case 'updateOne':
        if (get(res, 'nModified') === 0) throw _orFailError(err, this);
        break;
      case 'findOneAndDelete':
      case 'findOneAndRemove':
        if (get(res, 'lastErrorObject.n') === 0) throw _orFailError(err, this);
        break;
      case 'findOneAndUpdate':
      case 'findOneAndReplace':
        if (get(res, 'lastErrorObject.updatedExisting') === false) throw _orFailError(err, this);
        break;
      case 'deleteMany':
      case 'deleteOne':
      case 'remove':
        if (res.n === 0) throw _orFailError(err, this);
        break;
    }
    return res;
  });
  return this;
};

function _orFailError(err, query) {
  if (typeof err === 'function') err = err.call(query);
  if (err == null) err = new DocumentNotFoundError(query.getQuery(), query.model.modelName);
  return err;
}

/* ---------- EXEC ---------- */
Query.prototype.exec = function (op, callback) {
  const _this = this;
  const castError = new CastError();

  if (typeof op === 'function') {
    callback = op;
    op = null;
  } else if (typeof op === 'string') {
    this.op = op;
  }

  callback = this.model.$handleCallbackError(callback);
  return promiseOrCallback(callback, cb => {
    cb = this.model.$wrapCallback(cb);
    if (!this.op) return cb();
    this._hooks.execPre('exec', this, [], err => {
      if (err) return cb(_cleanCastErrorStack(castError, err));
      let thunk = '_' + this.op;
      if (this.op === 'update') thunk = '_execUpdate';
      else if (this.op === 'distinct') thunk = '__distinct';
      this[thunk].call(this, (error, res) => {
        if (error) return cb(_cleanCastErrorStack(castError, error));
        this._hooks.execPost('exec', this, [], {}, err2 => {
          if (err2) return cb(_cleanCastErrorStack(castError, err2));
          cb(null, res);
        });
      });
    });
  }, this.model.events);
};

function _cleanCastErrorStack(castError, error) {
  if (error instanceof CastError) {
    castError.copy(error);
    return castError;
  }
  return error;
}

/* ---------- WRAP THUNK CALLBACK ---------- */
function _wrapThunkCallback(query, cb) {
  return function (error, res) {
    if (error != null) return cb(error);
    for (const fn of query._transforms) {
      try {
        res = fn(res);
      } catch (e) {
        return cb(e);
      }
    }
    return cb(null, res);
  };
}

/* ---------- THEN / CATCH ---------- */
Query.prototype.then = function (resolve, reject) {
  return this.exec().then(resolve, reject);
};

Query.prototype.catch = function (reject) {
  return this.exec().then(null, reject);
};

/* ---------- PRE / POST ---------- */
Query.prototype.pre = function (fn) {
  this._hooks.pre('exec', fn);
  return this;
};

Query.prototype.post = function (fn) {
  this._hooks.post('exec', fn);
  return this;
};

/* ---------- CAST UPDATE ---------- */
Query.prototype._castUpdate = function (obj, overwrite) {
  let strict;
  let schema = this.schema;
  const discriminatorKey = schema.options.discriminatorKey;
  const baseSchema = schema._baseSchema ? schema._baseSchema : schema;
  if (this._mongooseOptions.overwriteDiscriminatorKey && obj[discriminatorKey] != null && baseSchema.discriminators) {
    const _schema = baseSchema.discriminators[obj[discriminatorKey]];
    if (_schema) schema = _schema;
  }
  if ('strict' in this._mongooseOptions) strict = this._mongooseOptions.strict;
  else if (this.schema && this.schema.options) strict = this.schema.options.strict;
  else strict = true;

  let omitUndefined = false;
  if ('omitUndefined' in this._mongooseOptions) omitUndefined = this._mongooseOptions.omitUndefined;

  let useNestedStrict;
  if ('useNestedStrict' in this.options) useNestedStrict = this.options.useNestedStrict;

  let upsert;
  if ('upsert' in this.options) upsert = this.options.upsert;

  const filter = this._conditions;
  if (schema && utils.hasUserDefinedProperty(filter, schema.options.discriminatorKey) && typeof filter[schema.options.discriminatorKey] !== 'object' && schema.discriminators) {
    const discriminatorValue = filter[schema.options.discriminatorKey];
    const byValue = getDiscriminatorByValue(this.model.discriminators, discriminatorValue);
    schema = schema.discriminators[discriminatorValue] ||
      (byValue && byValue.schema) ||
      schema;
  }

  return castUpdate(schema, obj, {
    overwrite,
    strict,
    omitUndefined,
    useNestedStrict,
    upsert,
    arrayFilters: this.options.arrayFilters
  }, this, this._conditions);
};

/* ---------- CAST QUERY ---------- */
function castQuery(query) {
  try {
    return query.cast(query.model);
  } catch (err) {
    return err;
  }
}

/* ---------- CAST DOC ---------- */
function castDoc(query, overwrite) {
  try {
    return query._castUpdate(query._update, overwrite);
  } catch (err) {
    return err;
  }
}

/* ---------- POPULATE ---------- */
Query.prototype.populate = function () {
  if (!Array.from(arguments).some(Boolean)) return this;
  const res = utils.populate.apply(null, arguments);
  if (this.options) {
    const readConcern = this.options.readConcern;
    const readPref = this.options.readPreference;
    for (const pop of res) {
      if (readConcern != null && get(pop, 'options.readConcern') == null) {
        pop.options = pop.options || {};
        pop.options.readConcern = readConcern;
      }
      if (readPref != null && get(pop, 'options.readPreference') == null) {
        pop.options = pop.options || {};
        pop.options.readPreference = readPref;
      }
    }
  }
  const opts = this._mongooseOptions;
  if (opts.lean != null) {
    const lean = opts.lean;
    for (const pop of res) {
      if (get(pop, 'options.lean') == null) {
        pop.options = pop.options || {};
        pop.options.lean = lean;
      }
    }
  }
  if (!utils.isObject(opts.populate)) opts.populate = {};
  const pop = opts.populate;
  for (const popOpt of res) {
    const path = popOpt.path;
    if (pop[path] && pop[path].populate && popOpt.populate) {
      popOpt.populate = pop[path].populate.concat(popOpt.populate);
    }
    pop[popOpt.path] = popOpt;
  }
  return this;
};

/* ---------- GET POPULATED PATHS ---------- */
Query.prototype.getPopulatedPaths = function () {
  const obj = this._mongooseOptions.populate || {};
  const ret = Object.keys(obj);
  for (const path of Object.keys(obj)) {
    const pop = obj[path];
    if (!Array.isArray(pop.populate)) continue;
    _getPopulatedPaths(ret, pop.populate, path + '.');
  }
  return ret;
};

function _getPopulatedPaths(list, arr, prefix) {
  for (const pop of arr) {
    list.push(prefix + pop.path);
    if (!Array.isArray(pop.populate)) continue;
    _getPopulatedPaths(list, pop.populate, prefix + pop.path + '.');
  }
}

/* ---------- CAST ---------- */
Query.prototype.cast = function (model, obj) {
  obj = obj || this._conditions;
  model = model || this.model;
  const discriminatorKey = model.schema.options.discriminatorKey;
  if (obj && obj.hasOwnProperty(discriminatorKey)) {
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
    if (typeof err.setModel === 'function') err.setModel(model);
    throw err;
  }
};

/* ---------- CAST FIELDS ---------- */
Query.prototype._castFields = function (fields) {
  let selected, elemMatchKeys, keys, key, out, i;
  if (fields) {
    keys = Object.keys(fields);
    elemMatchKeys = [];
    i = keys.length;
    while (i--) {
      key = keys[i];
      if (fields[key].$elemMatch) {
        selected = selected || {};
        selected[key] = fields[key];
        elemMatchKeys.push(key);
      }
    }
  }
  if (selected) {
    try {
      out = this.cast(this.model, selected);
    } catch (err) {
      return err;
    }
    i = elemMatchKeys.length;
    while (i--) {
      key = elemMatchKeys[i];
      fields[key] = out[key];
    }
  }
  return fields;
};

/* ---------- APPLY PATHS ---------- */
Query.prototype._applyPaths = function () {
  this._fields = this._fields || {};
  helpers.applyPaths(this._fields, this.model.schema);
  let _selectPopulatedPaths = true;
  if ('selectPopulatedPaths' in this.model.base.options) _selectPopulatedPaths = this.model.base.options.selectPopulatedPaths;
  if ('selectPopulatedPaths' in this.model.schema.options) _selectPopulatedPaths = this.model.schema.options.selectPopulatedPaths;
  if (_selectPopulatedPaths) selectPopulatedFields(this._fields, this._userProvidedFields, this._mongooseOptions.populate);
};

/* ---------- CURSOR ---------- */
Query.prototype.cursor = function (opts) {
  this._applyPaths();
  this._fields = this._castFields(this._fields);
  this.setOptions({ projection: this._fieldsForExec() });
  if (opts) this.setOptions(opts);
  const options = Object.assign({}, this._optionsForExec(), { projection: this.projection() });
  try {
    this.cast(this.model);
  } catch (err) {
    return (new QueryCursor(this, options))._markError(err);
  }
  return new QueryCursor(this, options);
};

/* ---------- LEGACY METHODS ---------- */
Query.prototype.maxscan = Query.base.maxScan;

Query.prototype.tailable = function (val, opts) {
  if (val && typeof val.constructor === 'function' && val.constructor.name === 'Object') {
    opts = val;
    val = true;
  }
  if (val === undefined) val = true;
  if (opts && typeof opts === 'object') {
    for (const key of Object.keys(opts)) {
      if (key === 'awaitdata') this.options[key] = !!opts[key];
      else this.options[key] = opts[key];
    }
  }
  return Query.base.tailable.call(this, val);
};

/* ---------- NEAR ---------- */
Query.prototype.near = function () {
  const params = [];
  const sphere = this._mongooseOptions.nearSphere;
  if (arguments.length === 1) {
    if (Array.isArray(arguments[0])) params.push({ center: arguments[0], spherical: sphere });
    else if (typeof arguments[0] === 'string') params.push(arguments[0]);
    else if (utils.isObject(arguments[0])) {
      if (typeof arguments[0].spherical !== 'boolean') arguments[0].spherical = sphere;
      params.push(arguments[0]);
    } else throw new TypeError('invalid argument');
  } else if (arguments.length === 2) {
    if (typeof arguments[0] === 'number' && typeof arguments[1] === 'number') {
      params.push({ center: [arguments[0], arguments[1]], spherical: sphere });
    } else if (typeof arguments[0] === 'string' && Array.isArray(arguments[1])) {
      params.push(arguments[0], { center: arguments[1], spherical: sphere });
    } else if (typeof arguments[0] === 'string' && utils.isObject(arguments[1])) {
      params.push(arguments[0]);
      if (typeof arguments[1].spherical !== 'boolean') arguments[1].spherical = sphere;
      params.push(arguments[1]);
    } else throw new TypeError('invalid argument');
  } else if (arguments.length === 3) {
    if (typeof arguments[0] === 'string' && typeof arguments[1] === 'number' && typeof arguments[2] === 'number') {
      params.push(arguments[0], { center: [arguments[1], arguments[2]], spherical: sphere });
    } else throw new TypeError('invalid argument');
  } else {
    throw new TypeError('invalid argument');
  }
  return Query.base.near.apply(this, params);
};

Query.prototype.nearSphere = function () {
  this._mongooseOptions.nearSphere = true;
  this.near.apply(this, arguments);
  return this;
};

/* ---------- BOX ---------- */
Query.prototype.box = function (ll, ur) {
  if (!Array.isArray(ll) && utils.isObject(ll)) {
    ur = ll.ur;
    ll = ll.ll;
  }
  return Query.base.box.call(this, ll, ur);
};

/* ---------- SELECTED ---------- */
Query.prototype.selectedInclusively = function () {
  return isInclusive(this._fields);
};

Query.prototype.selectedExclusively = function () {
  return isExclusive(this._fields);
};

/* ---------- MONGOOSE OPTIONS ---------- */
Query.prototype.mongooseOptions = function (v) {
  if (arguments.length) this._mongooseOptions = v;
  return this._mongooseOptions;
};

/* ---------- VALIDATE ---------- */
Query.prototype.validate = function (castedDoc, options, isOverwriting, callback) {
  return promiseOrCallback(callback, cb => {
    try {
      if (isOverwriting) castedDoc.validate(cb);
      else updateValidators(this, this.model.schema, castedDoc, options, cb);
    } catch (err) {
      immediate(() => cb(err));
    }
  });
};

/* ---------- UPDATE THUNKS ---------- */
Query.prototype._execUpdate = wrapThunk(function (callback) {
  return _updateThunk.call(this, 'update', callback);
});
Query.prototype._updateMany = wrapThunk(function (callback) {
  return _updateThunk.call(this, 'updateMany', callback);
});
Query.prototype._updateOne = wrapThunk(function (callback) {
  return _updateThunk.call(this, 'updateOne', callback);
});
Query.prototype._replaceOne = wrapThunk(function (callback) {
  return _updateThunk.call(this, 'replaceOne', callback);
});

/* ---------- UPDATE THUNK IMPLEMENTATION ---------- */
function _updateThunk(op, callback) {
  this._castConditions();
  _castArrayFilters(this);
  if (this.error() != null) return callback(this.error()), null;
  callback = _wrapThunkCallback(this, callback);
  const oldCb = callback;
  callback = (error, result) => oldCb(error, result ? result.result : { ok: 0, n: 0, nModified: 0 });

  const castedQuery = this._conditions;
  const options = this._optionsForExec(this.model);
  ++this._executionCount;

  this._update = utils.clone(this._update, options);
  const isOverwriting = this.options.overwrite && !hasDollarKeys(this._update);
  if (isOverwriting) {
    if (op === 'updateOne' || op === 'updateMany') return callback(new MongooseError('The MongoDB server disallows overwriting documents using `' + op + '`. See: https://mongoosejs.com/docs/deprecations.html#update'));
    this._update = new this.model(this._update, null, true);
  } else {
    this._update = castDoc(this, options.overwrite);
    if (this._update instanceof Error) return callback(this._update), null;
    if (!this._update || Object.keys(this._update).length === 0) {
      if (options.upsert) {
        const doc = utils.clone(castedQuery);
        delete doc._id;
        this._update = { $set: doc };
      } else {
        this.findOne(callback);
        return this;
      }
    } else if (this._update.$set && Object.keys(this._update.$set).length === 0) delete this._update.$set;
  }

  if (Array.isArray(options.arrayFilters)) {
    options.arrayFilters = removeUnusedArrayFilters(this._update, options.arrayFilters);
  }

  const runValidators = _getOption(this, 'runValidators', false);
  const base = this.model && this.model.base;
  const conn = get(this.model, 'collection.conn', {});
  let useFindAndModify = true;
  if ('useFindAndModify' in base.options) useFindAndModify = base.get('useFindAndModify');
  if ('useFindAndModify' in conn.config) useFindAndModify = conn.config.useFindAndModify;
  if ('useFindAndModify' in options) useFindAndModify = options.useFindAndModify;
  if (useFindAndModify === false) {
    const collection = this._collection.collection;
    convertNewToReturnDocument(options);
    if (op === 'remove') {
      collection.findOneAndDelete(castedQuery, options, _wrapThunkCallback(this, (error, res) => callback(error, res ? res.value : res, res)));
      return this;
    }
    const updateMethod = isOverwriting ? 'findOneAndReplace' : 'findOneAndUpdate';
    if (runValidators) {
      this.validate(this._update, options, isOverwriting, err => {
        if (err) return callback(err);
        if (this._update && this._update.toBSON) this._update = this._update.toBSON();
        collection[updateMethod](castedQuery, this._update, options, _wrapThunkCallback(this, (error, res) => callback(error, res ? res.value : res, res)));
      });
    } else {
      if (this._update && this._update.toBSON) this._update = this._update.toBSON();
      collection[updateMethod](castedQuery, this._update, options, _wrapThunkCallback(this, (error, res) => callback(error, res ? res.value : res, res)));
    }
    return this;
  }

  if (runValidators) {
    this.validate(this._update, options, isOverwriting, err => {
      if (err) return callback(err);
      _legacyFindAndModify.call(this, castedQuery, this._update, options, cb);
    });
  } else {
    _legacyFindAndModify.call(this, castedQuery, this._update, options, cb);
  }
  return this;
}

/* ---------- LEGACY FIND AND MODIFY ---------- */
const _legacyFindAndModify = util.deprecate(function (filter, update, opts, cb) {
  if (update && update.toBSON) update = update.toBSON();
  const collection = this._collection;
  const sort = opts && Array.isArray(opts.sort) ? opts.sort : [];
  const _cb = _wrapThunkCallback(this, (error, res) => cb(error, res ? res.value : res, res));
  collection.collection._findAndModify(filter, sort, update, opts, _cb);
}, 'Mongoose: `findOneAndUpdate()` and `findOneAndDelete()` without the `useFindAndModify` option set to false are deprecated.');

/* ---------- MERGE UPDATE ---------- */
Query.prototype._mergeUpdate = function (doc) {
  if (!doc || (typeof doc === 'object' && Object.keys(doc).length === 0)) return;
  if (!this._update) this._update = Array.isArray(doc) ? [] : {};
  if (doc instanceof Query) {
    if (Array.isArray(this._update)) throw new Error('Cannot mix array and object updates');
    if (doc._update) utils.mergeClone(this._update, doc._update);
  } else if (Array.isArray(doc)) {
    if (!Array.isArray(this._update)) throw new Error('Cannot mix array and object updates');
    this._update = this._update.concat(doc);
  } else {
    if (Array.isArray(this._update)) throw new Error('Cannot mix array and object updates');
    utils.mergeClone(this._update, doc);
  }
};

/* ---------- SORT TO ARRAY ---------- */
function convertSortToArray(opts) {
  if (Array.isArray(opts.sort) || !utils.isObject(opts.sort)) return;
  const sort = [];
  for (const key in opts.sort) {
    if (utils.object.hasOwnProperty(opts.sort, key)) sort.push([key, opts.sort[key]]);
  }
  opts.sort = sort;
}

/* ---------- FIND AND MODIFY CORE ---------- */
Query.prototype._findAndModify = function (type, callback) {
  if (typeof callback !== 'function') throw new Error('Expected callback in _findAndModify');
  const model = this.model;
  const schema = model.schema;
  const castedQuery = castQuery(this);
  if (castedQuery instanceof Error) return callback(castedQuery);
  _castArrayFilters(this);
  const opts = this._optionsForExec(model);
  if ('strict' in opts) this._mongooseOptions.strict = opts.strict;
  const isOverwriting = this.options.overwrite && !hasDollarKeys(this._update);
  if (isOverwriting) this._update = new this.model(this._update, null, true);
  if (type === 'remove') opts.remove = true;
  else {
    if (!('new' in opts) && !('returnOriginal' in opts) && !('returnDocument' in opts)) opts.new = false;
    if (!('upsert' in opts)) opts.upsert = false;
    if (opts.upsert || opts['new']) opts.remove = false;
    if (!isOverwriting) {
      this._update = castDoc(this, opts.overwrite);
      const _opts = Object.assign({}, opts, { setDefaultsOnInsert: this._mongooseOptions.setDefaultsOnInsert });
      this._update = setDefaultsOnInsert(this._conditions, schema, this._update, _opts);
      if (!this._update || Object.keys(this._update).length === 0) {
        if (opts.upsert) {
          const doc = utils.clone(castedQuery);
          delete doc._id;
          this._update = { $set: doc };
        } else {
          this.findOne(callback);
          return this;
        }
      } else if (this._update instanceof Error) return callback(this._update);
      else if (this._update.$set && Object.keys(this._update.$set).length === 0) delete this._update.$set;
    }
    if (Array.isArray(opts.arrayFilters)) opts.arrayFilters = removeUnusedArrayFilters(this._update, opts.arrayFilters);
  }
  this._applyPaths();
  if (this._fields) {
    const fields = utils.clone(this._fields);
    opts.projection = this._castFields(fields);
    if (opts.projection instanceof Error) return callback(opts.projection);
  }
  if (opts.sort) convertSortToArray(opts);
  const runValidators = _getOption(this, 'runValidators', false);
  const base = this.model && this.model.base;
  const conn = get(this.model, 'collection.conn', {});
  let useFindAndModify = true;
  if ('useFindAndModify' in base.options) useFindAndModify = base.get('useFindAndModify');
  if ('useFindAndModify' in conn.config) useFindAndModify = conn.config.useFindAndModify;
  if ('useFindAndModify' in opts) useFindAndModify = opts.useFindAndModify;
  if (useFindAndModify === false) {
    const collection = this._collection.collection;
    convertNewToReturnDocument(opts);
    if (type === 'remove') {
      collection.findOneAndDelete(castedQuery, opts, _wrapThunkCallback(this, (error, res) => callback(error, res ? res.value : res, res)));
      return this;
    }
    const updateMethod = isOverwriting ? 'findOneAndReplace' : 'findOneAndUpdate';
    if (runValidators) {
      this.validate(this._update, opts, isOverwriting, err => {
        if (err) return callback(err);
        if (this._update && this._update.toBSON) this._update = this._update.toBSON();
        collection[updateMethod](castedQuery, this._update, opts, _wrapThunkCallback(this, (error, res) => callback(error, res ? res.value : res, res)));
      });
    } else {
      if (this._update && this._update.toBSON) this._update = this._update.toBSON();
      collection[updateMethod](castedQuery, this._update, opts, _wrapThunkCallback(this, (error, res) => callback(error, res ? res.value : res, res)));
    }
    return this;
  }
  if (runValidators) {
    this.validate(this._update, opts, isOverwriting, err => {
      if (err) return callback(err);
      _legacyFindAndModify.call(this, castedQuery, this._update, opts, callback);
    });
  } else {
    _legacyFindAndModify.call(this, castedQuery, this._update, opts, callback);
  }
  return this;
};

/* ---------- COMPLETE ONE LEAN ---------- */
function _completeOneLean(doc, res, opts, callback) {
  if (opts.rawResult) return callback(null, res);
  return callback(null, doc);
}

/* ---------- CONVERT NEW TO RETURN DOCUMENT ---------- */
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

/* ---------- POPULATE ---------- */
Query.prototype.populate = Query.prototype.populate;

/* ---------- GET POPULATED PATHS ---------- */
Query.prototype.getPopulatedPaths = Query.prototype.getPopulatedPaths;

/* ---------- CAST ---------- */
Query.prototype.cast = Query.prototype.cast;

/* ---------- CAST FIELDS ---------- */
Query.prototype._castFields = Query.prototype._castFields;

/* ---------- APPLY PATHS ---------- */
Query.prototype._applyPaths = Query.prototype._applyPaths;

/* ---------- CURSOR ---------- */
Query.prototype.cursor = Query.prototype.cursor;

/* ---------- ASYNC ITERATOR ---------- */
if (Symbol.asyncIterator != null) {
  Query.prototype[Symbol.asyncIterator] = function () {
    return this.cursor().transformNull()._transformForAsyncIterator();
  };
}

/* ---------- EXPORT ---------- */
module.exports = Query;
```