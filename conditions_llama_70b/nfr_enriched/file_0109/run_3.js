Connection.prototype.set = function(key, val) {
  // Check if the key exists in the config object
  if (this.config.hasOwnProperty(key)) {
    // Update the config value
    this.config[key] = val;
  } else {
    // Initialize options if it doesn't exist
    this.options = this.options || {};
    // Set the value in options
    this.options[key] = val;
  }
  // Return the updated value
  return val;
};