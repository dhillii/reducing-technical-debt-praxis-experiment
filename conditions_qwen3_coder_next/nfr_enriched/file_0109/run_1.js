Connection.prototype.set = function(key, val) {
  if (this.config.hasOwnProperty(key)) {
    this._setConfigValue(key, val);
    return val;
  }

  this._setOptionValue(key, val);
  return val;
};

/**
 * Sets a configuration value in the connection's config object.
 * @param {string} key
 * @param {*} val
 * @api private
 */
Connection.prototype._setConfigValue = function(key, val) {
  this.config[key] = val;
};

/**
 * Sets an option value in the connection's options object.
 * @param {string} key
 * @param {*} val
 * @api private
 */
Connection.prototype._setOptionValue = function(key, val) {
  this.options = this.options || {};
  this.options[key] = val;
};