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

Query.prototype = new mquery;
Query.prototype.constructor = Query;
Query.base = mquery.prototype;

Query.use$geoWithin = mquery.use$geoWithin;

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

Query.prototype.projection = function(arg) {
  if (arguments.length === 0) {
    return this._fields;
  }

  this._fields = {};
  this._userProvidedFields = {};
  this.select(arg);
  return this._fields;
};

Query.prototype.select = function select() {
  let arg = arguments[0];
  if (!arg) return this;

  if (arguments.length !== 1) {
    throw new Error('Invalid select: select only takes 1 argument');
  }

  this._validate('select');

  const fields = this._fields || (this._fields = {});
  const userProvidedFields = this._userProvidedFields || (this._userProvidedFields = {});
  const sanitizeProjectionValue = _getSanitizeProjection(this);

  arg = parseProjection(arg);

  if (utils.isObject(arg)) {
    const keys = Object.keys(arg);
    for (let i = 0; i < keys.length; ++i) {
      let value = arg[keys[i]];
      if (typeof value === 'string' && sanitizeProjectionValue) {
        value = 1;
      }
      fields[keys[i]] = value;
      userProvidedFields[keys[i]] = value;
    }
    return this;
  }

  throw new TypeError('Invalid select() argument. Must be string or object.');
};

function _getSanitizeProjection(query) {
  if (query.model != null && utils.hasUserDefinedProperty(query.model.db.options, 'sanitizeProjection')) {
    return query.model.db.options.sanitizeProjection;
  }
  if (query.model != null && utils.hasUserDefinedProperty(query.model.base.options, 'sanitizeProjection')) {
    return query.model.base.options.sanitizeProjection;
  }
  return query._mongooseOptions.sanitizeProjection;
}

Query.prototype.read = function read(pref, tags) {
  const read = new ReadPreference(pref, tags);
  this.options.readPreference = read;
  return this;
};

Query.prototype.session = function session(v) {
  if (v == null) {
    delete this.options.session;
  }
  this.options.session = v;
  return this;
};

Query.prototype.writeConcern = function writeConcern(val) {
  if (val == null) {
    delete this.options.writeConcern;
    return this;
  }
  this.options.writeConcern = val;
  return this;
};

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

Query.prototype.getOptions = function() {
  return this.options;
};

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

  _setMongooseOption(this, 'useFindAndModify', options);
  _setMongooseOption(this, 'omitUndefined', options);
  _setMongooseOption(this, 'setDefaultsOnInsert', options);
  _setMongooseOption(this, 'overwriteDiscriminatorKey', options);

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

function _setMongooseOption(query, option, options) {
  if (option in options) {
    query._mongooseOptions[option] = options[option];
    delete options[option];
  }
}

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

Query.prototype.maxTimeMS = function(ms) {
  this.options.maxTimeMS = ms;
  return this;
};

Query.prototype.getFilter = function() {
  return this._conditions;
};

Query.prototype.getQuery = function() {
  return this._conditions;
};

Query.prototype.setQuery = function(val) {
  this._conditions = val;
};

Query.prototype.getUpdate = function() {
  return this._update;
};

Query.prototype.setUpdate = function(val) {
  this._update = val;
};

Query.prototype._fieldsForExec = function() {
  return utils.clone(this._fields);
};

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

const safeDeprecationWarning = 'Mongoose: the `safe` option is deprecated. ' +
  'Use write concerns instead: http://bit.ly/mongoose-w';

const setSafe = util.deprecate(function setSafe(options, safe) {
  options.safe = safe;
}, safeDeprecationWarning);

Query.prototype.lean = function(v) {
  this._mongooseOptions.lean = arguments.length ? v : true;
  return this;
};

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

Query.prototype.error = function error(err) {
  if (arguments.length === 0) {
    return this._error;
  }

  this._error = err;
  return this;
};

Query.prototype._unsetCastError = function _unsetCastError() {
  if (this._error != null && !(this._error instanceof CastError)) {
    return;
  }
  return this.error(null);
};

Query.prototype.mongooseOptions = function(v) {
  if (arguments.length > 0) {
    this._mongooseOptions = v;
  }
  return this._mongooseOptions;
};

Query.prototype._castConditions = function() {
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

Query.prototype.collation = function(value) {
  if (this.options == null) {
    this.options = {};
  }
  this.options.collation = value;
  return this;
};

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

Query.prototype.findOne = function(conditions, projection, options, callback) {
  this.op = 'findOne';
  if (typeof conditions === 'function') {
    callback = conditions;
    conditions = null;
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

  conditions = utils.toObject(conditions);

  if (options) {
    this.setOptions(options);
  }

  if (projection) {
    this.select(projection);
  }

  if (mquery.canMerge(conditions)) {
    this.merge(conditions);

    prepareDiscriminatorCriteria(this);
  } else if (conditions != null) {
    this.error(new ObjectParameterError(conditions, 'filter', 'findOne'));
  }

  if (!callback) {
    return Query.base.findOne.call(this);
  }

  this.exec(callback);
  return this;
};

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

Query.prototype._countDocuments = wrapThunk(function(callback) {
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

Query.prototype._estimatedDocumentCount = wrapThunk(function(callback) {
  if (this.error()) {
    return callback(this.error());
  }

  const options = this._optionsForExec();

  this._collection.collection.estimatedDocumentCount(options, utils.tick(callback));
});

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

Query.prototype.sort = function(arg) {
  if (arguments.length > 1) {
    throw new Error('sort() only takes 1 Argument');
  }

  return Query.base.sort.call(this, arg);
};

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

Query.prototype._remove = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return this;
  }

  callback = _wrapThunkCallback(this, callback);

  return Query.base.remove.call(this, helpers.handleDeleteWriteOpResult(callback));
});

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

Query.prototype._deleteOne = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return this;
  }

  callback = _wrapThunkCallback(this, callback);

  return Query.base.deleteOne.call(this, helpers.handleDeleteWriteOpResult(callback));
});

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

Query.prototype._deleteMany = wrapThunk(function(callback) {
  this._castConditions();

  if (this.error() != null) {
    callback(this.error());
    return this;
  }

  callback = _wrapThunkCallback(this, callback);

  return Query.base.deleteMany.call(this, helpers.handleDeleteWriteOpResult(callback));
});

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

function prepareDiscriminatorCriteria(query) {
  if (!query || !query.model || !query.model.schema) {
    return;
  }

  const schema = query.model.schema;

  if (schema && schema.discriminatorMapping && !schema.discriminatorMapping.isRoot) {
    query._conditions[schema.discriminatorMapping.key] = schema.discriminatorMapping.value;
  }
}

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

Query.prototype._findOneAndUpdate = wrapThunk(function(callback) {
  if (this.error() != null) {
    return callback(this.error());
  }

  this._findAndModify('update', callback);
});

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

Query.prototype._findOneAndRemove = wrapThunk(function(callback) {
  if (this.error() != null) {
    callback(this.error());
    return;
  }

  this._findAndModify('remove', callback);
});

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
    _setFindAndModifyOptions(opts);

    if (!isOverwriting) {
      this._update = castDoc(this, opts.overwrite);
      const _opts = Object.assign({}, opts, {
        setDefaultsOnInsert: this._mongooseOptions.setDefaultsOnInsert
      });
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
      } else if (this._update instanceof Error) {
        return callback(this._update);
      } else {
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

  const useFindAndModify = _getUseFindAndModify(this, model);
  const runValidators = _getOption(this, 'runValidators', false);

  if (useFindAndModify === false) {
    _executeFindAndModifyWithoutLegacy(this, type, castedQuery, opts, runValidators, cb);
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

function _setFindAndModifyOptions(opts) {
  if (!('new' in opts) && !('returnOriginal' in opts) && !('returnDocument' in opts)) {
    opts.new = false;
  }
  if (!('upsert' in opts)) {
    opts.upsert = false;
  }
  if (opts.upsert || opts['new']) {
    opts.remove = false;
  }
}

function _getUseFindAndModify(query, model) {
  const base = model && model.base;
  const conn = get(model, 'collection.conn', {});
  const options = query._mongooseOptions;

  if ('useFindAndModify' in base.options) {
    return base.get('useFindAndModify');
  }
  if ('useFindAndModify' in conn.config) {
    return conn.config.useFindAndModify;
  }
  if ('useFindAndModify' in options) {
    return options.useFindAndModify;
  }
  return true;
}

function _executeFindAndModifyWithoutLegacy(query, type, castedQuery, opts, runValidators, cb) {
  const collection = query._collection.collection;
  convertNewToReturnDocument(opts);

  if (type === 'remove') {
    collection.findOneAndDelete(castedQuery, opts, _wrapThunkCallback(query, function(error, res) {
      return cb(error, res ? res.value : res, res);
    }));
    return;
  }

  const isOverwriting = query.options.overwrite && !hasDollarKeys(query._update);
  const updateMethod = isOverwriting ? 'findOneAndReplace' : 'findOneAndUpdate';

  if (runValidators) {
    query.validate(query._update, opts, isOverwriting, error => {
      if (error) {
        return cb(error);
      }
      if (query._update && query._update.toBSON) {
        query._update = query._update.toBSON();
      }

      collection[updateMethod](castedQuery, query._update, opts, _wrapThunkCallback(query, function(error, res) {
        return cb(error, res ? res.value : res, res);
      }));
    });
  } else {
    if (query._update && query._update.toBSON) {
      query._update = query._update.toBSON();
    }
    collection[updateMethod](castedQuery, query._update, opts, _wrapThunkCallback(query, function(error, res) {
      return cb(error, res ? res.value : res, res);
    }));
  }
}

function _completeOneLean(doc, res, opts, callback) {
  if (opts.rawResult) {
    return callback(null, res);
  }
  return callback(null, doc);
}

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

Query.prototype._execUpdate = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'update', callback);
});

Query.prototype._updateMany = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'updateMany', callback);
});

Query.prototype._updateOne = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'updateOne', callback);
});

Query.prototype._replaceOne = wrapThunk(function(callback) {
  return _updateThunk.call(this, 'replaceOne', callback);
});

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

Query.prototype.map = function(fn) {
  this._transforms.push(fn);
  return this;
};

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

function _orFailError(err, query) {
  if (typeof err === 'function') {
    err = err.call(query);
  }

  if (err == null) {
    err = new DocumentNotFoundError(query.getQuery(), query.model.modelName);
  }

  return err;
}

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

function _cleanCastErrorStack(castError, error) {
  if (error instanceof CastError) {
    castError.copy(error);
    return castError;
  }

  return error;
}

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

Query.prototype.then = function(resolve, reject) {
  return this.exec().then(resolve, reject);
};

Query.prototype.catch = function(reject) {
  return this.exec().then(null, reject);
};

Query.prototype.pre = function(fn) {
  this._hooks.pre('exec', fn);
  return this;
};

Query.prototype.post = function(fn) {
  this._hooks.post('exec', fn);
  return this;
};

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

function castQuery(query) {
  try {
    return query.cast(query.model);
  } catch (err) {
    return err;
  }
}

function castDoc(query, overwrite) {
  try {
    return query._castUpdate(query._update, overwrite);
  } catch (err) {
    return err;
  }
}

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

function _getPopulatedPaths(list, arr, prefix) {
  for (const pop of arr) {
    list.push(prefix + pop.path);
    if (!Array.isArray(pop.populate)) {
      continue;
    }
    _getPopulatedPaths(list, pop.populate, prefix + pop.path + '.');
  }
}

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

Query.prototype.maxscan = Query.base.maxScan;

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

Query.prototype.nearSphere = function() {
  this._mongooseOptions.nearSphere = true;
  this.near.apply(this, arguments);
  return this;
};

if (Symbol.asyncIterator != null) {
  Query.prototype[Symbol.asyncIterator] = function() {
    return this.cursor().transformNull()._transformForAsyncIterator();
  };
}

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

Query.prototype.model;

module.exports = Query;