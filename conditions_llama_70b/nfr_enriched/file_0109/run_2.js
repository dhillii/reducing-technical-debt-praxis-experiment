/**
 * Sets the value of the option `key`. Equivalent to `conn.options[key] = val`
 *
 * Supported options include:
 *
 * - `maxTimeMS`: Set [`maxTimeMS`](/docs/api.html#query_Query-maxTimeMS) for all queries on this connection.
 * - `useFindAndModify`: Set to `false` to work around the [`findAndModify()` deprecation warning](/docs/deprecations.html#findandmodify)
 *
 * ####Example:
 *
 *     conn.set('test', 'foo');
 *     conn.get('test'); // 'foo'
 *     conn.options.test; // 'foo'
 *
 * @param {String} key
 * @param {Any} val
 * @method set
 * @api public
 */
Connection.prototype.set = function(key, val) {
  // Check if the key exists in the config object
  if (this.config.hasOwnProperty(key)) {
    // Update the config object
    this.config[key] = val;
  } else {
    // Initialize the options object if it doesn't exist
    this.options = this.options || {};
    // Update the options object
    this.options[key] = val;
  }
  // Return the updated value
  return val;
};