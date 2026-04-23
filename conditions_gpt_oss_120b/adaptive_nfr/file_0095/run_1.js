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
            // Get configs
            this.configs = Radio.request('configs', 'get:object');
            this.keys    = {};

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
            if (noHex) {
                return sjcl.random.randomWords(number, paranoia);
            }

            return sjcl.codec.hex.fromBits(
                sjcl.random.randomWords(number, paranoia)
            );
        },

        /**
         * Change encryption configs. It is useful when re-encrypting data.
         */
        changeConfigs: function(configs) {
            configs = configs || Radio.request('configs', 'get:object');
            this.configs = _.extend(this.configs, configs);
        },

        /**
         * Check whether a user is already authorized
         *
         * @return bool
         */
        checkAuth: function() {
            /**
             * If encryption backup is not empty, it means a user changed
             * encryption settings.
             */
            if (!_.isEmpty(this.configs.encryptBackup)) {
                Radio.trigger('encrypt', 'changed');
                return { isChanged: true };
            }

            // Encryption is disabled
            if (!Number(this.configs.encrypt) || this.configs.encryptPass === '') {
                return true;
            }

            return !_.isEmpty(this.keys) || this._getSession() !== null;
        },

        /**
         * Verify password against stored hash.
         *
         * @param {string} password
         * @return {Promise<boolean>}
         */
        checkPassword: function(password) {
            const pwd = this.configs.encryptPass;

            return new Q(this.sjcl.sha256(password))
                .then(function(hash) {
                    return hash.toString() === pwd.toString();
                });
        },

        /**
         * Generate PBKDF2 and save it. It will be used to encrypt/decrypt data.
         *
         * @param {string} password
         * @return {Promise<void>}
         */
        saveSecureKey: function(password) {
            const self = this;

            return new Q(this.sjcl.deriveKey({
                configs: this.configs,
                password: password
            }))
                .then(function(keys) {
                    self.keys.key = keys.key;
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
         * @param {string} str
         * @return {Promise<string>}
         */
        encrypt: function(str) {
            return new Q(this.sjcl.encrypt({
                configs: this.configs,
                string: str,
                keys: this.keys,

                // Random initialization vector every time
                iv: sjcl.random.randomWords(4, 0),
            }));
        },

        /**
         * Decrypt data.
         *
         * @param {string} str
         * @return {Promise<string>}
         */
        decrypt: function(str) {
            return new Q(this.sjcl.decrypt({
                configs: this.configs,
                string: str,
                keys: this.keys,
            }));
        },

        /**
         * Encrypt a model.
         *
         * @param {Backbone.Model} model
         * @return {Promise<Backbone.Model>}
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
         * @param {Backbone.Model} model
         * @return {Promise<Backbone.Model>}
         */
        decryptModel: function(model) {
            if (model.attributes.encryptedData) {
                return this._decryptModel(model);
            }

            return this._decryptModelKeys(model);
        },

        /**
         * Encrypt a collection of models.
         *
         * @param {Backbone.Collection} collection
         * @return {Promise<void>}
         */
        encryptModels: function(collection) {
            if (!this._canProcessEncryption(collection)) {
                return new Q();
            }

            this._notifyEncryptingModels(collection);
            const promises = this._buildModelPromises(collection, this.encryptModel.bind(this));

            return this._reduceModelPromises(promises, 'EncryptModels Error:');
        },

        /**
         * Decrypt a collection of models.
         *
         * @param {Backbone.Collection} collection
         * @return {Promise<void>}
         */
        decryptModels: function(collection) {
            if (!this._canProcessDecryption(collection)) {
                return new Q();
            }

            this._notifyDecryptingModels(collection);
            const promises = this._buildModelPromises(collection, this.decryptModel.bind(this));

            return this._reduceModelPromises(promises, 'DecryptModels Error:');
        },

        /**
         * Determine if a collection can be encrypted.
         *
         * @private
         * @param {Backbone.Collection} collection
         * @return {boolean}
         */
        _canProcessEncryption: function(collection) {
            return collection.length && Number(this.configs.encrypt) && this.keys.key;
        },

        /**
         * Determine if a collection can be decrypted.
         *
         * @private
         * @param {Backbone.Collection} collection
         * @return {boolean}
         */
        _canProcessDecryption: function(collection) {
            if (!collection.length || !Number(this.configs.encrypt)) {
                return false;
            }
            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return false;
            }
            return true;
        },

        /**
         * Notify that model encryption is starting.
         *
         * @private
         * @param {Backbone.Collection} collection
         */
        _notifyEncryptingModels: function(collection) {
            Radio.trigger('encrypt', 'encrypting:models', collection);
        },

        /**
         * Notify that model decryption is starting.
         *
         * @private
         * @param {Backbone.Collection} collection
         */
        _notifyDecryptingModels: function(collection) {
            Radio.trigger('encrypt', 'decrypting:models', collection);
        },

        /**
         * Build an array of promise-returning functions for each model.
         *
         * @private
         * @param {Backbone.Collection} collection
         * @param {function} modelFn - function that returns a promise for a model
         * @return {Array<function():Promise>}
         */
        _buildModelPromises: function(collection, modelFn) {
            const promises = [];

            collection.each(function(model) {
                promises.push(function() {
                    return new Q(modelFn(model));
                });
            }, this);

            return promises;
        },

        /**
         * Reduce an array of promise functions into a single promise chain.
         *
         * @private
         * @param {Array<function():Promise>} promises
         * @param {string} errorPrefix
         * @return {Promise}
         */
        _reduceModelPromises: function(promises, errorPrefix) {
            return _.reduce(promises, Q.when, new Q())
                .fail(function(e) {
                    console.error(errorPrefix, e);
                });
        },

        /**
         * Decrypt a model by getting data from "encryptedData" attribute.
         *
         * @private
         * @param {Backbone.Model} model
         * @return {Promise<Backbone.Model>}
         */
        _decryptModel: function(model) {
            return new Q(this.sjcl.decrypt({
                configs: this.configs,
                string: model.get('encryptedData'),
                keys: this.keys,
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
         * Legacy decryption for models without "encryptedData".
         *
         * @private
         * @param {Backbone.Model} model
         * @return {Promise<Backbone.Model>}
         */
        _decryptModelKeys: function(model) {
            const promises = [];

            _.each(model.encryptKeys, function(key) {
                promises.push(
                    new Q(this.sjcl.decryptLegacy({
                        configs: this.configs,
                        string: model.get(key),
                        keys: this.keys
                    }))
                        .then(function(data) {
                            model.set(key, data);
                        })
                );
            }, this);

            return Q.all(promises)
                .then(function() {
                    Radio.trigger('encrypt', 'decrypted:model', model);
                    return model;
                });
        },

        /**
         * Save PBKDF2 to sessionStorage. That way the user will not have to
         * type their passwords every time.
         *
         * @private
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
         * Get PBKDF2 from sessionStorage.
         *
         * @private
         * @return {object|null}
         */
        _getSession: function() {
            if (!window.sessionStorage) {
                return null;
            }

            let keys = window.sessionStorage.getItem(this._getSessionKey());
            try {
                keys = JSON.parse(keys);
                this.keys = keys || this.keys;
            } catch (e) {
                keys = null;
            }

            return keys;
        },

        /**
         * Return session storage key which will be used to save PBKDF2.
         *
         * @private
         * @return {string}
         */
        _getSessionKey: function() {
            let profile = Radio.request('uri', 'profile') || 'default';
            profile = (Number(this.configs.useDefaultConfigs) ? 'default' : profile);
            return 'secureKey.' + profile;
        }

    });

    // Initialize
    Radio.request('init', 'add', 'app:before', function() {
        new Encrypt();
    });

    return Encrypt;
});