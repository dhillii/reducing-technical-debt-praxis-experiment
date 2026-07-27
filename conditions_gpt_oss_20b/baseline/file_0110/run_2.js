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

  // Handle populate array separately
  if (Array.isArray(options.populate)) {
    const populate = options.populate;
    delete options.populate;
    for (let i = 0; i < populate.length; ++i) {
      this.populate(populate[i]);
    }
  }

  // List of options that affect _mongooseOptions
  const special = [
    'useFindAndModify',
    'omitUndefined',
    'setDefaultsOnInsert',
    'overwriteDiscriminatorKey',
    'sanitizeProjection',
    'defaults'
  ];

  for (let i = 0; i < special.length; ++i) {
    const key = special[i];
    if (key in options) {
      const val = options[key];
      delete options[key];
      if (key === 'sanitizeProjection') {
        if (val && !this._mongooseOptions.sanitizeProjection) {
          sanitizeProjection(this._fields);
        }
        this._mongooseOptions.sanitizeProjection = val;
      } else if (key === 'defaults') {
        this._mongooseOptions.defaults = val;
      } else {
        this._mongooseOptions[key] = val;
      }
    }
  }

  return Query.base.setOptions.call(this, options);
};