Connection.prototype.set = function(key, val) {
  if (this.config.hasOwnProperty(key)) {
    const previousValue = this.config[key];
    this.config[key] = val;
    return previousValue;
  }

  this.options = this.options || {};
  const previousValue = this.options[key];
  this.options[key] = val;
  return previousValue;
};