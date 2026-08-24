saveSecureKey: function(password) {
            const self = this;

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

        /**
         * Delete current PBKDF2.
         */
        deleteSecureKey: function() {
            this.keys = {};

            if (window.sessionStorage) {
                window.sessionStorage.removeItem(this._getSessionKey());
            }
        },

        /**
         * Encrypt data.
         *
         * @return promise
         */
        encrypt: function(str) {
            return new Q(this.sjcl.encrypt({
                configs : this.configs,
                string  : str,
                keys    : this.keys,

                // Random initialization vector every time
                iv      : sjcl.random.randomWords(4, 0),
            }));
        },

        /**
         * Decrypt data.
         *
         * @return promise
         */
        decrypt: function(str) {
            return new Q(this.sjcl.decrypt({
                configs : this.configs,
                string  : str,
                keys    : this.keys,
            }));
        },

        /**
         * Encrypt a model.
         *
         * @return promise
         */
        encryptModel: function(model) {
            const data = _.pick(model.attributes, model.encryptKeys);

            return this.encrypt(data)
            .then(function(encrypted) {
                model.set('encryptedData', encrypted);
                return model;
            });
        },

        /**
         * Decrypt a model.
         *
         * @return promise
         */
        decryptModel: function(model) {
            if (model.attributes.encryptedData) {
                return this._decryptModel(model);
            }

            return this._decryptModelKeys(model);
        },

        /**
         * Encrypt all models in a collection.
         *
         * @return promise
         */
        encryptModels: function(collection) {
            if (!collection.length || !Number(this.configs.encrypt) || !this.keys.key) {
                return new Q();
            }

            Radio.trigger('encrypt', 'encrypting:models', collection);

            return this._processCollection(collection, this.encryptModel);
        },

        /**
         * Decrypt all models in a collection.
         *
         * @return promise
         */
        decryptModels: function(collection) {
            if (!collection.length || !Number(this.configs.encrypt)) {
                return new Q();
            }

            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return new Q();
            }

            Radio.trigger('encrypt', 'decrypting:models', collection);

            return this._processCollection(collection, this.decryptModel);
        },

        /**
         * Process a collection using a given handler function.
         *
         * @param {Backbone.Collection} collection
         * @param {Function} handler
         * @return {Promise}
         */
        _processCollection: function(collection, handler) {
            const promises = [];

            collection.each(function(model) {
                promises.push(() => new Q(handler.call(this, model)));
            }, this);

            return _.reduce(promises, Q.when, new Q())
            .fail(function(e) {
                console.error('Encryption Error:', e);
            });
        },

        /**
         * Decrypt a model using 'encryptedData' attribute.
         *
         * @return promise
         */
        _decryptModel: function(model) {
            return new Q(this.sjcl.decrypt({
                configs : this.configs,
                string  : model.get('encryptedData'),
                keys    : this.keys,
            }))
            .then(function(data) {
                _.each(JSON.parse(data), function(val, key) {
                    model.set(key, val);
                });

                Radio.trigger('encrypt', 'decrypted:model', model);
                return model;
            });
        },

        /**
         * Deprecated decryption method for legacy key fields.
         *
         * @return promise
         */
        _decryptModelKeys: function(model) {
            const promises = model.encryptKeys.map(function(key) {
                return new Q(this.sjcl.decryptLegacy({
                    configs : this.configs,
                    string  : model.get(key),
                    keys    : this.keys
                }))
                .then(function(data) {
                    model.set(key, data);
                });
            }, this);

            return Q.all(promises)
            .then(function() {
                Radio.trigger('encrypt', 'decrypted:model', model);
                return model;
            });
        },

        /**
         * Save PBKDF2 to sessionStorage.
         */
        _saveSession: function() {
            if (!window.sessionStorage || !this.keys) {
                return;
            }

            window.sessionStorage.setItem(
                this._getSessionKey(),
                JSON.stringify(this.keys)
            );
        },

        /**
         * Retrieve PBKDF2 from sessionStorage.
         *
         * @return [object|null]
         */
        _getSession: function() {
            if (!window.sessionStorage) {
                return null;
            }

            const keys  = window.sessionStorage.getItem(this._getSessionKey());
            try {
                const parsedKeys = JSON.parse(keys);
                this.keys = parsedKeys || this.keys;
                return parsedKeys;
            } catch (e) {
                return null;
            }
        },

        /**
         * Get session storage key based on user profile.
         *
         * @return string
         */
        _getSessionKey: function() {
            const profile = Radio.request('uri', 'profile') || 'default';
            const useDefault = Number(this.configs.useDefaultConfigs);

            return 'secureKey.' + (useDefault ? 'default' : profile);
        }