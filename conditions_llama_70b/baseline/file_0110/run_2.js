Query.prototype.setOptions = function(options, overwrite) {
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

  // Extract lean option
  const lean = options.lean;
  if (lean !== undefined) {
    this.lean(lean);
    delete options.lean;
  }

  // Extract other options
  const otherOptions = Object.keys(options).reduce((acc, key) => {
    if (key !== 'lean') {
      acc[key] = options[key];
    }
    return acc;
  }, {});

  // Call setOptions on the base query
  return Query.base.setOptions.call(this, otherOptions);
};