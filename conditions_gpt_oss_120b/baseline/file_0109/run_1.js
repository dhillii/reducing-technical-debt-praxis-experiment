Connection.prototype.authMechanismDoesNotRequirePassword = function() {
  if (this.options && this.options.auth && this.options.auth.authMechanism) {
    return noPasswordAuthMechanisms.includes(this.options.auth.authMechanism);
  }
  // Default to requiring a password unless explicitly specified
  return false;
};