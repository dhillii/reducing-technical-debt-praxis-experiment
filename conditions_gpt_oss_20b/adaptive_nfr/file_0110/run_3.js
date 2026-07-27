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

  _processPopulateArray.call(this, options);
  _processUseFindAndModify.call(this, options);
  _processOmitUndefined.call(this, options);
  _processSetDefaultsOnInsert.call(this, options);
  _processOverwriteDiscriminatorKey.call(this, options);
  _processSanitizeProjection.call(this, options);
  _processDefaults.call(this, options);

  return Query.base.setOptions.call(this, options);
};

/**
 * Process the `populate` array option.
 *
 * @param {Object} options
 * @private
 */
function _processPopulateArray(options) {
  if (Array.isArray(options.populate)) {
    const populate = options.populate;
    delete options.populate;
    const len = populate.length;
    for (let i = 0; i < len; ++i) {
      this.populate(populate[i]);
    }
  }
}

/**
 * Process the `useFindAndModify` option.
 *
 * @param {Object} options
 * @private
 */
function _processUseFindAndModify(options) {
  if ('useFindAndModify' in options) {
    this._mongooseOptions.useFindAndModify = options.useFindAndModify;
    delete options.useFindAndModify;
  }
}

/**
 * Process the `omitUndefined` option.
 *
 * @param {Object} options
 * @private
 */
function _processOmitUndefined(options) {
  if ('omitUndefined' in options) {
    this._mongooseOptions.omitUndefined = options.omitUndefined;
    delete options.omitUndefined;
  }
}

/**
 * Process the `setDefaultsOnInsert` option.
 *
 * @param {Object} options
 * @private
 */
function _processSetDefaultsOnInsert(options) {
  if ('setDefaultsOnInsert' in options) {
    this._mongooseOptions.setDefaultsOnInsert = options.setDefaultsOnInsert;
    delete options.setDefaultsOnInsert;
  }
}

/**
 * Process the `overwriteDiscriminatorKey` option.
 *
 * @param {Object} options
 * @private
 */
function _processOverwriteDiscriminatorKey(options) {
  if ('overwriteDiscriminatorKey' in options) {
    this._mongooseOptions.overwriteDiscriminatorKey = options.overwriteDiscriminatorKey;
    delete options.overwriteDiscriminatorKey;
  }
}

/**
 * Process the `sanitizeProjection` option.
 *
 * @param {Object} options
 * @private
 */
function _processSanitizeProjection(options) {
  if ('sanitizeProjection' in options) {
    if (options.sanitizeProjection && !this._mongooseOptions.sanitizeProjection) {
      sanitizeProjection(this._fields);
    }

    this._mongooseOptions.sanitizeProjection = options.sanitizeProjection;
    delete options.sanitizeProjection;
  }
}

/**
 * Process the `defaults` option.
 *
 * @param {Object} options
 * @private
 */
function _processDefaults(options) {
  if ('defaults' in options) {
    this._mongooseOptions.defaults = options.defaults;
    // deleting options.defaults will cause 7287 to fail
  }
}