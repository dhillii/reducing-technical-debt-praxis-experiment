Query.prototype.setOptions = function(options, overwrite) {
  // overwrite is only for internal use
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

  // Handle populate array separately
  if (Array.isArray(options.populate)) {
    const populate = options.populate;
    delete options.populate;
    populate.forEach(p => this.populate(p));
  }

  // Process special options
  const keys = Object.keys(options);
  for (const key of keys) {
    switch (key) {
      case 'useFindAndModify':
      case 'omitUndefined':
      case 'setDefaultsOnInsert':
      case 'overwriteDiscriminatorKey':
        this._mongooseOptions[key] = options[key];
        delete options[key];
        break;
      case 'sanitizeProjection':
        if (options.sanitizeProjection && !this._mongooseOptions.sanitizeProjection) {
          sanitizeProjection(this._fields);
        }
        this._mongooseOptions.sanitizeProjection = options.sanitizeProjection;
        delete options[key];
        break;
      case 'defaults':
        this._mongooseOptions.defaults = options.defaults;
        // keep defaults in options to avoid breaking existing behavior
        break;
      default:
        // leave other options untouched
        break;
    }
  }

  return Query.base.setOptions.call(this, options);
};