Connection.prototype.set = function(key, val) {
  /**
   * Sets the value of the option `key`. Equivalent to `conn.options[key] = val`
   * @param {String} key
   * @param {Any} val
   * @return {Any} val
   * @api public
   */
  if (!this.config.hasOwnProperty(key)) {
    this.options = this.options || {};
    this.options[key] = val;
    return val;
  }

  this.config[key] = val;
  return val;
};