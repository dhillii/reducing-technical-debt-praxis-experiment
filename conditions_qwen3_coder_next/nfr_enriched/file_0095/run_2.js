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
    var Encrypt = Marionette.Object.extend({

        initialize: function() {

            // Get configs
            this.configs = Radio.request('configs', 'get:object');
            this.keys    = {};

            this.sjcl = new Sjcl(this.configs);

            // Pass requests directly to Sjcl class
            Radio.reply('encrypt', {
                'sha256'           : this.sjcl.sha256,
            }, this.sjcl);

            // Replies
            Radio.reply('encrypt', {
                'randomize'        : this.randomize,
                'change:configs'   : this.changeConfigs,

                // Check auth/password
                'check:auth'       : this.checkAuth,
                'check:password'   : this.checkPassword,
                'save:secureKey'   : this.saveSecureKey,
                'delete:secureKey' : this.deleteSecureKey,

                // Encrypt/decrypt some string
                'encrypt'          : this.encrypt,
                'decrypt'          : this.decrypt,

                // Encrypt/decrypt a model
                'encrypt:model'    : this.encryptModel,
                'decrypt:model'    : this.decryptModel,

                // Encrypt/decrypt a collection of models
                'encrypt:models'   : this.encryptModels,
                'decrypt:models'   : this.decryptModels
            }, this);
        },

        /**
         * Generate random words.
         *
         * @param  {number} number     Number of words to generate.
         * @param  {number} paranoia   Randomness paranoia level.
         * @param  {boolean} noHex     If true, return bits without hex encoding.
         * @return {array|string}
         */
        randomize(number, paranoia, noHex) {
            const words = sjcl.random.randomWords(number, paranoia);

            return noHex ? words : sjcl.codec.hex.fromBits(words);
        },

        /**
         * Change encryption configs. It is useful when re-encrypting data.
         *
         * @param {object|null} configs Optional configs to merge in.
         */
        changeConfigs(configs) {
            const defaultConfigs = configs || Radio.request('configs', 'get:object');
            this.configs = _.extend(this.configs, defaultConfigs);
        },

        /**
         * Check whether a user is already authorized.
         *
         * @return {boolean|object} True if unencrypted, object with flag if changed.
         */
        checkAuth() {
            if (!_.isEmpty(this.configs.encryptBackup)) {
                Radio.trigger('encrypt', 'changed');
                return {isChanged: true};
            }

            if (!this._isEncryptionEnabled()) {
                return true;
            }

            return !_.isEmpty(this.keys) || this._getSession() !== null;
        },

        /**
         * Check whether encryption is currently enabled by config.
         *
         * @return {boolean}
         */
        _isEncryptionEnabled() {
            return Number(this.configs.encrypt) && this.configs.encryptPass !== '';
        },

        /**
         * Check the password by comparing the SHA256 hash of the input
         * against the stored hash.
         *
         * @param {string} password Password to validate.
         * @return {Promise<boolean>}
         */
        checkPassword(password) {
            return new Q(this.sjcl.sha256(password))
                .then(hash => hash.toString() === this.configs.encryptPass.toString());
        },

        /**
         * Generate PBKDF2 and save it. It will be used to encrypt/decrypt data.
         *
         * @param {string} password The password to derive the key from.
         * @return {Promise<void>}
         */
        saveSecureKey(password) {
            return new Q(this.sjcl.deriveKey({
                configs : this.configs,
                password: password
            }))
            .then(keys => {
                this.keys.key    = keys.key;
                this.keys.hexKey = keys.hexKey;
                this._saveSession();
            });
        },

        /**
         * Delete current PBKDF2 from memory and storage.
         */
        deleteSecureKey() {
            this.keys = {};
            if (window.sessionStorage) {
                window.sessionStorage.removeItem(this._getSessionKey());
            }
        },

        /**
         * Encrypt data using SJCL.
         *
         * @param {string} str String to encrypt.
         * @return {Promise<string>}
         */
        encrypt(str) {
            return new Q(this.sjcl.encrypt({
                configs : this.configs,
                string  : str,
                keys    : this.keys,
                iv      : sjcl.random.randomWords(4, 0)
            }));
        },

        /**
         * Decrypt data using SJCL.
         *
         * @param {string} str Encrypted string.
         * @return {Promise<string>}
         */
        decrypt(str) {
            return new Q(this.sjcl.decrypt({
                configs : this.configs,
                string  : str,
                keys    : this.keys
            }));
        },

        /**
         * Encrypt model attributes designated for encryption.
         *
         * @param {Backbone.Model} model Model to encrypt.
         * @return {Promise<Backbone.Model>}
         */
        encryptModel(model) {
            const encryptableData = _.pick(model.attributes, model.encryptKeys);

            return this.encrypt(encryptableData)
                .then(encrypted => {
                    model.set('encryptedData', encrypted);
                    return model;
                });
        },

        /**
         * Decrypt a Backbone model, routing to the correct decryption strategy.
         *
         * @param {Backbone.Model} model Model to decrypt.
         * @return {Promise<Backbone.Model>}
         */
        decryptModel(model) {
            return model.attributes.encryptedData
                ? this._decryptModel(model)
                : this._decryptModelKeys(model);
        },

        /**
         * Encrypt a collection of models.
         *
         * @param {Backbone.Collection} collection Collection to encrypt.
         * @return {Promise<Backbone.Collection>}
         */
        encryptModels(collection) {
            if (!this._shouldProcessCollection(collection)) {
                return Q();
            }

            Radio.trigger('encrypt', 'encrypting:models', collection);

            const promises = [];
            collection.each(model => {
                promises.push(() => this.encryptModel(model));
            });

            return this._reducePromises(promises)
                .fail(e => console.error('EncryptModels Error:', e));
        },

        /**
         * Decrypt a collection of models.
         *
         * @param {Backbone.Collection} collection Collection to decrypt.
         * @return {Promise<Backbone.Collection>}
         */
        decryptModels(collection) {
            if (!this._shouldProcessCollection(collection)) {
                return Q();
            }

            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return Q();
            }

            Radio.trigger('encrypt', 'decrypting:models', collection);

            const promises = [];
            collection.each(model => {
                promises.push(() => this.decryptModel(model));
            });

            return this._reducePromises(promises)
                .fail(e => console.error('DecryptModels Error:', e));
        },

        /**
         * Check whether to process a collection (empty or encryption disabled).
         *
         * @param {Backbone.Collection} collection Collection to check.
         * @return {boolean}
         */
        _shouldProcessCollection(collection) {
            return collection.length
                && Number(this.configs.encrypt)
                && this.keys.key;
        },

        /**
         * Reduce array of promise-returning functions into a single promise chain.
         *
         * @param {Array<function():Promise>} funcs Array of functions returning promises.
         * @return {Promise}
         */
        _reducePromises(funcs) {
            return _.reduce(funcs, Q.when, Q());
        },

        /**
         * Decrypt model using primary decryption method from "encryptedData".
         *
         * @param {Backbone.Model} model Model to decrypt.
         * @return {Promise<Backbone.Model>}
         */
        _decryptModel(model) {
            return new Q(this.sjcl.decrypt({
                configs : this.configs,
                string  : model.get('encryptedData'),
                keys    : this.keys
            }))
            .then(data => {
                _.each(JSON.parse(data), (val, key) => model.set(key, val));
                Radio.trigger('encrypt', 'decrypted:model', model);
                return model;
            });
        },

        /**
         * Decrypt model using legacy per-key method (deprecated).
         *
         * @param {Backbone.Model} model Model to decrypt.
         * @return {Promise<Backbone.Model>}
         */
        _decryptModelKeys(model) {
            const promises = [];

            _.each(model.encryptKeys, key => {
                promises.push(new Q(this.sjcl.decryptLegacy({
                    configs : this.configs,
                    string  : model.get(key),
                    keys    : this.keys
                })).then(data => model.set(key, data)));
            });

            return Q.all(promises)
                .then(() => {
                    Radio.trigger('encrypt', 'decrypted:model', model);
                    return model;
                });
        },

        /**
         * Save PBKDF2 to sessionStorage.
         */
        _saveSession() {
            if (!window.sessionStorage || !this.keys) {
                return;
            }

            window.sessionStorage.setItem(
                this._getSessionKey(),
                JSON.stringify(this.keys)
            );
        },

        /**
         * Retrieve PBKDF2 from sessionStorage if available.
         *
         * @return {object|null}
         */
        _getSession() {
            if (!window.sessionStorage) {
                return null;
            }

            const keys = window.sessionStorage.getItem(this._getSessionKey());
            try {
                const parsed = JSON.parse(keys);
                this.keys = parsed || this.keys;
                return parsed;
            } catch (e) {
                return null;
            }
        },

        /**
         * Generate sessionStorage key for PBKDF2 based on profile.
         *
         * @return {string}
         */
        _getSessionKey() {
            const profile = Radio.request('uri', 'profile') || 'default';
            return 'secureKey.' + (Number(this.configs.useDefaultConfigs) ? 'default' : profile);
        }

    });

    // Initialize
    Radio.request('init', 'add', 'app:before', function() {
        new Encrypt();
    });

    return Encrypt;
});