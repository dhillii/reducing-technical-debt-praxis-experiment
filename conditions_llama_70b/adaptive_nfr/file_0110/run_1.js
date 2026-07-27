Query.prototype.setOptions = function(options) {
  const opts = {};
  if (options) {
    if (options.maxTimeMS) opts.maxTimeMS = options.maxTimeMS;
    if (options.readPreference) opts.readPreference = options.readPreference;
    if (options.lean) opts.lean = options.lean;
    if (options.populate) opts.populate = options.populate;
    if (options.strict) opts.strict = options.strict;
    if (options.overwrite) opts.overwrite = options.overwrite;
  }
  return Query.base.setOptions.call(this, opts);
};