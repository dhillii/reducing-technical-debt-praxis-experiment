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

  const { populate, useFindAndModify, omitUndefined, setDefaultsOnInsert, overwriteDiscriminatorKey, sanitizeProjection, defaults } = options;

  if (Array.isArray(populate)) {
    const _numPopulate = populate.length;
    for (let i = 0; i < _numPopulate; ++i) {
      this.populate(populate[i]);
    }
  }

  if (useFindAndModify != null) {
    this._mongooseOptions.useFindAndModify = useFindAndModify;
  }
  if (omitUndefined != null) {
    this._mongooseOptions.omitUndefined = omitUndefined;
  }
  if (setDefaultsOnInsert != null) {
    this._mongooseOptions.setDefaultsOnInsert = setDefaultsOnInsert;
  }
  if (overwriteDiscriminatorKey != null) {
    this._mongooseOptions.overwriteDiscriminatorKey = overwriteDiscriminatorKey;
  }
  if (sanitizeProjection != null) {
    if (sanitizeProjection && !this._mongooseOptions.sanitizeProjection) {
      sanitizeProjection(this._fields);
    }
    this._mongooseOptions.sanitizeProjection = sanitizeProjection;
  }

  if (defaults != null) {
    this._mongooseOptions.defaults = defaults;
  }

  delete options.populate;
  delete options.useFindAndModify;
  delete options.omitUndefined;
  delete options.setDefaultsOnInsert;
  delete options.overwriteDiscriminatorKey;
  delete options.sanitizeProjection;
  delete options.defaults;

  return Query.base.setOptions.call(this, options);
};