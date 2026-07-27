Connection.prototype.set = function(key, val) {
  if (!this.config.hasOwnProperty(key)) {
    this.options = this.options || {};
    this.options[key] = val;
    return val;
  }

  this.config[key] = val;
  return val;
};