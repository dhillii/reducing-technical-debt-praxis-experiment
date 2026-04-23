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
 * @method $where
 * @param {String|Function} js javascript string or function
 * @return {Query} this
 * @api public
 */

Query.prototype.$where = function $where(js) {
  return Query.base.$where.call(this, js);
};

/**
 * @method where
 * @param {String|Object} [path]
 * @param {any} [val]
 * @return {Query} this
 * @api public
 */

Query.prototype.where = function where(path, val) {
  return Query.base.where.call(this, path, val);
};

/**
 * @method slice
 * @param {String} [path]
 * @param {Number} val number/range of elements to slice
 * @return {Query} this
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
 * @method read
 * @param {String} pref one of the listed preference options or aliases
 * @param {Array} [tags] optional tags for this query
 * @return {Query} this
 * @api public
 */

Query.prototype.read = function read(pref, tags) {
  const read = new ReadPreference(pref, tags);
  this.options.readPreference = read;
  return this;
};

/**
 * @method session
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

Query.prototype.getOptions = function() {
  return this.options;
};

/**
 * @method setOptions
 * @param {Object} options
 * @return {Query} this
 * @api public
 */

Query.prototype.setOptions = function(options, overwrite) {
  if (overwrite) {
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
  }

  return Query.base.setOptions.call(this, options);
};

/**
 * @method explain
 * @param {String} [verbose]
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
 * @method allowDiskUse
 * @param {Boolean} [v]
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
 * @method maxTimeMS
 * @param {Number} [ms]
 * @return {Query} this
 * @api public
 */

Query.prototype.maxTimeMS = function(ms) {
  this.options.maxTimeMS = ms;
  return this;
};

/**
 * @method getFilter
 * @return {Object} current query filter
 * @api public
 */

Query.prototype.getFilter = function() {
  return this._conditions;
};

/**
 * @method getQuery
 * @return {Object} current query filter
 * @api public
 */

Query.prototype.getQuery = function() {
  return this._conditions;
};

/**
 * @method setQuery
 * @param {Object} new query conditions
 * @return {undefined}
 * @api public
 */

Query.prototype.setQuery = function(val) {
  this._conditions = val;
};

/**
 * @method getUpdate
 * @return {Object} current update operations
 * @api public
 */

Query.prototype.getUpdate = function() {
  return this._update;
};

/**
 * @method setUpdate
 * @param {Object} new update operation
 * @return {undefined}
 * @api public
 */

Query.prototype.setUpdate = function(val) {
  this._update = val;
};

/**
 * @method _fieldsForExec
 * @return {Object}
 * @api private
 */

Query.prototype._fieldsForExec = function() {
  return utils.clone(this._fields);
};

/**
 * @method _updateForExec
 * @api private
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
 * @return {Object}
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
 * @method lean
 * @param {Boolean|Object} bool defaults to true
 * @return {Query} this
 * @api public
 */

Query.prototype.lean = function(v) {
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
 * @method get
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
 * @method error
 * @param {Error|null} err
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
 * @method mongooseOptions
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

/**
 * @method find
 * @param {Object|ObjectId} [filter]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 */

Query.prototype.find = function(conditions, callback) {
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

Query.prototype.merge = function(source) {
  if (!source) {
    return this;
  }

  const opts = { overwrite: true };

  if (source instanceof Query) {
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

  utils.merge(this._conditions, source, opts);
  return this;
};

/**
 * @method collation
 * @param {Object} value
 * @return {Query} this
 * @api public
 */

Query.prototype.collation = function(value) {
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

Query.prototype._completeOne = function(doc, res, callback) {
  if (!doc && !this.options.rawResult) {
    return callback(null, null);
  }

  const model = this.model;
  const projection = utils.clone(this._fields);
  const userProvidedFields = this._userProvidedFields || {};
  const mongooseOptions = this._mongooseOptions;
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
 * @api private
 */
Query.prototype._findOne = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error()) {
    callback(this.error());
    return null;
  }

  this._applyPaths();
  this._fields = this._castFields(this._fields);

  applyGlobalMaxTimeMS(this.options, this.model);

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
 *
 * @typedef {Object} FindOneParams
 * @property {Object} [filter]
 * @property {Object} [projection]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.findOne = function(paramsOrConditions, projection, options, callback) {
  if (typeof paramsOrConditions === 'object' && !Array.isArray(paramsOrConditions) && !(paramsOrConditions instanceof Query) && typeof projection !== 'function' && typeof options !== 'function' && typeof callback !== 'function') {
    const p = paramsOrConditions;
    callback = p.callback;
    options = p.options;
    projection = p.projection;
    paramsOrConditions = p.filter;
  }

  this.op = 'findOne';
  if (typeof paramsOrConditions === 'function') {
    callback = paramsOrConditions;
    paramsOrConditions = null;
    projection = null;
    options = null;
  } else if (typeof projection === 'function') {
    callback = projection;
    options = null;
    projection = null;
  } else if (typeof options === 'function') {
    callback = options;
    options = null;
  }

  paramsOrConditions = utils.toObject(paramsOrConditions);

  if (options) {
    this.setOptions(options);
  }

  if (projection) {
    this.select(projection);
  }

  if (mquery.canMerge(paramsOrConditions)) {
    this.merge(paramsOrConditions);
    prepareDiscriminatorCriteria(this);
  } else if (paramsOrConditions != null) {
    this.error(new ObjectParameterError(paramsOrConditions, 'filter', 'findOne'));
  }

  if (!callback) {
    return Query.base.findOne.call(this);
  }

  this.exec(callback);
  return this;
};

/**
 * Thunk around count()
 *
 * @param {Function} [callback]
 * @api private
 */

Query.prototype._count = wrapThunk(function(callback) {
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
 * @method count
 * @param {Object} [filter]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} CountParams
 * @property {Object} [filter]
 * @property {Function} [callback]
 */

Query.prototype.count = function(paramsOrFilter, callback) {
  if (typeof paramsOrFilter === 'object' && !Array.isArray(paramsOrFilter) && typeof callback !== 'function') {
    const p = paramsOrFilter;
    callback = p.callback;
    paramsOrFilter = p.filter;
  }

  this.op = 'count';
  if (typeof paramsOrFilter === 'function') {
    callback = paramsOrFilter;
    paramsOrFilter = undefined;
  }

  paramsOrFilter = utils.toObject(paramsOrFilter);

  if (mquery.canMerge(paramsOrFilter)) {
    this.merge(paramsOrFilter);
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

  this._collection.collection.
    distinct(this._distinct, this._conditions, options, callback);
});

/**
 * @method distinct
 * @param {String} [field]
 * @param {Object} [conditions]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} DistinctParams
 * @property {String} [field]
 * @property {Object} [conditions]
 * @property {Function} [callback]
 */

Query.prototype.distinct = function(paramsOrField, conditions, callback) {
  if (typeof paramsOrField === 'object' && !Array.isArray(paramsOrField) && typeof conditions !== 'function') {
    const p = paramsOrField;
    callback = p.callback;
    conditions = p.conditions;
    paramsOrField = p.field;
  }

  this.op = 'distinct';
  if (!callback) {
    if (typeof conditions === 'function') {
      callback = conditions;
      conditions = undefined;
    } else if (typeof paramsOrField === 'function') {
      callback = paramsOrField;
      paramsOrField = undefined;
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

  if (paramsOrField != null) {
    this._distinct = paramsOrField;
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

Query.prototype.sort = function(arg) {
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
 * @method deleteOne
 * @param {Object|Query} [filter]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} DeleteOneParams
 * @property {Object} [filter]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.deleteOne = function(paramsOrFilter, options, callback) {
  if (typeof paramsOrFilter === 'object' && !Array.isArray(paramsOrFilter) && typeof options !== 'function') {
    const p = paramsOrFilter;
    callback = p.callback;
    options = p.options;
    paramsOrFilter = p.filter;
  }

  this.op = 'deleteOne';
  if (typeof paramsOrFilter === 'function') {
    callback = paramsOrFilter;
    paramsOrFilter = null;
    options = null;
  } else if (typeof options === 'function') {
    callback = options;
    options = null;
  } else {
    this.setOptions(options);
  }

  paramsOrFilter = utils.toObject(paramsOrFilter);

  if (mquery.canMerge(paramsOrFilter)) {
    this.merge(paramsOrFilter);
    prepareDiscriminatorCriteria(this);
  } else if (paramsOrFilter != null) {
    this.error(new ObjectParameterError(paramsOrFilter, 'filter', 'deleteOne'));
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
    return null;
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
 *
 * @typedef {Object} DeleteManyParams
 * @property {Object} [filter]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.deleteMany = function(paramsOrFilter, options, callback) {
  if (typeof paramsOrFilter === 'object' && !Array.isArray(paramsOrFilter) && typeof options !== 'function') {
    const p = paramsOrFilter;
    callback = p.callback;
    options = p.options;
    paramsOrFilter = p.filter;
  }

  this.op = 'deleteMany';
  if (typeof paramsOrFilter === 'function') {
    callback = paramsOrFilter;
    paramsOrFilter = null;
    options = null;
  } else if (typeof options === 'function') {
    callback = options;
    options = null;
  } else {
    this.setOptions(options);
  }

  paramsOrFilter = utils.toObject(paramsOrFilter);

  if (mquery.canMerge(paramsOrFilter)) {
    this.merge(paramsOrFilter);
    prepareDiscriminatorCriteria(this);
  } else if (paramsOrFilter != null) {
    this.error(new ObjectParameterError(paramsOrFilter, 'filter', 'deleteMany'));
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

/**
 * @method findOneAndUpdate
 * @param {Object} [filter]
 * @param {Object} [doc]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} FindOneAndUpdateParams
 * @property {Object} [filter]
 * @property {Object} [doc]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.findOneAndUpdate = function(paramsOrCriteria, doc, options, callback) {
  if (typeof paramsOrCriteria === 'object' && !Array.isArray(paramsOrCriteria) && typeof doc !== 'function' && typeof options !== 'function' && typeof callback !== 'function') {
    const p = paramsOrCriteria;
    callback = p.callback;
    options = p.options;
    doc = p.doc;
    paramsOrCriteria = p.filter;
  }

  this.op = 'findOneAndUpdate';
  this._validate();

  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else if (typeof doc === 'function') {
    callback = doc;
    doc = paramsOrCriteria;
    paramsOrCriteria = undefined;
    options = {};
  }

  if (mquery.canMerge(paramsOrCriteria)) {
    this.merge(paramsOrCriteria);
  }

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

/**
 * @method findOneAndRemove
 * @param {Object} [conditions]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} FindOneAndRemoveParams
 * @property {Object} [conditions]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.findOneAndRemove = function(paramsOrConditions, options, callback) {
  if (typeof paramsOrConditions === 'object' && !Array.isArray(paramsOrConditions) && typeof options !== 'function') {
    const p = paramsOrConditions;
    callback = p.callback;
    options = p.options;
    paramsOrConditions = p.conditions;
  }

  this.op = 'findOneAndRemove';
  this._validate();

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (mquery.canMerge(paramsOrConditions)) {
    this.merge(paramsOrConditions);
  }

  options && this.setOptions(options);

  if (!callback) {
    return this;
  }

  this.exec(callback);
  return this;
};

/**
 * @method findOneAndDelete
 * @param {Object} [conditions]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} FindOneAndDeleteParams
 * @property {Object} [conditions]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.findOneAndDelete = function(paramsOrConditions, options, callback) {
  if (typeof paramsOrConditions === 'object' && !Array.isArray(paramsOrConditions) && typeof options !== 'function') {
    const p = paramsOrConditions;
    callback = p.callback;
    options = p.options;
    paramsOrConditions = p.conditions;
  }

  this.op = 'findOneAndDelete';
  this._validate();

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (mquery.canMerge(paramsOrConditions)) {
    this.merge(paramsOrConditions);
  }

  options && this.setOptions(options);

  if (!callback) {
    return this;
  }

  this.exec(callback);
  return this;
};

/**
 * @method findOneAndReplace
 * @param {Object} [filter]
 * @param {Object} [replacement]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} FindOneAndReplaceParams
 * @property {Object} [filter]
 * @property {Object} [replacement]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.findOneAndReplace = function(paramsOrFilter, replacement, options, callback) {
  if (typeof paramsOrFilter === 'object' && !Array.isArray(paramsOrFilter) && typeof replacement !== 'function' && typeof options !== 'function' && typeof callback !== 'function') {
    const p = paramsOrFilter;
    callback = p.callback;
    options = p.options;
    replacement = p.replacement;
    paramsOrFilter = p.filter;
  }

  this.op = 'findOneAndReplace';
  this._validate();

  if (typeof options === 'function') {
    callback = options;
    options = void 0;
  } else if (typeof replacement === 'function') {
    callback = replacement;
    replacement = void 0;
  }

  if (mquery.canMerge(paramsOrFilter)) {
    this.merge(paramsOrFilter);
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

/**
 * @method update
 * @param {Object} [filter]
 * @param {Object} [doc]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} UpdateParams
 * @property {Object} [filter]
 * @property {Object} [doc]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.update = function(paramsOrConditions, doc, options, callback) {
  if (typeof paramsOrConditions === 'object' && !Array.isArray(paramsOrConditions) && typeof doc !== 'function' && typeof options !== 'function' && typeof callback !== 'function') {
    const p = paramsOrConditions;
    callback = p.callback;
    options = p.options;
    doc = p.doc;
    paramsOrConditions = p.filter;
  }

  if (typeof options === 'function') {
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    callback = doc;
    doc = paramsOrConditions;
    paramsOrConditions = {};
    options = null;
  } else if (typeof paramsOrConditions === 'function') {
    callback = paramsOrConditions;
    paramsOrConditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof paramsOrConditions === 'object' && !doc && !options && !callback) {
    doc = paramsOrConditions;
    paramsOrConditions = undefined;
    options = undefined;
    callback = undefined;
  }

  return _update(this, 'update', paramsOrConditions, doc, options, callback);
};

/**
 * @method updateMany
 * @param {Object} [filter]
 * @param {Object|Array} [doc]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} UpdateManyParams
 * @property {Object} [filter]
 * @property {Object|Array} [doc]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.updateMany = function(paramsOrConditions, doc, options, callback) {
  if (typeof paramsOrConditions === 'object' && !Array.isArray(paramsOrConditions) && typeof doc !== 'function' && typeof options !== 'function' && typeof callback !== 'function') {
    const p = paramsOrConditions;
    callback = p.callback;
    options = p.options;
    doc = p.doc;
    paramsOrConditions = p.filter;
  }

  if (typeof options === 'function') {
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    callback = doc;
    doc = paramsOrConditions;
    paramsOrConditions = {};
    options = null;
  } else if (typeof paramsOrConditions === 'function') {
    callback = paramsOrConditions;
    paramsOrConditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof paramsOrConditions === 'object' && !doc && !options && !callback) {
    doc = paramsOrConditions;
    paramsOrConditions = undefined;
    options = undefined;
    callback = undefined;
  }

  return _update(this, 'updateMany', paramsOrConditions, doc, options, callback);
};

/**
 * @method updateOne
 * @param {Object} [filter]
 * @param {Object|Array} [doc]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} UpdateOneParams
 * @property {Object} [filter]
 * @property {Object|Array} [doc]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.updateOne = function(paramsOrConditions, doc, options, callback) {
  if (typeof paramsOrConditions === 'object' && !Array.isArray(paramsOrConditions) && typeof doc !== 'function' && typeof options !== 'function' && typeof callback !== 'function') {
    const p = paramsOrConditions;
    callback = p.callback;
    options = p.options;
    doc = p.doc;
    paramsOrConditions = p.filter;
  }

  if (typeof options === 'function') {
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    callback = doc;
    doc = paramsOrConditions;
    paramsOrConditions = {};
    options = null;
  } else if (typeof paramsOrConditions === 'function') {
    callback = paramsOrConditions;
    paramsOrConditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof paramsOrConditions === 'object' && !doc && !options && !callback) {
    doc = paramsOrConditions;
    paramsOrConditions = undefined;
    options = undefined;
    callback = undefined;
  }

  return _update(this, 'updateOne', paramsOrConditions, doc, options, callback);
};

/**
 * @method replaceOne
 * @param {Object} [filter]
 * @param {Object} [doc]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Query} this
 * @api public
 *
 * @typedef {Object} ReplaceOneParams
 * @property {Object} [filter]
 * @property {Object} [doc]
 * @property {Object} [options]
 * @property {Function} [callback]
 */

Query.prototype.replaceOne = function(paramsOrConditions, doc, options, callback) {
  if (typeof paramsOrConditions === 'object' && !Array.isArray(paramsOrConditions) && typeof doc !== 'function' && typeof options !== 'function' && typeof callback !== 'function') {
    const p = paramsOrConditions;
    callback = p.callback;
    options = p.options;
    doc = p.doc;
    paramsOrConditions = p.filter;
  }

  if (typeof options === 'function') {
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    callback = doc;
    doc = paramsOrConditions;
    paramsOrConditions = {};
    options = null;
  } else if (typeof paramsOrConditions === 'function') {
    callback = paramsOrConditions;
    paramsOrConditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof paramsOrConditions === 'object' && !doc && !options && !callback) {
    doc = paramsOrConditions;
    paramsOrConditions = undefined;
    options = undefined;
    callback = undefined;
  }

  this.setOptions({ overwrite: true });
  return _update(this, 'replaceOne', paramsOrConditions, doc, options, callback);
};

/*!
 * Internal helper for update, updateMany, updateOne, replaceOne
 */

function _update(query, op, filter, doc, options, callback) {
  query.op = op;
  filter = utils.toObject(filter);
  doc = doc || {};

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

  if (callback) {
    query.exec(callback);
    return query;
  }

  return Query.base[op].call(query, filter, void 0, options, callback);
}

/**
 * @method map
 * @param {Function} fn
 * @return {Query} this
 */

Query.prototype.map = function(fn) {
  this._transforms.push(fn);
  return this;
};

/**
 * @method orFail
 * @param {Function|Error} [err]
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
 * @method exec
 * @param {String|Function} [operation]
 * @param {Function} [callback]
 * @return {Promise}
 * @api public
 */

Query.prototype.exec = function exec(op, callback) {
  const _this = this;
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
 * @method then
 * @param {Function} [resolve]
 * @param {Function} [reject]
 * @return {Promise}
 * @api public
 */

Query.prototype.then = function(resolve, reject) {
  return this.exec().then(resolve, reject);
};

/**
 * @method catch
 * @param {Function} [reject]
 * @return {Promise}
 * @api public
 */

Query.prototype.catch = function(reject) {
  return this.exec().then(null, reject);
};

/**
 * @method pre
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */

Query.prototype.pre = function(fn) {
  this._hooks.pre('exec', fn);
  return this;
};

/**
 * @method post
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
 * @method populate
 * @param {Object|String} path
 * @return {Query} this
 * @api public
 */

Query.prototype.populate = function() {
  if (!Array.from(arguments).some(Boolean)) {
    return this;
  }

  const res = utils.populate.apply(null, arguments);

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
 * @method cast
 * @param {Model} [model]
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
    if (typeof err.setModel === 'function') {
      err.setModel(model);
    }
    throw err;
  }
};

/**
 * @method _castFields
 * @param {Object} fields
 * @return {Object}
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

/**
 * @method _applyPaths
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
 * @method cursor
 * @param {Object} [options]
 * @return {QueryCursor}
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

Query.prototype.tailable = function(val, opts) {
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
 * @api public
 */

Query.prototype.near = function() {
  const params = [];
  const sphere = this._mongooseOptions.nearSphere;

  if (arguments.length === 1) {
    if (Array.isArray(arguments[0])) {
      params.push({ center: arguments[0], spherical: sphere });
    } else if (typeof arguments[0] === 'string') {
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
 * @api public
 */

Query.prototype.nearSphere = function() {
  this._mongooseOptions.nearSphere = true;
  this.near.apply(this, arguments);
  return this;
};

/**
 * @method box
 * @return {Query}
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
 * @method selectedInclusively
 * @return {Boolean}
 * @api public
 */

Query.prototype.selectedInclusively = function selectedInclusively() {
  return isInclusive(this._fields);
};

/**
 * @method selectedExclusively
 * @return {Boolean}
 * @api public
 */

Query.prototype.selectedExclusively = function selectedExclusively() {
  return isExclusive(this._fields);
};

/**
 * @method mongooseOptions
 * @return {Object}
 * @api public
 */

Query.prototype.mongooseOptions;

/*!
 * Export
 */

module.exports = Query;