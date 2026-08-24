saveSecureKey: function(password) {
            var self = this;

            return new Q(this.sjcl.deriveKey({
                configs : this.configs,
                password: password
            }))
            .then(function(keys) {
                self.keys.key    = keys.key;
                self.keys.hexKey = keys.hexKey;
                self._saveSession();
            });
        },