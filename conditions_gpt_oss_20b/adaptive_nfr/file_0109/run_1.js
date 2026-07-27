Connection.prototype.set = function(key, val) {
  if (!isConfigKey.call(this, key)) {
    this.options = this.options || {};
    this.options[key] = val;
    return undefined;
  }
  const previous = this.config[key];
  this.config[key] = val;
  return previous;
};

/**
 * Checks if the configuration object has the specified key.
 *
 * @param {String} key - The configuration key to check.
 * @returns {Boolean} True if the key exists in the configuration object.
 * @private
 */
function isConfigKey(key) {
  return this.config.hasOwnProperty(key);
}