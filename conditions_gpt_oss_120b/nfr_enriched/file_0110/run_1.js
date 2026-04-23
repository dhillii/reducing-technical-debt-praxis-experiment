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
 * Slice helper – extracts path/value handling.
 *
 * @private
 * @param {Array} args arguments passed to slice
 * @returns {{path:string,val:any}} extracted path and value
 */
function _extractSliceArgs(args) {
  let path;
  let val;

  if (args.length === 1) {
    const arg = args[0];
    if (typeof arg === 'object' && !Array.isArray(arg)) {
      const keys = Object.keys(arg);
      for (let i = 0; i < keys.length; ++i) {
        this.slice(keys[i], arg[keys[i]]);
      }
      return null;
    }
    this._ensurePath('slice');
    path = this._path;
    val = args[0];
  } else if (args.length === 2) {
    if (typeof args[0] === 'number') {
      this._ensurePath('slice');
      path = this._path;
      val = slice(args);
    } else {
      path = args[0];
      val = args[1];
    }
  } else if (args.length === 3) {
    path = args[0];
    val = slice(args, 1);
  }
  return { path, val };
}

/**
 * Specifies a `$slice` projection for an array.
 *
 * @method slice
 * @memberOf Query
 * @instance
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

  const extracted = _extractSliceArgs.call(this, arguments);
  if (!extracted) {
    return this;
  }

  const { path, val } = extracted;
  const p = {};
  p[path] = { $slice: val };
  this.select(p);
  return this;
};

/**
 * Mod helper – extracts path/value handling.
 *
 * @private
 * @param {Array} args arguments passed to mod
 * @returns {{path:string,val:any}} extracted path and value
 */
function _extractModArgs(args) {
  let val;
  let path;

  if (args.length === 1) {
    this._ensurePath('mod');
    val = args[0];
    path = this._path;
  } else if (args.length === 2 && !Array.isArray(args[1])) {
    this._ensurePath('mod');
    val = slice(args);
    path = this._path;
  } else if (args.length === 3) {
    val = slice(args, 1);
    path = args[0];
  } else {
    val = args[1];
    path = args[0];
  }
  return { path, val };
}

/**
 * Specifies a `$mod` condition.
 *
 * @method mod
 * @memberOf Query
 * @instance
 * @return {Query} this
 * @api public
 */

Query.prototype.mod = function() {
  const { path, val } = _extractModArgs.call(this, arguments);
  const conds = this._conditions[path] || (this._conditions[path] = {});
  conds.$mod = val;
  return this;
};

/**
 * Sets the read preference.
 *
 * @method read
 * @memberOf Query
 * @instance
 * @param {String} pref
 * @param {Array} [tags]
 * @return {Query} this
 * @api public
 */

Query.prototype.read = function read(pref, tags) {
  const read = new ReadPreference(pref, tags);
  this.options.readPreference = read;
  return this;
};

/**
 * Sets the session.
 *
 * @method session
 * @memberOf Query
 * @instance
 * @param {ClientSession} [session]
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
 * Sets write concern.
 *
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
 * Sets w option.
 *
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
 * Sets j option.
 *
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
 * Sets wtimeout option.
 *
 * @method wtimeout
 * @memberOf Query
 * @instance
 * @param {number} ms
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
 * Sets the lean option.
 *
 * @method lean
 * @memberOf Query
 * @instance
 * @param {Boolean|Object} bool
 * @return {Query} this
 * @api public
 */

Query.prototype.lean = function(v) {
  this._mongooseOptions.lean = arguments.length ? v : true;
  return this;
};

/**
 * Adds a `$set` to this query's update.
 *
 * @method set
 * @memberOf Query
 * @instance
 * @param {String|Object} path
 * @param {Any} [val]
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
 * Retrieves a value from the update's `$set`.
 *
 * @method get
 * @memberOf Query
 * @instance
 * @param {String|Object} path
 * @return {any}
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
 * Gets/sets the error flag.
 *
 * @method error
 * @memberOf Query
 * @instance
 * @param {Error|null} err
 * @return {Query|Error}
 * @api public
 */

Query.prototype.error = function error(err) {
  if (arguments.length === 0) {
    return this._error;
  }

  this._error = err;
  return this;
};

/**
 * Unsets a CastError.
 *
 * @method _unsetCastError
 * @memberOf Query
 * @private
 */

Query.prototype._unsetCastError = function _unsetCastError() {
  if (this._error != null && !(this._error instanceof CastError)) {
    return;
  }
  return this.error(null);
};

/**
 * Casts query conditions.
 *
 * @method _castConditions
 * @memberOf Query
 * @private
 */

Query.prototype._castConditions = function() {
  try {
    this.cast(this.model);
    this._unsetCastError();
  } catch (err) {
    this.error(err);
  }
};

/**
 * Casts array filters.
 *
 * @private
 * @param {Query} query
 */
function _castArrayFilters(query) {
  try {
    castArrayFilters(query);
  } catch (err) {
    query.error(err);
  }
}

/**
 * Thunk around find().
 *
 * @method _find
 * @memberOf Query
 * @private
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
 * Prepares options for findAndModify.
 *
 * @private
 * @param {Query} query
 * @param {String} type
 * @returns {{castedQuery:any, opts:Object, isOverwriting:boolean, fields:any}}
 */
function _prepareFindAndModify(query, type) {
  const model = query.model;
  const schema = model.schema;

  const castedQuery = castQuery(query);
  if (castedQuery instanceof Error) {
    return { error: castedQuery };
  }

  _castArrayFilters(query);

  const opts = query._optionsForExec(model);
  if ('strict' in opts) {
    query._mongooseOptions.strict = opts.strict;
  }

  const isOverwriting = query.options.overwrite && !hasDollarKeys(query._update);
  if (isOverwriting) {
    query._update = new query.model(query._update, null, true);
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
      query._update = castDoc(query, opts.overwrite);
      if (query._update instanceof Error) {
        return { error: query._update };
      }

      const _opts = Object.assign({}, opts, {
        setDefaultsOnInsert: query._mongooseOptions.setDefaultsOnInsert
      });
      query._update = setDefaultsOnInsert(query._conditions, schema, query._update, _opts);
      if (!query._update || Object.keys(query._update).length === 0) {
        if (opts.upsert) {
          const doc = utils.clone(castedQuery);
          delete doc._id;
          query._update = { $set: doc };
        } else {
          query.findOne(cb => cb(null, null));
          return { earlyReturn: true };
        }
      } else if (query._update.$set && Object.keys(query._update.$set).length === 0) {
        delete query._update.$set;
      }
    }

    if (Array.isArray(opts.arrayFilters)) {
      opts.arrayFilters = removeUnusedArrayFilters(query._update, opts.arrayFilters);
    }
  }

  query._applyPaths();

  let fields;
  if (query._fields) {
    fields = utils.clone(query._fields);
    opts.projection = query._castFields(fields);
    if (opts.projection instanceof Error) {
      return { error: opts.projection };
    }
  }

  if (opts.sort) {
    convertSortToArray(opts);
  }

  return { castedQuery, opts, fields };
}

/**
 * Executes findAndModify using the appropriate driver method.
 *
 * @private
 * @param {Query} query
 * @param {String} type
 * @param {any} castedQuery
 * @param {Object} opts
 * @param {Function} callback
 */
function _executeFindAndModify(query, type, castedQuery, opts, callback) {
  const cb = function(err, doc, res) {
    if (err) {
      return callback(err);
    }
    query._completeOne(doc, res, callback);
  };

  const collection = query._collection.collection;
  const updateMethod = type === 'remove' ? 'findOneAndDelete' : (query.options.overwrite ? 'findOneAndReplace' : 'findOneAndUpdate');

  const runValidators = _getOption(query, 'runValidators', false);
  if (runValidators) {
    query.validate(query._update, opts, query.options.overwrite, function(error) {
      if (error) {
        return callback(error);
      }
      if (query._update && query._update.toBSON) {
        query._update = query._update.toBSON();
      }
      collection[updateMethod](castedQuery, query._update, opts, _wrapThunkCallback(query, cb));
    });
  } else {
    if (query._update && query._update.toBSON) {
      query._update = query._update.toBSON();
    }
    collection[updateMethod](castedQuery, query._update, opts, _wrapThunkCallback(query, cb));
  }
}

/**
 * Determines whether to use the legacy findAndModify path.
 *
 * @private
 * @param {Query} query
 * @returns {boolean}
 */
function _shouldUseLegacyFindAndModify(query) {
  const base = query.model && query.model.base;
  const conn = get(query.model, 'collection.conn', {});
  let useFindAndModify = true;
  if (base && 'useFindAndModify' in base.options) {
    useFindAndModify = base.get('useFindAndModify');
  }
  if (conn && conn.config && 'useFindAndModify' in conn.config) {
    useFindAndModify = conn.config.useFindAndModify;
  }
  if (query._mongooseOptions && 'useFindAndModify' in query._mongooseOptions) {
    useFindAndModify = query._mongooseOptions.useFindAndModify;
  }
  return useFindAndModify === false;
}

/**
 * Core findAndModify implementation.
 *
 * @method _findAndModify
 * @memberOf Query
 * @private
 */

Query.prototype._findAndModify = function(type, callback) {
  if (typeof callback !== 'function') {
    throw new Error('Expected callback in _findAndModify');
  }

  const preparation = _prepareFindAndModify(this, type);
  if (preparation.error) {
    return callback(preparation.error);
  }
  if (preparation.earlyReturn) {
    return;
  }

  const { castedQuery, opts, fields } = preparation;

  if (_shouldUseLegacyFindAndModify(this)) {
    convertNewToReturnDocument(opts);
    const collection = this._collection.collection;
    const method = type === 'remove' ? 'findOneAndDelete' : (this.options.overwrite ? 'findOneAndReplace' : 'findOneAndUpdate');
    collection[method](castedQuery, this._update, opts, _wrapThunkCallback(this, (err, res) => {
      if (err) {
        return callback(err);
      }
      const doc = res ? res.value : res;
      this._completeOne(doc, res, callback);
    }));
    return this;
  }

  _executeFindAndModify(this, type, castedQuery, opts, callback);
  return this;
};

/**
 * Converts legacy `new`/`returnOriginal` options.
 *
 * @private
 * @param {Object} options
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

/**
 * Converts sort object to array format.
 *
 * @private
 * @param {Object} opts
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

/**
 * Helper for update thunk.
 *
 * @private
 * @param {Query} query
 * @param {String} op
 * @param {Function} callback
 */
function _updateThunk(query, op, callback) {
  query._castConditions();

  _castArrayFilters(query);

  if (query.error() != null) {
    callback(query.error());
    return null;
  }

  callback = _wrapThunkCallback(query, callback);
  const oldCb = callback;
  callback = function(error, result) {
    oldCb(error, result ? result.result : { ok: 0, n: 0, nModified: 0 });
  };

  const castedQuery = query._conditions;
  const options = query._optionsForExec(query.model);

  ++query._executionCount;

  query._update = utils.clone(query._update, options);
  const isOverwriting = query.options.overwrite && !hasDollarKeys(query._update);
  if (isOverwriting) {
    if (op === 'updateOne' || op === 'updateMany') {
      return callback(new MongooseError('The MongoDB server disallows ' +
        'overwriting documents using `' + op + '`. See: ' +
        'https://mongoosejs.com/docs/deprecations.html#update'));
    }
    query._update = new query.model(query._update, null, true);
  } else {
    query._update = castDoc(query, options.overwrite);

    if (query._update instanceof Error) {
      callback(query._update);
      return null;
    }

    if (query._update == null || Object.keys(query._update).length === 0) {
      callback(null, 0);
      return null;
    }

    const _opts = Object.assign({}, options, {
      setDefaultsOnInsert: query._mongooseOptions.setDefaultsOnInsert
    });
    query._update = setDefaultsOnInsert(query._conditions, query.model.schema,
      query._update, _opts);
  }

  if (Array.isArray(options.arrayFilters)) {
    options.arrayFilters = removeUnusedArrayFilters(query._update, options.arrayFilters);
  }

  const runValidators = _getOption(query, 'runValidators', false);
  if (runValidators) {
    query.validate(query._update, options, isOverwriting, err => {
      if (err) {
        return callback(err);
      }

      if (query._update.toBSON) {
        query._update = query._update.toBSON();
      }
      query._collection[op](castedQuery, query._update, options, callback);
    });
    return null;
  }

  if (query._update.toBSON) {
    query._update = query._update.toBSON();
  }

  query._collection[op](castedQuery, query._update, options, callback);
  return null;
}

/**
 * Internal thunk for .update()
 *
 * @method _execUpdate
 * @memberOf Query
 * @private
 */
Query.prototype._execUpdate = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'update', callback);
});

/**
 * Internal thunk for .updateMany()
 *
 * @method _updateMany
 * @memberOf Query
 * @private
 */
Query.prototype._updateMany = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'updateMany', callback);
});

/**
 * Internal thunk for .updateOne()
 *
 * @method _updateOne
 * @memberOf Query
 * @private
 */
Query.prototype._updateOne = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'updateOne', callback);
});

/**
 * Internal thunk for .replaceOne()
 *
 * @method _replaceOne
 * @memberOf Query
 * @private
 */
Query.prototype._replaceOne = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'replaceOne', callback);
});

/**
 * Helper for update operations.
 *
 * @private
 * @param {Query} query
 * @param {String} op
 * @param {Object} filter
 * @param {Object} doc
 * @param {Object} options
 * @param {Function} callback
 * @returns {Query}
 */
function _update(query, op, filter, doc, options, callback) {
  query.op = op;
  filter = utils.toObject(filter);
  doc = doc || {};

  if (options != null && 'strict' in options) {
    query._mongooseOptions.strict = options.strict;
  }

  if (!(filter instanceof Query) && filter != null && filter.toString() !== '[object Object]') {
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
 * Update API.
 *
 * @method update
 * @memberOf Query
 * @public
 */
Query.prototype.update = function(conditions, doc, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    callback = doc;
    doc = conditions;
    conditions = {};
    options = null;
  } else if (typeof conditions === 'function') {
    callback = conditions;
    conditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof conditions === 'object' && !doc && !options && !callback) {
    doc = conditions;
    conditions = undefined;
    options = undefined;
    callback = undefined;
  }

  return _update(this, 'update', conditions, doc, options, callback);
};

/**
 * UpdateMany API.
 *
 * @method updateMany
 * @memberOf Query
 * @public
 */
Query.prototype.updateMany = function(conditions, doc, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    callback = doc;
    doc = conditions;
    conditions = {};
    options = null;
  } else if (typeof conditions === 'function') {
    callback = conditions;
    conditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof conditions === 'object' && !doc && !options && !callback) {
    doc = conditions;
    conditions = undefined;
    options = undefined;
    callback = undefined;
  }

  return _update(this, 'updateMany', conditions, doc, options, callback);
};

/**
 * UpdateOne API.
 *
 * @method updateOne
 * @memberOf Query
 * @public
 */
Query.prototype.updateOne = function(conditions, doc, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    callback = doc;
    doc = conditions;
    conditions = {};
    options = null;
  } else if (typeof conditions === 'function') {
    callback = conditions;
    conditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof conditions === 'object' && !doc && !options && !callback) {
    doc = conditions;
    conditions = undefined;
    options = undefined;
    callback = undefined;
  }

  return _update(this, 'updateOne', conditions, doc, options, callback);
};

/**
 * ReplaceOne API.
 *
 * @method replaceOne
 * @memberOf Query
 * @public
 */
Query.prototype.replaceOne = function(conditions, doc, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  } else if (typeof doc === 'function') {
    callback = doc;
    doc = conditions;
    conditions = {};
    options = null;
  } else if (typeof conditions === 'function') {
    callback = conditions;
    conditions = undefined;
    doc = undefined;
    options = undefined;
  } else if (typeof conditions === 'object' && !doc && !options && !callback) {
    doc = conditions;
    conditions = undefined;
    options = undefined;
    callback = undefined;
  }

  this.setOptions({ overwrite: true });
  return _update(this, 'replaceOne', conditions, doc, options, callback);
};

/**
 * Executes the query.
 *
 * @method exec
 * @memberOf Query
 * @public
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

/**
 * Cleans CastError stack.
 *
 * @private
 * @param {CastError} castError
 * @param {Error} error
 * @returns {Error}
 */
function _cleanCastErrorStack(castError, error) {
  if (error instanceof CastError) {
    castError.copy(error);
    return castError;
  }

  return error;
}

/**
 * Wraps thunk callback with transforms.
 *
 * @private
 * @param {Query} query
 * @param {Function} cb
 * @returns {Function}
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
 * Promise then.
 *
 * @method then
 * @memberOf Query
 * @public
 */
Query.prototype.then = function(resolve, reject) {
  return this.exec().then(resolve, reject);
};

/**
 * Promise catch.
 *
 * @method catch
 * @memberOf Query
 * @public
 */
Query.prototype.catch = function(reject) {
  return this.exec().then(null, reject);
};

/**
 * Pre middleware.
 *
 * @method pre
 * @memberOf Query
 * @public
 */
Query.prototype.pre = function(fn) {
  this._hooks.pre('exec', fn);
  return this;
};

/**
 * Post middleware.
 *
 * @method post
 * @memberOf Query
 * @public
 */
Query.prototype.post = function(fn) {
  this._hooks.post('exec', fn);
  return this;
};

/**
 * Validate helper.
 *
 * @method validate
 * @memberOf Query
 * @private
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
      immediate(() => {
        cb(err);
      });
    }
  });
};

/**
 * Populate helper.
 *
 * @method populate
 * @memberOf Query
 * @public
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
 * Get populated paths.
 *
 * @method getPopulatedPaths
 * @memberOf Query
 * @public
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

/**
 * Helper for getPopulatedPaths.
 *
 * @private
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
 * Cast query.
 *
 * @method cast
 * @memberOf Query
 * @public
 */
Query.prototype.cast = function(model, obj) {
  obj || (obj = this._conditions);

  model = model || this.model;
  const discriminatorKey = model.schema.options.discriminatorKey;
  if (obj != null && obj.hasOwnProperty(discriminatorKey)) {
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
 * Cast fields.
 *
 * @method _castFields
 * @memberOf Query
 * @private
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
 * Apply paths.
 *
 * @method _applyPaths
 * @memberOf Query
 * @private
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
 * Cursor helper.
 *
 * @method cursor
 * @memberOf Query
 * @public
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
 * Maxscan alias.
 *
 * @method maxscan
 * @memberOf Query
 */
Query.prototype.maxscan = Query.base.maxScan;

/**
 * Tailable helper.
 *
 * @method tailable
 * @memberOf Query
 * @public
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
 * Box helper.
 *
 * @method box
 * @memberOf Query
 * @public
 */
Query.prototype.box = function(ll, ur) {
  if (!Array.isArray(ll) && utils.isObject(ll)) {
    ur = ll.ur;
    ll = ll.ll;
  }
  return Query.base.box.call(this, ll, ur);
};

/**
 * Center alias.
 *
 * @method center
 * @memberOf Query
 */
Query.prototype.center = Query.base.circle;

/**
 * CenterSphere helper.
 *
 * @method centerSphere
 * @memberOf Query
 * @public
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
 * Selected inclusively.
 *
 * @method selectedInclusively
 * @memberOf Query
 * @public
 */
Query.prototype.selectedInclusively = function selectedInclusively() {
  return isInclusive(this._fields);
};

/**
 * Selected exclusively.
 *
 * @method selectedExclusively
 * @memberOf Query
 * @public
 */
Query.prototype.selectedExclusively = function selectedExclusively() {
  return isExclusive(this._fields);
};

/**
 * Export.
 */
module.exports = Query;