Query.prototype.setOptions = function(options) {
  const opts = {};
  if (options) {
    if (options.maxTimeMS) opts.maxTimeMS = options.maxTimeMS;
    if (options.readPreference) opts.readPreference = options.readPreference;
    if (options.hint) opts.hint = options.hint;
    if (options.comment) opts.comment = options.comment;
    if (options.snapshot) opts.snapshot = options.snapshot;
    if (options.maxScan) opts.maxScan = options.maxScan;
    if (options.batchSize) opts.batchSize = options.batchSize;
    if (options.lean) opts.lean = options.lean;
    if (options.populate) opts.populate = options.populate;
    if (options.projection) opts.projection = options.projection;
    if (options.collation) opts.collation = options.collation;
    if (options.session) opts.session = options.session;
    if (options.explain) opts.explain = options.explain;
    if (options.allowDiskUse) opts.allowDiskUse = options.allowDiskUse;
  }
  return Query.base.setOptions.call(this, opts);
};