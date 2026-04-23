```javascript
/**
 * Override mquery.prototype._findAndModify to provide casting etc.
 *
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
  const query = this; // alias for readability

  // -------------------------------------------------------------------------
  // 1. Cast query & array filters
  // -------------------------------------------------------------------------
  const castedQuery = castQuery(query);
  if (castedQuery instanceof Error) {
    return callback(castedQuery);
  }

  _castArrayFilters(query);

  // -------------------------------------------------------------------------
  // 2. Build options
  // -------------------------------------------------------------------------
  const opts = query._optionsForExec(model);
  if ('strict' in opts) {
    query._mongooseOptions.strict = opts.strict;
  }

  // -------------------------------------------------------------------------
  // 3. Prepare update (if not a remove)
  // -------------------------------------------------------------------------
  if (type === 'remove') {
    opts.remove = true;
  } else {
    _prepareUpdateOptions(query, opts);
    const isOverwriting = query.options.overwrite && !hasDollarKeys(query._update);
    if (isOverwriting) {
      query._update = new query.model(query._update, null, true);
    } else {
      const casted = castDoc(query, opts.overwrite);
      if (casted instanceof Error) {
        return callback(casted);
      }
      query._update = casted;

      const defaultsOpts = Object.assign({}, opts, {
        setDefaultsOnInsert: query._mongooseOptions.setDefaultsOnInsert
      });
      query._update = setDefaultsOnInsert(query._conditions, schema, query._update, defaultsOpts);

      if (!query._update || Object.keys(query._update).length === 0) {
        if (opts.upsert) {
          const doc = utils.clone(castedQuery);
          delete doc._id;
          query._update = { $set: doc };
        } else {
          // No update to send – fall back to a findOne
          return query.findOne(callback);
        }
      } else if (query._update.$set && Object.keys(query._update.$set).length === 0) {
        delete query._update.$set;
      }
    }

    if (Array.isArray(opts.arrayFilters)) {
      opts.arrayFilters = removeUnusedArrayFilters(query._update, opts.arrayFilters);
    }
  }

  // -------------------------------------------------------------------------
  // 4. Apply paths & projection
  // -------------------------------------------------------------------------
  query._applyPaths();

  if (query._fields) {
    const fields = utils.clone(query._fields);
    opts.projection = query._castFields(fields);
    if (opts.projection instanceof Error) {
      return callback(opts.projection);
    }
  }

  if (opts.sort) {
    convertSortToArray(opts);
  }

  // -------------------------------------------------------------------------
  // 5. Execute findAndModify (or its modern alternatives)
  // -------------------------------------------------------------------------
  const cb = (err, doc, res) => {
    if (err) return callback(err);
    query._completeOne(doc, res, callback);
  };

  let useFindAndModify = _shouldUseFindAndModify(query);
  const runValidators = _getOption(query, 'runValidators', false);

  if (!useFindAndModify) {
    return _executeModernFindAndModify(query, type, castedQuery, opts, runValidators, cb);
  }

  if (runValidators) {
    return query.validate(query._update, opts, type === 'remove' ? false : query.options.overwrite, err => {
      if (err) return callback(err);
      _legacyFindAndModify.call(query, castedQuery, query._update, opts, cb);
    });
  }

  _legacyFindAndModify.call(query, castedQuery, query._update, opts, cb);
  return this;
};

/* -------------------------------------------------------------------------
 * Helper: decide whether to use the deprecated findAndModify path
 * ------------------------------------------------------------------------- */
function _shouldUseFindAndModify(query) {
  const base = query.model && query.model.base;
  const conn = get(query.model, 'collection.conn', {});
  let useFindAndModify = true;

  if (base && 'useFindAndModify' in base.options) {
    useFindAndModify = base.get('useFindAndModify');
  }
  if (conn.config && 'useFindAndModify' in conn.config) {
    useFindAndModify = conn.config.useFindAndModify;
  }
  if (query._mongooseOptions && 'useFindAndModify' in query._mongooseOptions) {
    useFindAndModify = query._mongooseOptions.useFindAndModify;
  }
  return useFindAndModify;
}

/* -------------------------------------------------------------------------
 * Helper: execute the modern driver methods when useFindAndModify === false
 * ------------------------------------------------------------------------- */
function _executeModernFindAndModify(query, type, filter, opts, runValidators, cb) {
  const collection = query._collection.collection;
  convertNewToReturnDocument(opts);

  if (type === 'remove') {
    return collection.findOneAndDelete(filter, opts, _wrapThunkCallback(query, (err, res) => {
      cb(err, res ? res.value : null, res);
    }));
  }

  const method = query.options.overwrite ? 'findOneAndReplace' : 'findOneAndUpdate';

  const execUpdate = () => {
    if (query._update && query._update.toBSON) {
      query._update = query._update.toBSON();
    }
    collection[method](filter, query._update, opts, _wrapThunkCallback(query, (err, res) => {
      cb(err, res ? res.value : null, res);
    }));
  };

  if (!runValidators) {
    return execUpdate();
  }

  query.validate(query._update, opts, query.options.overwrite, err => {
    if (err) return cb(err);
    execUpdate();
  });
}

/* -------------------------------------------------------------------------
 * Helper: set default update options (new/returnDocument, upsert, etc.)
 * ------------------------------------------------------------------------- */
function _prepareUpdateOptions(query, opts) {
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
```