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

  // Handle populate array separately to avoid complexity
  if (Array.isArray(options.populate)) {
    const populate = options.populate;
    delete options.populate;
    const _numPopulate = populate.length;
    for (let i = 0; i < _numPopulate; ++i) {
      this.populate(populate[i]);
    }
  }

  // Extract options definitions to helper function
  _setMongooseOptions(this, options);

  return Query.base.setOptions.call(this, options);
};

/**
 * Sets Mongoose-specific options from the options object.
 * This function reduces cognitive complexity in setOptions by handling
 * Mongoose-specific option assignments in a dedicated helper.
 *
 * @param {Query} query
 * @param {Object} options
 * @api private
 */

function _setMongooseOptions(query, options) {
  if ('useFindAndModify' in options) {
    query._mongooseOptions.useFindAndModify = options.useFindAndModify;
    delete options.useFindAndModify;
  }
  if ('omitUndefined' in options) {
    query._mongooseOptions.omitUndefined = options.omitUndefined;
    delete options.omitUndefined;
  }
  if ('setDefaultsOnInsert' in options) {
    query._mongooseOptions.setDefaultsOnInsert = options.setDefaultsOnInsert;
    delete options.setDefaultsOnInsert;
  }
  if ('overwriteDiscriminatorKey' in options) {
    query._mongooseOptions.overwriteDiscriminatorKey = options.overwriteDiscriminatorKey;
    delete options.overwriteDiscriminatorKey;
  }
  if ('sanitizeProjection' in options) {
    if (options.sanitizeProjection && !query._mongooseOptions.sanitizeProjection) {
      sanitizeProjection(query._fields);
    }

    query._mongooseOptions.sanitizeProjection = options.sanitizeProjection;
    delete options.sanitizeProjection;
  }

  if ('defaults' in options) {
    query._mongooseOptions.defaults = options.defaults;
    // deleting options.defaults will cause 7287 to fail
  }
}