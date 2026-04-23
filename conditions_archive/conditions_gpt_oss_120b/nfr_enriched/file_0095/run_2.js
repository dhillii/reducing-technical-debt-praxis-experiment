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
], function (Q, _, Marionette, Radio, Sjcl, sjcl) {
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

        initialize() {
            // Get configs
            this.configs = Radio.request('configs', 'get:object');
            this.keys = {};

            this.sjcl = new Sjcl(this.configs);

            // Pass requests directly to Sjcl class
            Radio.reply('encrypt', {
                sha256: this.sjcl.sha256,
            }, this.sjcl);

            // Replies
            Radio.reply('encrypt', {
                randomize: this.randomize,
                'change:configs': this.changeConfigs,

                // Check auth/password
                'check:auth': this.checkAuth,
                'check:password': this.checkPassword,
                'save:secureKey': this.saveSecureKey,
                'delete:secureKey': this.deleteSecureKey,

                // Encrypt/decrypt some string
                encrypt: this.encrypt,
                decrypt: this.decrypt,

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
            // If encryption backup is not empty, it means a user changed encryption settings.
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
            const storedHash = this.configs.encryptPass;

            return new Q(this.sjcl.sha256(password))
                .then(hash => hash.toString() === storedHash.toString());
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
                iv: sjcl.random.randomWords(4, 0),
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
                keys: this.keys,
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
            if (this._shouldSkipEncryption(collection)) {
                return new Q();
            }

            const promises = [];
            Radio.trigger('encrypt', 'encrypting:models', collection);

            collection.each(model => {
                promises.push(() => new Q(this.encryptModel(model)));
            });

            return _.reduce(promises, Q.when, new Q())
                .fail(e => {
                    console.error('EncryptModels Error:', e);
                });
        },

        /**
         * Decrypt a collection.
         *
         * @return promise
         */
        decryptModels(collection) {
            if (this._shouldSkipDecryption(collection)) {
                return new Q();
            }

            const promises = [];
            Radio.trigger('encrypt', 'decrypting:models', collection);

            collection.each(model => {
                promises.push(() => new Q(this.decryptModel(model)));
            });

            return _.reduce(promises, Q.when, new Q())
                .fail(e => {
                    console.error('DecryptModels Error:', e);
                });
        },

        /**
         * Determine if encryption of a collection should be skipped.
         *
         * @private
         */
        _shouldSkipEncryption(collection) {
            return !collection.length ||
                !Number(this.configs.encrypt) ||
                !this.keys.key;
        },

        /**
         * Determine if decryption of a collection should be skipped.
         *
         * @private
         */
        _shouldSkipDecryption(collection) {
            if (!collection.length || !Number(this.configs.encrypt)) {
                return true;
            }

            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return true;
            }

            return false;
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
                keys: this.keys,
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
            const promises = [];

            _.each(model.encryptKeys, key => {
                promises.push(
                    new Q(this.sjcl.decryptLegacy({
                        configs: this.configs,
                        string: model.get(key),
                        keys: this.keys
                    }))
                        .then(data => {
                            model.set(key, data);
                        })
                );
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

            const stored = window.sessionStorage.getItem(this._getSessionKey());
            try {
                const keys = JSON.parse(stored);
                this.keys = keys || this.keys;
                return keys;
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
            const profileFromUri = Radio.request('uri', 'profile') || 'default';
            const profile = Number(this.configs.useDefaultConfigs) ? 'default' : profileFromUri;
            return `secureKey.${profile}`;
        }

    });

    // Initialize
    Radio.request('init', 'add', 'app:before', () => {
        new Encrypt();
    });

    return Encrypt;
});