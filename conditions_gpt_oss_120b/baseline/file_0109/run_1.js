```javascript
/**
 * @brief Returns a boolean value that specifies if the current authentication mechanism needs a
 * password to authenticate according to the auth objects passed into the openUri methods.
 * @api private
 * @return {Boolean} true if the authentication mechanism specified in the options object requires
 *  a password, otherwise false.
 */
Connection.prototype.authMechanismDoesNotRequirePassword = function() {
  // Return true only for mechanisms explicitly known to not require a password.
  // If no auth options are provided, assume a password is required.
  if (this.options && this.options.auth && typeof this.options.auth.authMechanism === 'string') {
    return noPasswordAuthMechanisms.includes(this.options.auth.authMechanism);
  }
  return false;
};
```