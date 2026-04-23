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
     * Build an array of functions that return promises for encrypting each model.
     *
     * @param {Backbone.Collection} collection
     * @param {Encrypt} self
     * @return {Array<Function>}
     */
    function buildEncryptPromises(collection, self) {
        const promises = [];
        collection.each(function(model) {
            promises.push(function() {
                return new Q(self.encryptModel(model));
            });
        }, self);
        return promises;
    }

    /**
     * Reduce an array of promise-returning functions into a single promise.
     *
     * @param {Array<Function>} promises
     * @return {Promise}
     */
    function reducePromises(promises) {
        return _.reduce(promises, Q.when, new Q());
    }

    /**
     * Handle errors that occur during encrypting models.
     *
     * @param {Error} e
     */
    function handleEncryptModelsError(e) {
        console.error('EncryptModels Error:', e);
    }

    /**
     * Build an array of functions that return promises for decrypting each model.
     *
     * @param {Backbone.Collection} collection
     * @param {Encrypt} self
     * @return {Array<Function>}
     */
    function buildDecryptPromises(collection, self) {
        const promises = [];
        collection.each(function(model) {
            promises.push(function() {
                return new Q(self.decryptModel(model));
            });
        }, self);
        return promises;
    }

    /**
     * Handle errors that occur during decrypting models.
     *
     * @param {Error} e
     */
    function handleDecryptModelsError(e) {
        console.error('DecryptModels Error:', e);
    }

    /**
     * Create an array of promises for legacy decryption of model keys.
     *
     * @param {Backbone.Model} model
     * @param {Encrypt} self
     * @return {Array<Promise>}
     */
    function createLegacyDecryptPromises(model, self) {
        const promises = [];
        _.each(model.encryptKeys, function(key) {
            promises.push(
                new Q(self.sjcl.decryptLegacy({
                    configs : self.configs,
                    string  : model.get(key),
                    keys    : self.keys
                }))
                .then(function(data) {
                    model.set(key, data);
                })
            );
        }, self);
        return promises;
    }

    /**
     * Process an array of promises and return a combined promise.
     *
     * @param {Array<Promise>} promises
     * @return {Promise}
     */
    function processLegacyPromises(promises) {
        return Q.all(promises);
    }

    /**
     * Parse session storage keys safely.
     *
     * @param {string} keysStr
     * @return {Object|null}
     */
    function parseSessionKeys(keysStr) {
        try {
            return JSON.parse(keysStr);
        } catch (e) {
            return null;
        }
    }

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
            configs      = configs || Radio.request('configs', 'get:object');
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
                return {isChanged: true};
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
         * @return promise
         */
        saveSecureKey: function(password) {
            const self  = this;

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
         * Encrypt a collection.
         *
         * @return promise
         */
        encryptModels: function(collection) {

            // The collection is empty or PBKDF2 wasn't generated
            if (!collection.length || !Number(this.configs.encrypt) ||
                !this.keys.key) {
                return new Q();
            }

            const promises = buildEncryptPromises(collection, this);

            Radio.trigger('encrypt', 'encrypting:models', collection);

            return reducePromises(promises)
            .fail(handleEncryptModelsError);
        },

        /**
         * Decrypt a collection.
         *
         * @return promise
         */
        decryptModels: function(collection) {

            // The collection is empty or encryption is disabled
            if (!collection.length || !Number(this.configs.encrypt)) {
                return new Q();
            }

            // PBKDF2 wasn't generated
            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return new Q();
            }

            const promises = buildDecryptPromises(collection, this);

            Radio.trigger('encrypt', 'decrypting:models', collection);

            return reducePromises(promises)
            .fail(handleDecryptModelsError);
        },

        /**
         * Decrypt a model by getting data from "encryptedData" attribute.
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
         * Deprecated decryption.
         *
         * @return promise
         */
        _decryptModelKeys: function(model) {
            const promises = createLegacyDecryptPromises(model, this);

            return processLegacyPromises(promises)
            .then(function() {
                Radio.trigger('encrypt', 'decrypted:model', model);
                return model;
            });
        },

        /**
         * Save PBKDF2 to sessionStorage. That way the user will not have to
         * type their passwords every time.
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
         * @return [object|null]
         */
        _getSession: function() {
            if (!window.sessionStorage) {
                return null;
            }

            const keysStr = window.sessionStorage.getItem(this._getSessionKey());
            const keys = parseSessionKeys(keysStr);
            this.keys = keys || this.keys;
            return keys;
        },

        /**
         * Return session storage key which will be used to save PBKDF2.
         *
         * @return string
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