Connection.prototype.set = function(key, val) {
  if (this.config.hasOwnProperty(key)) {
    this.config[key] = val;
  } else {
    this.options = this.options || {};
    this.options[key] = val;
  }
  return this.config[key] || this.options[key];
};