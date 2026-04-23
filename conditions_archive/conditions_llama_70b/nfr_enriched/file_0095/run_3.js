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
            // Generate random words
            const randomWords = sjcl.random.randomWords(number, paranoia);

            // Return hex representation if noHex is false
            return noHex ? randomWords : sjcl.codec.hex.fromBits(randomWords);
        },

        /**
         * Change encryption configs. It is useful when re-encrypting data.
         */
        changeConfigs: function(configs) {
            // Merge new configs with existing ones
            this.configs = _.extend(this.configs, configs || Radio.request('configs', 'get:object'));
        },

        /**
         * Check whether a user is already authorized
         *
         * @return bool
         */
        checkAuth: function() {
            // Check if encryption backup is not empty
            if (!_.isEmpty(this.configs.encryptBackup)) {
                Radio.trigger('encrypt', 'changed');
                return { isChanged: true };
            }

            // Check if encryption is disabled
            if (!Number(this.configs.encrypt) || this.configs.encryptPass === '') {
                return true;
            }

            // Check if keys are set or session is not empty
            return !_.isEmpty(this.keys) || this._getSession() !== null;
        },

        /**
         * Check the password with the password in the database which is saved
         * in there in sha256 hash format. Note, just the password is not used
         * for encrypting/decrypting data. We use instead PBKDF2.
         *
         * @return promise
         */
        checkPassword: function(password) {
            // Get password from configs
            const pwd = this.configs.encryptPass;

            // Hash password and compare with stored hash
            return Q(this.sjcl.sha256(password))
                .then(hash => hash.toString() === pwd.toString());
        },

        /**
         * Generate PBKDF2 and save it. It will be used to encrypt/decrypt data.
         *
         * @return promise
         */
        saveSecureKey: function(password) {
            // Derive key from password
            return Q(this.sjcl.deriveKey({ configs: this.configs, password: password }))
                .then(keys => {
                    // Save keys
                    this.keys.key = keys.key;
                    this.keys.hexKey = keys.hexKey;
                    this._saveSession();
                });
        },

        /**
         * Delete current PBKDF2.
         */
        deleteSecureKey: function() {
            // Reset keys
            this.keys = {};

            // Remove session storage item
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
            // Encrypt string
            return Q(this.sjcl.encrypt({
                configs: this.configs,
                string: str,
                keys: this.keys,
                iv: sjcl.random.randomWords(4, 0),
            }));
        },

        /**
         * Decrypt data.
         *
         * @return promise
         */
        decrypt: function(str) {
            // Decrypt string
            return Q(this.sjcl.decrypt({
                configs: this.configs,
                string: str,
                keys: this.keys,
            }));
        },

        /**
         * Encrypt a model.
         *
         * @return promise
         */
        encryptModel: function(model) {
            // Get data to encrypt
            const data = _.pick(model.attributes, model.encryptKeys);

            // Encrypt data
            return this.encrypt(data)
                .then(encrypted => {
                    // Set encrypted data on model
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
            // Check if model has encrypted data
            if (model.attributes.encryptedData) {
                // Decrypt model
                return this._decryptModel(model);
            }

            // Decrypt model keys
            return this._decryptModelKeys(model);
        },

        /**
         * Encrypt a collection.
         *
         * @return promise
         */
        encryptModels: function(collection) {
            // Check if collection is empty or encryption is disabled
            if (!collection.length || !Number(this.configs.encrypt) || !this.keys.key) {
                return Q();
            }

            // Trigger encrypting event
            Radio.trigger('encrypt', 'encrypting:models', collection);

            // Encrypt each model in collection
            const promises = collection.map(model => this.encryptModel(model));

            // Wait for all promises to resolve
            return Q.all(promises)
                .fail(error => console.error('EncryptModels Error:', error));
        },

        /**
         * Decrypt a collection.
         *
         * @return promise
         */
        decryptModels: function(collection) {
            // Check if collection is empty or encryption is disabled
            if (!collection.length || !Number(this.configs.encrypt)) {
                return Q();
            }

            // Check if keys are set
            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return Q();
            }

            // Trigger decrypting event
            Radio.trigger('encrypt', 'decrypting:models', collection);

            // Decrypt each model in collection
            const promises = collection.map(model => this.decryptModel(model));

            // Wait for all promises to resolve
            return Q.all(promises)
                .fail(error => console.error('DecryptModels Error:', error));
        },

        /**
         * Decrypt a model by getting data from "encryptedData" attribute.
         *
         * @return promise
         */
        _decryptModel: function(model) {
            // Decrypt encrypted data
            return Q(this.sjcl.decrypt({
                configs: this.configs,
                string: model.get('encryptedData'),
                keys: this.keys,
            }))
                .then(data => {
                    // Parse decrypted data
                    const decryptedData = JSON.parse(data);

                    // Set decrypted data on model
                    _.each(decryptedData, (val, key) => model.set(key, val));

                    // Trigger decrypted event
                    Radio.trigger('encrypt', 'decrypted:model', model);

                    return model;
                });
        },

        /**
         * Deprecated decryption.
         *
         * @return promise
         */
        _decryptModelKeys: function(model) {
            // Decrypt each key in model
            const promises = model.encryptKeys.map(key => {
                return Q(this.sjcl.decryptLegacy({
                    configs: this.configs,
                    string: model.get(key),
                    keys: this.keys,
                }))
                    .then(data => model.set(key, data));
            });

            // Wait for all promises to resolve
            return Q.all(promises)
                .then(() => {
                    // Trigger decrypted event
                    Radio.trigger('encrypt', 'decrypted:model', model);
                    return model;
                });
        },

        /**
         * Save PBKDF2 to sessionStorage. That way the user will not have to
         * type their passwords every time.
         */
        _saveSession: function() {
            // Check if session storage is available and keys are set
            if (window.sessionStorage && this.keys) {
                // Save keys to session storage
                window.sessionStorage.setItem(
                    this._getSessionKey(),
                    JSON.stringify(this.keys)
                );
            }
        },

        /**
         * Get PBKDF2 from sessionStorage.
         *
         * @return [object|null]
         */
        _getSession: function() {
            // Check if session storage is available
            if (window.sessionStorage) {
                // Get keys from session storage
                const keys = window.sessionStorage.getItem(this._getSessionKey());

                try {
                    // Parse keys
                    const parsedKeys = JSON.parse(keys);

                    // Set keys on instance
                    this.keys = parsedKeys || this.keys;

                    return parsedKeys;
                } catch (error) {
                    return null;
                }
            }

            return null;
        },

        /**
         * Return session storage key which will be used to save PBKDF2.
         *
         * @return string
         */
        _getSessionKey: function() {
            // Get profile from uri
            const profile = Radio.request('uri', 'profile') || 'default';

            // Use default profile if useDefaultConfigs is true
            const usedProfile = Number(this.configs.useDefaultConfigs) ? 'default' : profile;

            return `secureKey.${usedProfile}`;
        }
    });

    // Initialize
    Radio.request('init', 'add', 'app:before', function() {
        new Encrypt();
    });

    return Encrypt;
});
```