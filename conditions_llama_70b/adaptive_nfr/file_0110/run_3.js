Query.prototype.setOptions = function(options) {
  const opts = {};
  if (options) {
    if (options.maxTimeMS) opts.maxTimeMS = options.maxTimeMS;
    if (options.readPreference) opts.readPreference = options.readPreference;
    if (options.lean) opts.lean = options.lean;
    if (options.populate) opts.populate = options.populate;
    if (options.rawResult) opts.rawResult = options.rawResult;
    if (options.useFindAndModify) opts.useFindAndModify = options.useFindAndModify;
    if (options.omitUndefined) opts.omitUndefined = options.omitUndefined;
    if (options.setDefaultsOnInsert) opts.setDefaultsOnInsert = options.setDefaultsOnInsert;
    if (options.overwriteDiscriminatorKey) opts.overwriteDiscriminatorKey = options.overwriteDiscriminatorKey;
    if (options.sanitizeProjection) opts.sanitizeProjection = options.sanitizeProjection;
    if (options.defaults) opts.defaults = options.defaults;
  }
  return Query.base.setOptions.call(this, opts);
};