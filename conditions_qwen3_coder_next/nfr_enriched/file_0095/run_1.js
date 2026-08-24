saveSecureKey: function(password) {
    const self = this;

    return this._deriveKey(password)
        .then(keys => this._storeKeys(keys));
},

/**
 * Derive PBKDF2 key from password using sjcl.
 *
 * @param  {string} password - User provided password
 * @return {Promise}         - Resolves with derived keys object
 */
_deriveKey: function(password) {
    return new Q(this.sjcl.deriveKey({
        configs : this.configs,
        password: password
    }));
},

/**
 * Store derived keys in memory and session storage.
 *
 * @param  {object} keys - Derived key object with key/hexKey properties
 * @return {void}
 */
_storeKeys: function(keys) {
    this.keys.key    = keys.key;
    this.keys.hexKey = keys.hexKey;
    this._saveSession();
},