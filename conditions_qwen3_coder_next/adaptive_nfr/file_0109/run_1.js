Connection.prototype.set = function(key, val) {
  const hasConfigKey = this.config.hasOwnProperty(key);
  
  if (hasConfigKey) {
    this.config[key] = val;
    return val;
  }

  this.options = this.options || {};
  this.options[key] = val;
  return val;
};