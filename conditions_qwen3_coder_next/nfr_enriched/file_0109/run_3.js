Connection.prototype.set = function(key, val) {
  if (this.config.hasOwnProperty(key)) {
    _setValue(this.config, key, val);
    return val;
  }

  _ensureOptionsObject(this);
  _setValue(this.options, key, val);
  return val;
};

/**
 * Sets a value in an object if the key exists or creates it if not.
 * @param {Object} obj The target object
 * @param {string} key The key to set
 * @param {*} val The value to set
 * @api private
 */
function _setValue(obj, key, val) {
  obj[key] = val;
}

/**
 * Ensures the options object exists on the connection.
 * @param {Connection} conn The connection instance
 * @api private
 */
function _ensureOptionsObject(conn) {
  if (conn.options == null) {
    conn.options = {};
  }
}