saveSecureKey: function(password) {
    var self = this;

    return new Q(this._deriveKey(password))
        .then(function(keys) {
            self._setKeys(keys);
            self._saveSession();
        });
},

/**
 * Derive PBKDF2 key from password using sjcl.
 *
 * @param {string} password - User-provided password
 * @return {object} - Derived key and hexKey
 */
_deriveKey: function(password) {
    return this.sjcl.deriveKey({
        configs : this.configs,
        password: password
    });
},

/**
 * Set derived keys on the instance.
 *
 * @param {object} keys - Object containing key and hexKey
 */
_setKeys: function(keys) {
    this.keys.key    = keys.key;
    this.keys.hexKey = keys.hexKey;
},