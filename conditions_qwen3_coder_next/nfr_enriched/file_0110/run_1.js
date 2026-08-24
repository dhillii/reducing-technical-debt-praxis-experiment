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
    _handlePopulateArray.call(this, options.populate);
    delete options.populate;
  }

  _extractAndSetOptions.call(this, 'useFindAndModify', 'useFindAndModify', options);
  _extractAndSetOptions.call(this, 'omitUndefined', 'omitUndefined', options);
  _extractAndSetOptions.call(this, 'setDefaultsOnInsert', 'setDefaultsOnInsert', options);
  _extractAndSetOptions.call(this, 'overwriteDiscriminatorKey', 'overwriteDiscriminatorKey', options);
  _extractAndSetOptions.call(this, 'sanitizeProjection', 'sanitizeProjection', options, function(val) {
    if (val && !this._mongooseOptions.sanitizeProjection) {
      sanitizeProjection(this._fields);
    }
  }.bind(this));

  if ('defaults' in options) {
    this._mongooseOptions.defaults = options.defaults;
    // deleting options.defaults will cause 7287 to fail
  }

  return Query.base.setOptions.call(this, options);
};

function _extractAndSetOptions(mongooseOptionName, optionName, options, setter) {
  if (optionName in options) {
    if (typeof setter === 'function') {
      setter.call(this, options[optionName]);
    } else {
      this._mongooseOptions[mongooseOptionName] = options[optionName];
    }
    delete options[optionName];
  }
}

function _handlePopulateArray(populate) {
  const _numPopulate = populate.length;
  for (let i = 0; i < _numPopulate; ++i) {
    this.populate(populate[i]);
  }
}