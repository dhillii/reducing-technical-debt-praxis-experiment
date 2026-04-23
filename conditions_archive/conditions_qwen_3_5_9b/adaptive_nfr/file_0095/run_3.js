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
            this._initializeConfigs();
            this._initializeSjcl();
            this._initializeRadioReplies();
        },

        /**
         * Initialize encryption configurations.
         */
        _initializeConfigs: function() {
            this.configs = Radio.request('configs', 'get:object');
            this.keys    = {};
        },

        /**
         * Initialize Sjcl encryption instance.
         */
        _initializeSjcl: function() {
            this.sjcl = new Sjcl(this.configs);
        },

        /**
         * Register all encryption-related radio replies.
         */
        _initializeRadioReplies: function() {
            Radio.reply('encrypt', {
                'sha256'           : this.sjcl.sha256,
                'randomize'        : this.randomize,
                'change:configs'   : this.changeConfigs,
                'check:auth'       : this.checkAuth,
                'check:password'   : this.checkPassword,
                'save:secureKey'   : this.saveSecureKey,
                'delete:secureKey' : this.deleteSecureKey,
                'encrypt'          : this.encrypt,
                'decrypt'          : this.decrypt,
                'encrypt:model'    : this.encryptModel,
                'decrypt:model'    : this.decryptModel,
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
         * @return {string}
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
         * @param {object} configs - New configuration object
         */
        changeConfigs: function(configs) {
            configs      = configs || Radio.request('configs', 'get:object');
            this.configs = _.extend(this.configs, configs);
        },

        /**
         * Check whether a user is already authorized.
         *
         * @return {object} Authorization status
         */
        checkAuth: function() {
            if (this._hasEncryptionBackup()) {
                Radio.trigger('encrypt', 'changed');
                return {isChanged: true};
            }

            if (this._isEncryptionDisabled()) {
                return true;
            }

            return this._hasEncryptionKey();
        },

        /**
         * Check if encryption backup exists.
         *
         * @return {boolean}
         */
        _hasEncryptionBackup: function() {
            return !_.isEmpty(this.configs.encryptBackup);
        },

        /**
         * Check if encryption is disabled.
         *
         * @return {boolean}
         */
        _isEncryptionDisabled: function() {
            return !Number(this.configs.encrypt) || this.configs.encryptPass === '';
        },

        /**
         * Check if encryption key exists.
         *
         * @return {boolean}
         */
        _hasEncryptionKey: function() {
            return !_.isEmpty(this.keys) || this._getSession() !== null;
        },

        /**
         * Check the password with the password in the database which is saved
         * in there in sha256 hash format. Note, just the password is not used
         * for encrypting/decrypting data. We use instead PBKDF2.
         *
         * @param {string} password - Password to validate
         * @return {promise}
         */
        checkPassword: function(password) {
            var pwd = this.configs.encryptPass;

            return this._hashPassword(password)
            .then(function(hash) {
                return hash.toString() === pwd.toString();
            });
        },

        /**
         * Hash the provided password using sjcl.
         *
         * @param {string} password - Password to hash
         * @return {promise}
         */
        _hashPassword: function(password) {
            return new Q(this.sjcl.sha256(password));
        },

        /**
         * Generate PBKDF2 and save it. It will be used to encrypt/decrypt data.
         *
         * @param {string} password - Password to derive key from
         * @return {promise}
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
         * Derive encryption key from password.
         *
         * @param {string} password - Password to derive key from
         * @return {promise}
         */
        _deriveKey: function(password) {
            return new Q(this.sjcl.deriveKey({
                configs : this.configs,
                password: password
            }));
        },

        /**
         * Store derived encryption keys in instance.
         *
         * @param {object} keys - Derived keys object
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
         * Clear encryption keys from instance.
         */
        _clearKeys: function() {
            this.keys = {};
        },

        /**
         * Remove encryption key from session storage.
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
         * @return {promise}
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
         * @return {promise}
         */
        _generateEncryptionOptions: function(str) {
            return new Q({
                configs : this.configs,
                string  : str,
                keys    : this.keys,
                iv      : sjcl.random.randomWords(4, 0)
            });
        },

        /**
         * Decrypt data.
         *
         * @param {string} str - String to decrypt
         * @return {promise}
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
         * @param {object} model - Backbone model to encrypt
         * @return {promise}
         */
        encryptModel: function(model) {
            var data = this._extractModelAttributes(model);

            return this.encrypt(data)
            .then(function(encrypted) {
                model.set('encryptedData', encrypted);
                return model;
            });
        },

        /**
         * Extract attributes to encrypt from model.
         *
         * @param {object} model - Backbone model
         * @return {object}
         */
        _extractModelAttributes: function(model) {
            return _.pick(model.attributes, model.encryptKeys);
        },

        /**
         * Decrypt a model.
         *
         * @param {object} model - Backbone model to decrypt
         * @return {promise}
         */
        decryptModel: function(model) {
            if (model.attributes.encryptedData) {
                return this._decryptModel(model);
            }

            return this._decryptModelKeys(model);
        },

        /**
         * Decrypt a collection.
         *
         * @param {object} collection - Backbone collection to decrypt
         * @return {promise}
         */
        decryptModels: function(collection) {
            if (this._isCollectionEmpty(collection)) {
                return new Q();
            }

            if (this._isEncryptionDisabled()) {
                return new Q();
            }

            if (!this._hasEncryptionKey()) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return new Q();
            }

            return this._processCollectionDecryption(collection);
        },

        /**
         * Check if collection is empty.
         *
         * @param {object} collection - Backbone collection
         * @return {boolean}
         */
        _isCollectionEmpty: function(collection) {
            return !collection.length;
        },

        /**
         * Process decryption for all models in collection.
         *
         * @param {object} collection - Backbone collection
         * @return {promise}
         */
        _processCollectionDecryption: function(collection) {
            var promises = [],
                self     = this;

            Radio.trigger('encrypt', 'decrypting:models', collection);

            collection.each(function(model) {
                promises.push(function() {
                    return new Q(self.decryptModel(model));
                });
            }, this);

            return this._aggregateCollectionPromises(promises);
        },

        /**
         * Aggregate promises from collection processing.
         *
         * @param {array} promises - Array of promises
         * @return {promise}
         */
        _aggregateCollectionPromises: function(promises) {
            return _.reduce(promises, Q.when, new Q())
            .fail(function(e) {
                console.error('DecryptModels Error:', e);
            });
        },

        /**
         * Encrypt a collection.
         *
         * @param {object} collection - Backbone collection to encrypt
         * @return {promise}
         */
        encryptModels: function(collection) {
            if (this._isCollectionEmpty(collection) ||
                this._isEncryptionDisabled() ||
                !this._hasEncryptionKey()) {
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

            return this._aggregateCollectionPromises(promises);
        },

        /**
         * Decrypt a model by getting data from "encryptedData" attribute.
         *
         * @param {object} model - Backbone model to decrypt
         * @return {promise}
         */
        _decryptModel: function(model) {
            return this._decryptModelData(model)
            .then(function(data) {
                this._applyDecryptedDataToModel(model, data);
                Radio.trigger('encrypt', 'decrypted:model', model);
                return model;
            }, this);
        },

        /**
         * Decrypt model data using sjcl.
         *
         * @param {object} model - Backbone model
         * @return {promise}
         */
        _decryptModelData: function(model) {
            return new Q(this.sjcl.decrypt({
                configs : this.configs,
                string  : model.get('encryptedData'),
                keys    : this.keys,
            }));
        },

        /**
         * Apply decrypted data to model attributes.
         *
         * @param {object} model - Backbone model
         * @param {string} data - Decrypted data string
         */
        _applyDecryptedDataToModel: function(model, data) {
            _.each(JSON.parse(data), function(val, key) {
                model.set(key, val);
            });
        },

        /**
         * Deprecated decryption.
         *
         * @param {object} model - Backbone model to decrypt
         * @return {promise}
         */
        _decryptModelKeys: function(model) {
            var promises = [],
                self     = this;

            this._processLegacyModelDecryption(model, promises);

            return this._aggregateLegacyPromises(promises)
            .then(function() {
                Radio.trigger('encrypt', 'decrypted:model', model);
                return model;
            });
        },

        /**
         * Process legacy model decryption for each key.
         *
         * @param {object} model - Backbone model
         * @param {array} promises - Array to push promises to
         */
        _processLegacyModelDecryption: function(model, promises) {
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
         * @return {promise}
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
         * Aggregate legacy decryption promises.
         *
         * @param {array} promises - Array of promises
         * @return {promise}
         */
        _aggregateLegacyPromises: function(promises) {
            return Q.all(promises);
        },

        /**
         * Save PBKDF2 to sessionStorage. That way the user will not have to
         * type their passwords every time.
         */
        _saveSession: function() {
            if (!this._hasSessionStorage() || !this._hasDerivedKeys()) {
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
         * @return {boolean}
         */
        _hasSessionStorage: function() {
            return window.sessionStorage;
        },

        /**
         * Check if derived keys exist.
         *
         * @return {boolean}
         */
        _hasDerivedKeys: function() {
            return this.keys && this.keys.key;
        },

        /**
         * Get PBKDF2 from sessionStorage.
         *
         * @return {object|null}
         */
        _getSession: function() {
            if (!this._hasSessionStorage()) {
                return null;
            }

            var keys  = this._getItemFromSessionStorage();
            try {
                keys = JSON.parse(keys);
                this.keys = keys || this.keys;
            } catch (e) {
                keys = null;
            }

            return keys;
        },

        /**
         * Get item from session storage.
         *
         * @return {string|null}
         */
        _getItemFromSessionStorage: function() {
            return window.sessionStorage.getItem(this._getSessionKey());
        },

        /**
         * Return session storage key which will be used to save PBKDF2.
         *
         * @return {string}
         */
        _getSessionKey: function() {
            var profile = this._getProfileFromRadio();
            profile = this._resolveProfile(profile);
            return 'secureKey.' + profile;
        },

        /**
         * Get profile from radio request.
         *
         * @return {string}
         */
        _getProfileFromRadio: function() {
            return Radio.request('uri', 'profile') || 'default';
        },

        /**
         * Resolve profile to final value.
         *
         * @param {string} profile - Profile string
         * @return {string}
         */
        _resolveProfile: function(profile) {
            return (Number(this.configs.useDefaultConfigs) ? 'default' : profile);
        }

    });

    // Initialize
    Radio.request('init', 'add', 'app:before', function() {
        new Encrypt();
    });

    return Encrypt;
});
```