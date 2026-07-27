Query.prototype.setOptions = function(options) {
  const opts = {};
  if (options) {
    if (options.lean) opts.lean = options.lean;
    if (options.populate) opts.populate = options.populate;
    if (options.readPreference) opts.readPreference = options.readPreference;
    if (options.maxTimeMS) opts.maxTimeMS = options.maxTimeMS;
    // Add other options as needed
  }
  return Query.base.setOptions.call(this, opts);
};