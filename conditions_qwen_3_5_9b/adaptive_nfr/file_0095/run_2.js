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
         * @param {number} number - Number of random words to generate
         * @param {number} paranoia - Paranoia level for random generation
         * @param {boolean} noHex - Whether to return hex format
         * @return {string} Random data
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
         *
         * @param {object} configs - New encryption configurations
         */
        changeConfigs: function(configs) {
            configs      = configs || Radio.request('configs', 'get:object');
            this.configs = _.extend(this.configs, configs);
        },

        /**
         * Check whether a user is already authorized
         *
         * @return {object} Authorization status
         */
        checkAuth: function() {
            return this._checkEncryptionBackup()
                || this._checkEncryptionDisabled()
                || this._checkSessionExists();
        },

        /**
         * Check if encryption backup exists indicating settings were changed.
         *
         * @return {object} Authorization status
         */
        _checkEncryptionBackup: function() {
            if (!_.isEmpty(this.configs.encryptBackup)) {
                Radio.trigger('encrypt', 'changed');
                return {isChanged: true};
            }
            return null;
        },

        /**
         * Check if encryption is disabled.
         *
         * @return {boolean} Authorization status
         */
        _checkEncryptionDisabled: function() {
            if (!Number(this.configs.encrypt) || this.configs.encryptPass === '') {
                return true;
            }
            return null;
        },

        /**
         * Check if session exists with valid keys.
         *
         * @return {boolean} Authorization status
         */
        _checkSessionExists: function() {
            return !_.isEmpty(this.keys) || this._getSession() !== null;
        },

        /**
         * Check the password with the password in the database which is saved
         * in there in sha256 hash format. Note, just the password is not used
         * for encrypting/decrypting data. We use instead PBKDF2.
         *
         * @param {string} password - Password to validate
         * @return {Promise} Validation result
         */
        checkPassword: function(password) {
            var pwd = this.configs.encryptPass;

            return this._hashPassword(password)
                .then(function(hash) {
                    return hash.toString() === pwd.toString();
                });
        },

        /**
         * Hash the provided password using SHA256.
         *
         * @param {string} password - Password to hash
         * @return {Promise} Hashed password
         */
        _hashPassword: function(password) {
            return new Q(this.sjcl.sha256(password));
        },

        /**
         * Generate PBKDF2 and save it. It will be used to encrypt/decrypt data.
         *
         * @param {string} password - Password to derive key from
         * @return {Promise} Derived key
         */
        saveSecureKey: function(password) {
            var self  = this;

            return this._deriveKey(password)
                .then(function(keys) {
                    self._storeDerivedKeys(keys);
                    self._saveSession();
                });
        },

        /**
         * Derive encryption key from password using PBKDF2.
         *
         * @param {string} password - Password to derive key from
         * @return {Promise} Derived keys
         */
        _deriveKey: function(password) {
            return new Q(this.sjcl.deriveKey({
                configs : this.configs,
                password: password
            }));
        },

        /**
         * Store derived keys in instance.
         *
         * @param {object} keys - Derived key material
         */
        _storeDerivedKeys: function(keys) {
            this.keys.key    = keys.key;
            this.keys.hexKey = keys.hexKey;
        },

        /**
         * Delete current PBKDF2.
         */
        deleteSecureKey: function() {
            this._clearKeys();
            this._removeSessionStorage();
        },

        /**
         * Clear stored keys from instance.
         */
        _clearKeys: function() {
            this.keys = {};
        },

        /**
         * Remove secure key from session storage.
         */
        _removeSessionStorage: function() {
            if (window.sessionStorage) {
                window.sessionStorage.removeItem(this._getSessionKey());
            }
        },

        /**
         * Encrypt data.
         *
         * @param {string} str - String to encrypt
         * @return {Promise} Encrypted string
         */
        encrypt: function(str) {
            return this._generateEncryptionOptions(str)
                .then(function(options) {
                    return this.sjcl.encrypt(options);
                }, this);
        },

        /**
         * Generate encryption options with random IV.
         *
         * @param {string} str - String to encrypt
         * @return {object} Encryption options
         */
        _generateEncryptionOptions: function(str) {
            return {
                configs : this.configs,
                string  : str,
                keys    : this.keys,
                iv      : sjcl.random.randomWords(4, 0)
            };
        },

        /**
         * Decrypt data.
         *
         * @param {string} str - String to decrypt
         * @return {Promise} Decrypted string
         */
        decrypt: function(str) {
            return this.sjcl.decrypt({
                configs : this.configs,
                string  : str,
                keys    : this.keys,
            });
        },

        /**
         * Encrypt a model.
         *
         * @param {object} model - Backbone model to encrypt
         * @return {Promise} Encrypted model
         */
        encryptModel: function(model) {
            var data = this._extractModelAttributes(model);

            return this.encrypt(data)
                .then(function(encrypted) {
                    return this._updateModelWithEncryptedData(model, encrypted);
                }, this);
        },

        /**
         * Extract attributes to encrypt from model.
         *
         * @param {object} model - Backbone model
         * @return {object} Attributes to encrypt
         */
        _extractModelAttributes: function(model) {
            return _.pick(model.attributes, model.encryptKeys);
        },

        /**
         * Update model with encrypted data.
         *
         * @param {object} model - Backbone model
         * @param {string} encrypted - Encrypted data
         * @return {object} Updated model
         */
        _updateModelWithEncryptedData: function(model, encrypted) {
            model.set('encryptedData', encrypted);
            return model;
        },

        /**
         * Decrypt a model.
         *
         * @param {object} model - Backbone model to decrypt
         * @return {Promise} Decrypted model
         */
        decryptModel: function(model) {
            if (model.attributes.encryptedData) {
                return this._decryptModel(model);
            }

            return this._decryptModelKeys(model);
        },

        /**
         * Decrypt a model by getting data from "encryptedData" attribute.
         *
         * @param {object} model - Backbone model
         * @return {Promise} Decrypted model
         */
        _decryptModel: function(model) {
            return this._decryptModelData(model)
                .then(function(data) {
                    return this._restoreModelAttributes(model, data);
                }, this);
        },

        /**
         * Decrypt model data using sjcl.
         *
         * @param {object} model - Backbone model
         * @return {Promise} Decrypted data
         */
        _decryptModelData: function(model) {
            return new Q(this.sjcl.decrypt({
                configs : this.configs,
                string  : model.get('encryptedData'),
                keys    : this.keys,
            }));
        },

        /**
         * Restore model attributes from decrypted data.
         *
         * @param {object} model - Backbone model
         * @param {object} data - Decrypted data
         * @return {object} Updated model
         */
        _restoreModelAttributes: function(model, data) {
            _.each(JSON.parse(data), function(val, key) {
                model.set(key, val);
            });

            Radio.trigger('encrypt', 'decrypted:model', model);
            return model;
        },

        /**
         * Deprecated decryption using legacy keys.
         *
         * @param {object} model - Backbone model
         * @return {Promise} Decrypted model
         */
        _decryptModelKeys: function(model) {
            var promises = [],
                self     = this;

            this._decryptLegacyModelKeys(model, promises);

            return Q.all(promises)
                .then(function() {
                    Radio.trigger('encrypt', 'decrypted:model', model);
                    return model;
                });
        },

        /**
         * Decrypt legacy model keys.
         *
         * @param {object} model - Backbone model
         * @param {array} promises - Array of promises to resolve
         */
        _decryptLegacyModelKeys: function(model, promises) {
            _.each(model.encryptKeys, function(key) {
                promises.push(
                    this._decryptLegacyKey(model, key)
                );
            }, this);
        },

        /**
         * Decrypt a single legacy key.
         *
         * @param {object} model - Backbone model
         * @param {string} key - Key to decrypt
         * @return {Promise} Decrypted value
         */
        _decryptLegacyKey: function(model, key) {
            return new Q(this.sjcl.decryptLegacy({
                configs : this.configs,
                string  : model.get(key),
                keys    : this.keys
            }))
            .then(function(data) {
                model.set(key, data);
            });
        },

        /**
         * Encrypt a collection.
         *
         * @param {object} collection - Backbone collection to encrypt
         * @return {Promise} Encrypted collection
         */
        encryptModels: function(collection) {
            if (!this._shouldEncryptCollection(collection)) {
                return new Q();
            }

            var promises = [],
                self     = this;

            Radio.trigger('encrypt', 'encrypting:models', collection);

            collection.each(function(model) {
                promises.push(function() {
                    return new Q(self.encryptModel(model));
                });
            }, this);

            return this._processCollectionPromises(promises);
        },

        /**
         * Check if collection should be encrypted.
         *
         * @param {object} collection - Backbone collection
         * @return {boolean} Should encrypt
         */
        _shouldEncryptCollection: function(collection) {
            return collection.length &&
                Number(this.configs.encrypt) &&
                this.keys.key;
        },

        /**
         * Process collection encryption promises.
         *
         * @param {array} promises - Array of promises
         * @return {Promise} Processed result
         */
        _processCollectionPromises: function(promises) {
            return _.reduce(promises, Q.when, new Q())
                .fail(function(e) {
                    console.error('EncryptModels Error:', e);
                });
        },

        /**
         * Decrypt a collection.
         *
         * @param {object} collection - Backbone collection to decrypt
         * @return {Promise} Decrypted collection
         */
        decryptModels: function(collection) {
            if (!this._shouldDecryptCollection(collection)) {
                return new Q();
            }

            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return new Q();
            }

            var promises = [],
                self = this;

            Radio.trigger('encrypt', 'decrypting:models', collection);

            collection.each(function(model) {
                promises.push(function() {
                    return new Q(self.decryptModel(model));
                });
            }, this);

            return this._processCollectionPromises(promises);
        },

        /**
         * Check if collection should be decrypted.
         *
         * @param {object} collection - Backbone collection
         * @return {boolean} Should decrypt
         */
        _shouldDecryptCollection: function(collection) {
            return collection.length && Number(this.configs.encrypt);
        },

        /**
         * Save PBKDF2 to sessionStorage. That way the user will not have to
         * type their passwords every time.
         */
        _saveSession: function() {
            if (!this._hasSessionStorage() || !this.keys) {
                return;
            }

            window.sessionStorage.setItem(
                this._getSessionKey(),
                JSON.stringify(this.keys)
            );
        },

        /**
         * Check if sessionStorage is available.
         *
         * @return {boolean} Has sessionStorage
         */
        _hasSessionStorage: function() {
            return window.sessionStorage;
        },

        /**
         * Get PBKDF2 from sessionStorage.
         *
         * @return {object|null} Stored keys or null
         */
        _getSession: function() {
            if (!this._hasSessionStorage()) {
                return null;
            }

            var keys  = window.sessionStorage.getItem(this._getSessionKey());
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
         * @return {string} Session storage key
         */
        _getSessionKey: function() {
            var profile = Radio.request('uri', 'profile') || 'default';
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
```