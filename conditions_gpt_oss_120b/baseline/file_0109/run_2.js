Connection.prototype.authMechanismDoesNotRequirePassword = function() {
  if (this.options && this.options.auth && this.options.auth.authMechanism) {
    return noPasswordAuthMechanisms.includes(this.options.auth.authMechanism);
  }
  return false;
};