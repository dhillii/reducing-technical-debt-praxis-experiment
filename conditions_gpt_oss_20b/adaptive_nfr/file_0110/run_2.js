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

  _handlePopulateArray.call(this, options);
  _handleSpecialOptions.call(this, options);
  _handleSanitizeProjection.call(this, options);
  _handleDefaults.call(this, options);

  return Query.base.setOptions.call(this, options);
};

/**
 * Handles array of populate options.
 *
 * @param {Object} opts
 * @private
 */
function _handlePopulateArray(opts) {
  if (Array.isArray(opts.populate)) {
    const populate = opts.populate;
    delete opts.populate;
    const len = populate.length;
    for (let i = 0; i < len; ++i) {
      this.populate(populate[i]);
    }
  }
}

/**
 * Handles special mongoose options that should be stored in _mongooseOptions.
 *
 * @param {Object} opts
 * @private
 */
function _handleSpecialOptions(opts) {
  const special = [
    'useFindAndModify',
    'omitUndefined',
    'setDefaultsOnInsert',
    'overwriteDiscriminatorKey'
  ];
  for (const key of special) {
    if (key in opts) {
      this._mongooseOptions[key] = opts[key];
      delete opts[key];
    }
  }
}

/**
 * Handles sanitizeProjection option.
 *
 * @param {Object} opts
 * @private
 */
function _handleSanitizeProjection(opts) {
  if ('sanitizeProjection' in opts) {
    if (opts.sanitizeProjection && !this._mongooseOptions.sanitizeProjection) {
      sanitizeProjection(this._fields);
    }
    this._mongooseOptions.sanitizeProjection = opts.sanitizeProjection;
    delete opts.sanitizeProjection;
  }
}

/**
 * Handles defaults option.
 *
 * @param {Object} opts
 * @private
 */
function _handleDefaults(opts) {
  if ('defaults' in opts) {
    this._mongooseOptions.defaults = opts.defaults;
    // deleting opts.defaults will cause 7287 to fail
  }
}