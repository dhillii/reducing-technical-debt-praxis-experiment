function _deriveKey(self, password) {
    return new Q(self.sjcl.deriveKey({
        configs : self.configs,
        password: password
    }));
}

function _saveDerivedKeys(self, keys) {
    self.keys.key    = keys.key;
    self.keys.hexKey = keys.hexKey;
    self._saveSession();
}

/**
 * Generate PBKDF2 and save it. It will be used to encrypt/decrypt data.
 *
 * @return promise
 */
saveSecureKey: function(password) {
    var self = this;

    return _deriveKey(self, password)
        .then(function(keys) {
            _saveDerivedKeys(self, keys);
        });
}