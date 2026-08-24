Connection.prototype.set = function(key, val) {
  if (this.config.hasOwnProperty(key)) {
    this._setValueInConfig(key, val);
    return val;
  }

  this._ensureOptionsInitialized();
  this.options[key] = val;
  return val;
};

/**
 * Sets a value in the config object.
 * @param {string} key
 * @param {any} val
 * @api private
 */
Connection.prototype._setValueInConfig = function(key, val) {
  this.config[key] = val;
};

/**
 * Ensures options object is initialized.
 * @api private
 */
Connection.prototype._ensureOptionsInitialized = function() {
  if (!this.options) {
    this.options = {};
  }
};