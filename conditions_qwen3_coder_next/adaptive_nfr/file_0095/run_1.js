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
 * @return {object} - Derived key object with 'key' and 'hexKey' properties
 */
_deriveKey: function(password) {
    return this.sjcl.deriveKey({
        configs : this.configs,
        password: password
    });
},

/**
 * Set derived keys in the instance's keys object.
 *
 * @param {object} keys - Object containing 'key' and 'hexKey' properties
 */
_setKeys: function(keys) {
    this.keys.key    = keys.key;
    this.keys.hexKey = keys.hexKey;
},