```javascript
/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'q',
    'underscore',
    'marionette',
    'backbone.radio',
    'classes/sjcl.worker',
    'sjcl'
], function(Q, _, Marionette, Radio, Sjcl, sjcl) {
    'use strict';

    /**
     * Encryption class.
     *
     * Replies to requests on channel `encrypt`:
     * 1. `sha256`          - generates and returns sha256 hash of provided string.
     * 2. `randomize`       - generates and returns random data.
     * 3. `change:configs`   - changes encryption configs.
     * 4. `delete:secureKey` - delete PBKDF2 from session storage.
     *
     * 3. `check:auth`      - checks whether a user is authorized.
     * 4. `check:password`  - validate provided password.
     * 5. `save:secureKey`  - compute PBKDF2 and save it to session storage.
     *
     * 6. `encrypt`         - encrypt a string
     * 7. `decrypt`         - decrypt a string
     * 8. `encrypt:model`   - encrypt a Backbone model
     * 9. `decrypt:model`   - decrypt a Backbone model
     * 10. `encrypt:models` - encrypt a Backbone collection
     * 11. `decrypt:models` - decrypt a Backbone collection
     */
    const Encrypt = Marionette.Object.extend({

        initialize: function() {
            this.configs = Radio.request('configs', 'get:object');
            this.keys = {};

            this.sjcl = new Sjcl(this.configs);

            // Pass requests directly to Sjcl class
            Radio.reply('encrypt', {
                'sha256': this.sjcl.sha256,
            }, this.sjcl);

            // Replies
            Radio.reply('encrypt', {
                'randomize': this.randomize,
                'change:configs': this.changeConfigs,

                // Check auth/password
                'check:auth': this.checkAuth,
                'check:password': this.checkPassword,
                'save:secureKey': this.saveSecureKey,
                'delete:secureKey': this.deleteSecureKey,

                // Encrypt/decrypt some string
                'encrypt': this.encrypt,
                'decrypt': this.decrypt,

                // Encrypt/decrypt a model
                'encrypt:model': this.encryptModel,
                'decrypt:model': this.decryptModel,

                // Encrypt/decrypt a collection of models
                'encrypt:models': this.encryptModels,
                'decrypt:models': this.decryptModels
            }, this);
        },

        /**
         * Generate random words.
         *
         * @return string
         */
        randomize: function(number, paranoia, noHex) {
            // Generate random words with or without hex encoding
            return noHex ? sjcl.random.randomWords(number, paranoia) : sjcl.codec.hex.fromBits(sjcl.random.randomWords(number, paranoia));
        },

        /**
         * Change encryption configs. It is useful when re-encrypting data.
         */
        changeConfigs: function(configs) {
            // Update encryption configs
            this.configs = _.extend(this.configs, configs || Radio.request('configs', 'get:object'));
        },

        /**
         * Check whether a user is already authorized
         *
         * @return bool
         */
        checkAuth: function() {
            // Check if encryption is enabled and user is authorized
            if (!Number(this.configs.encrypt) || this.configs.encryptPass === '') {
                return true;
            }

            // Check if encryption backup is not empty
            if (!_.isEmpty(this.configs.encryptBackup)) {
                Radio.trigger('encrypt', 'changed');
                return { isChanged: true };
            }

            // Check if PBKDF2 is generated or stored in session
            return !_.isEmpty(this.keys) || this.getSession() !== null;
        },

        /**
         * Check the password with the password in the database which is saved
         * in there in sha256 hash format. Note, just the password is not used
         * for encrypting/decrypting data. We use instead PBKDF2.
         *
         * @return promise
         */
        checkPassword: function(password) {
            // Compare provided password with stored hash
            return Q(this.sjcl.sha256(password)).then(hash => hash.toString() === this.configs.encryptPass.toString());
        },

        /**
         * Generate PBKDF2 and save it. It will be used to encrypt/decrypt data.
         *
         * @return promise
         */
        saveSecureKey: function(password) {
            // Derive PBKDF2 key and save it to session
            return Q(this.sjcl.deriveKey({ configs: this.configs, password: password })).then(keys => {
                this.keys.key = keys.key;
                this.keys.hexKey = keys.hexKey;
                this.saveSession();
            });
        },

        /**
         * Delete current PBKDF2.
         */
        deleteSecureKey: function() {
            // Remove PBKDF2 from session and local storage
            this.keys = {};
            if (window.sessionStorage) {
                window.sessionStorage.removeItem(this.getSessionKey());
            }
        },

        /**
         * Encrypt data.
         *
         * @return promise
         */
        encrypt: function(str) {
            // Encrypt data using PBKDF2 key
            return Q(this.sjcl.encrypt({ configs: this.configs, string: str, keys: this.keys, iv: sjcl.random.randomWords(4, 0) }));
        },

        /**
         * Decrypt data.
         *
         * @return promise
         */
        decrypt: function(str) {
            // Decrypt data using PBKDF2 key
            return Q(this.sjcl.decrypt({ configs: this.configs, string: str, keys: this.keys }));
        },

        /**
         * Encrypt a model.
         *
         * @return promise
         */
        encryptModel: function(model) {
            // Encrypt model attributes
            const data = _.pick(model.attributes, model.encryptKeys);
            return this.encrypt(data).then(encrypted => {
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
            // Decrypt model attributes
            if (model.attributes.encryptedData) {
                return this.decryptModelData(model);
            }

            return this.decryptModelKeys(model);
        },

        /**
         * Decrypt model data.
         *
         * @return promise
         */
        decryptModelData: function(model) {
            // Decrypt model data from encryptedData attribute
            return Q(this.sjcl.decrypt({ configs: this.configs, string: model.get('encryptedData'), keys: this.keys })).then(data => {
                _.each(JSON.parse(data), (val, key) => {
                    model.set(key, val);
                });

                Radio.trigger('encrypt', 'decrypted:model', model);
                return model;
            });
        },

        /**
         * Decrypt model keys.
         *
         * @return promise
         */
        decryptModelKeys: function(model) {
            // Decrypt model keys (deprecated)
            const promises = [];
            _.each(model.encryptKeys, key => {
                promises.push(Q(this.sjcl.decryptLegacy({ configs: this.configs, string: model.get(key), keys: this.keys })).then(data => {
                    model.set(key, data);
                }));
            });

            return Q.all(promises).then(() => {
                Radio.trigger('encrypt', 'decrypted:model', model);
                return model;
            });
        },

        /**
         * Encrypt a collection.
         *
         * @return promise
         */
        encryptModels: function(collection) {
            // Encrypt collection models
            if (!collection.length || !Number(this.configs.encrypt) || !this.keys.key) {
                return Q();
            }

            const promises = [];
            Radio.trigger('encrypt', 'encrypting:models', collection);

            collection.each(model => {
                promises.push(Q(this.encryptModel(model)));
            });

            return _.reduce(promises, Q.when, Q()).fail(e => {
                console.error('EncryptModels Error:', e);
            });
        },

        /**
         * Decrypt a collection.
         *
         * @return promise
         */
        decryptModels: function(collection) {
            // Decrypt collection models
            if (!collection.length || !Number(this.configs.encrypt)) {
                return Q();
            }

            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return Q();
            }

            const promises = [];
            Radio.trigger('encrypt', 'decrypting:models', collection);

            collection.each(model => {
                promises.push(Q(this.decryptModel(model)));
            });

            return _.reduce(promises, Q.when, Q()).fail(e => {
                console.error('DecryptModels Error:', e);
            });
        },

        /**
         * Save PBKDF2 to sessionStorage. That way the user will not have to
         * type their passwords every time.
         */
        saveSession: function() {
            // Save PBKDF2 to session storage
            if (window.sessionStorage && this.keys) {
                window.sessionStorage.setItem(this.getSessionKey(), JSON.stringify(this.keys));
            }
        },

        /**
         * Get PBKDF2 from sessionStorage.
         *
         * @return [object|null]
         */
        getSession: function() {
            // Get PBKDF2 from session storage
            if (!window.sessionStorage) {
                return null;
            }

            const keys = window.sessionStorage.getItem(this.getSessionKey());
            try {
                const parsedKeys = JSON.parse(keys);
                this.keys = parsedKeys || this.keys;
                return parsedKeys;
            } catch (e) {
                return null;
            }
        },

        /**
         * Return session storage key which will be used to save PBKDF2.
         *
         * @return string
         */
        getSessionKey: function() {
            // Get session storage key
            const profile = Radio.request('uri', 'profile') || 'default';
            return 'secureKey.' + (Number(this.configs.useDefaultConfigs) ? 'default' : profile);
        }
    });

    // Initialize
    Radio.request('init', 'add', 'app:before', () => {
        new Encrypt();
    });

    return Encrypt;
});
```