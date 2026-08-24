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

  // Handle populate array externally
  if (Array.isArray(options.populate)) {
    const populate = options.populate;
    delete options.populate;
    const _numPopulate = populate.length;
    for (let i = 0; i < _numPopulate; ++i) {
      this.populate(populate[i]);
    }
  }

  // Single responsibility helper functions for option handling
  _handleFlagOption(this, options, 'useFindAndModify');
  _handleFlagOption(this, options, 'omitUndefined');
  _handleFlagOption(this, options, 'setDefaultsOnInsert');
  _handleFlagOption(this, options, 'overwriteDiscriminatorKey');
  _handleSanitizeProjection(this, options);
  _handleDefaultsOption(this, options);

  return Query.base.setOptions.call(this, options);
};

/**
 * Helper to handle simple boolean flag options
 * @param {Query} query The query instance
 * @param {Object} options The options object
 * @param {string} optionName The option name to handle
 * @api private
 */
function _handleFlagOption(query, options, optionName) {
  if (optionName in options) {
    query._mongooseOptions[optionName] = options[optionName];
    delete options[optionName];
  }
}

/**
 * Helper to handle sanitizeProjection option
 * @param {Query} query The query instance
 * @param {Object} options The options object
 * @api private
 */
function _handleSanitizeProjection(query, options) {
  if ('sanitizeProjection' in options) {
    if (options.sanitizeProjection && !query._mongooseOptions.sanitizeProjection) {
      sanitizeProjection(query._fields);
    }

    query._mongooseOptions.sanitizeProjection = options.sanitizeProjection;
    delete options.sanitizeProjection;
  }
}

/**
 * Helper to handle defaults option
 * @param {Query} query The query instance
 * @param {Object} options The options object
 * @api private
 */
function _handleDefaultsOption(query, options) {
  if ('defaults' in options) {
    query._mongooseOptions.defaults = options.defaults;
    // deleting options.defaults will cause 7287 to fail
  }
}