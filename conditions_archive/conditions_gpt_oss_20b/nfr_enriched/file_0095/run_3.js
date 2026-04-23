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

    const Encrypt = Marionette.Object.extend({

        initialize() {
            // Get configs
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
        randomize(number, paranoia, noHex) {
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
        changeConfigs(configs) {
            const newConfigs = configs || Radio.request('configs', 'get:object');
            this.configs = _.extend(this.configs, newConfigs);
        },

        /**
         * Check whether a user is already authorized
         *
         * @return bool
         */
        checkAuth() {
            // If encryption backup is not empty, it means a user changed
            // encryption settings.
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
         * Check the password with the password in the database which is saved
         * in there in sha256 hash format. Note, just the password is not used
         * for encrypting/decrypting data. We use instead PBKDF2.
         *
         * @return promise
         */
        checkPassword(password) {
            const pwd = this.configs.encryptPass;

            return new Q(this.sjcl.sha256(password))
                .then(hash => hash.toString() === pwd.toString());
        },

        /**
         * Generate PBKDF2 and save it. It will be used to encrypt/decrypt data.
         *
         * @return promise
         */
        saveSecureKey(password) {
            return new Q(this.sjcl.deriveKey({
                configs: this.configs,
                password
            }))
                .then(keys => {
                    this.keys.key = keys.key;
                    this.keys.hexKey = keys.hexKey;
                    this._saveSession();
                });
        },

        /**
         * Delete current PBKDF2.
         */
        deleteSecureKey() {
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
        encrypt(str) {
            return new Q(this.sjcl.encrypt({
                configs: this.configs,
                string: str,
                keys: this.keys,
                // Random initialization vector every time
                iv: sjcl.random.randomWords(4, 0)
            }));
        },

        /**
         * Decrypt data.
         *
         * @return promise
         */
        decrypt(str) {
            return new Q(this.sjcl.decrypt({
                configs: this.configs,
                string: str,
                keys: this.keys
            }));
        },

        /**
         * Encrypt a model.
         *
         * @return promise
         */
        encryptModel(model) {
            const data = _.pick(model.attributes, model.encryptKeys);

            return this.encrypt(data)
                .then(encrypted => {
                    model.set('encryptedData', encrypted);
                    return model;
                });
        },

        /**
         * Decrypt a model.
         *
         * @return promise
         */
        decryptModel(model) {
            if (model.attributes.encryptedData) {
                return this._decryptModel(model);
            }

            return this._decryptModelKeys(model);
        },

        /**
         * Encrypt a collection.
         *
         * @return promise
         */
        encryptModels(collection) {
            // The collection is empty or PBKDF2 wasn't generated
            if (!collection.length || !Number(this.configs.encrypt) || !this.keys.key) {
                return new Q();
            }

            Radio.trigger('encrypt', 'encrypting:models', collection);

            const promises = collection.map(model => () => new Q(this.encryptModel(model)));

            return _.reduce(promises, Q.when, new Q())
                .fail(e => console.error('EncryptModels Error:', e));
        },

        /**
         * Decrypt a collection.
         *
         * @return promise
         */
        decryptModels(collection) {
            // The collection is empty or encryption is disabled
            if (!collection.length || !Number(this.configs.encrypt)) {
                return new Q();
            }

            // PBKDF2 wasn't generated
            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return new Q();
            }

            Radio.trigger('encrypt', 'decrypting:models', collection);

            const promises = collection.map(model => () => new Q(this.decryptModel(model)));

            return _.reduce(promises, Q.when, new Q())
                .fail(e => console.error('DecryptModels Error:', e));
        },

        /**
         * Decrypt a model by getting data from "encryptedData" attribute.
         *
         * @return promise
         */
        _decryptModel(model) {
            return new Q(this.sjcl.decrypt({
                configs: this.configs,
                string: model.get('encryptedData'),
                keys: this.keys
            }))
                .then(data => {
                    _.each(JSON.parse(data), (val, key) => {
                        model.set(key, val);
                    });

                    Radio.trigger('encrypt', 'decrypted:model', model);
                    return model;
                });
        },

        /**
         * Deprecated decryption.
         *
         * @return promise
         */
        _decryptModelKeys(model) {
            const promises = model.encryptKeys.map(key => {
                return new Q(this.sjcl.decryptLegacy({
                    configs: this.configs,
                    string: model.get(key),
                    keys: this.keys
                }))
                    .then(data => {
                        model.set(key, data);
                    });
            });

            return Q.all(promises)
                .then(() => {
                    Radio.trigger('encrypt', 'decrypted:model', model);
                    return model;
                });
        },

        /**
         * Save PBKDF2 to sessionStorage. That way the user will not have to
         * type their passwords every time.
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
         * Get PBKDF2 from sessionStorage.
         *
         * @return [object|null]
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
         * Return session storage key which will be used to save PBKDF2.
         *
         * @return string
         */
        _getSessionKey() {
            const profile = Radio.request('uri', 'profile') || 'default';
            const finalProfile = Number(this.configs.useDefaultConfigs) ? 'default' : profile;
            return `secureKey.${finalProfile}`;
        }

    });

    // Initialize
    Radio.request('init', 'add', 'app:before', () => {
        new Encrypt();
    });

    return Encrypt;
});