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
            var hasBackup = this._hasEncryptionBackup();
            var isDisabled = this._isEncryptionDisabled();
            var hasKey = this._hasSecureKey();

            if (hasBackup) {
                Radio.trigger('encrypt', 'changed');
                return {isChanged: true};
            }

            if (isDisabled) {
                return true;
            }

            return hasKey;
        },

        /**
         * Check if encryption backup exists.
         *
         * @return bool
         */
        _hasEncryptionBackup: function() {
            return !_.isEmpty(this.configs.encryptBackup);
        },

        /**
         * Check if encryption is disabled.
         *
         * @return bool
         */
        _isEncryptionDisabled: function() {
            return !Number(this.configs.encrypt) || this.configs.encryptPass === '';
        },

        /**
         * Check if secure key exists.
         *
         * @return bool
         */
        _hasSecureKey: function() {
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
            var pwd = this.configs.encryptPass;

            return this._hashPassword(password)
            .then(function(hash) {
                return hash.toString() === pwd.toString();
            });
        },

        /**
         * Hash the provided password using sjcl.
         *
         * @param {string} password
         * @return promise
         */
        _hashPassword: function(password) {
            return new Q(this.sjcl.sha256(password));
        },

        /**
         * Generate PBKDF2 and save it. It will be used to encrypt/decrypt data.
         *
         * @return promise
         */
        saveSecureKey: function(password) {
            var self  = this;

            return this._deriveKey(password)
            .then(function(keys) {
                self._storeKeys(keys);
                self._saveSession();
            });
        },

        /**
         * Derive encryption keys from password.
         *
         * @param {string} password
         * @return promise
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
         * @param {object} keys
         */
        _storeKeys: function(keys) {
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
         * @return promise
         */
        encrypt: function(str) {
            return this._encryptString(str);
        },

        /**
         * Encrypt a string using sjcl.
         *
         * @param {string} str
         * @return promise
         */
        _encryptString: function(str) {
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
            return this._decryptString(str);
        },

        /**
         * Decrypt a string using sjcl.
         *
         * @param {string} str
         * @return promise
         */
        _decryptString: function(str) {
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
            var data = this._extractModelData(model);

            return this._encryptModelData(data)
            .then(function(encrypted) {
                return this._updateModelWithEncryptedData(model, encrypted);
            }, this);
        },

        /**
         * Extract encryptable data from model.
         *
         * @param {Backbone.Model} model
         * @return object
         */
        _extractModelData: function(model) {
            return _.pick(model.attributes, model.encryptKeys);
        },

        /**
         * Encrypt extracted model data.
         *
         * @param {object} data
         * @return promise
         */
        _encryptModelData: function(data) {
            return this.encrypt(data);
        },

        /**
         * Update model with encrypted data.
         *
         * @param {Backbone.Model} model
         * @param {string} encrypted
         * @return {Backbone.Model}
         */
        _updateModelWithEncryptedData: function(model, encrypted) {
            model.set('encryptedData', encrypted);
            return model;
        },

        /**
         * Decrypt a model.
         *
         * @return promise
         */
        decryptModel: function(model) {
            if (model.attributes.encryptedData) {
                return this._decryptModelFromEncryptedData(model);
            }

            return this._decryptModelFromLegacyKeys(model);
        },

        /**
         * Decrypt model from encryptedData attribute.
         *
         * @param {Backbone.Model} model
         * @return promise
         */
        _decryptModelFromEncryptedData: function(model) {
            return this._decryptModel(model);
        },

        /**
         * Decrypt model from legacy keys.
         *
         * @param {Backbone.Model} model
         * @return promise
         */
        _decryptModelFromLegacyKeys: function(model) {
            return this._decryptModelKeys(model);
        },

        /**
         * Encrypt a collection.
         *
         * @return promise
         */
        encryptModels: function(collection) {
            if (!this._shouldEncryptCollection(collection)) {
                return new Q();
            }

            return this._encryptCollection(collection);
        },

        /**
         * Check if collection should be encrypted.
         *
         * @param {Backbone.Collection} collection
         * @return bool
         */
        _shouldEncryptCollection: function(collection) {
            return collection.length &&
                Number(this.configs.encrypt) &&
                this.keys.key;
        },

        /**
         * Encrypt all models in collection.
         *
         * @param {Backbone.Collection} collection
         * @return promise
         */
        _encryptCollection: function(collection) {
            Radio.trigger('encrypt', 'encrypting:models', collection);

            var promises = [];

            collection.each(function(model) {
                promises.push(function() {
                    return new Q(this.encryptModel(model));
                }, this);
            }, this);

            return this._processCollectionPromises(promises);
        },

        /**
         * Process collection promises with error handling.
         *
         * @param {array} promises
         * @return promise
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
         * @return promise
         */
        decryptModels: function(collection) {
            if (!this._shouldDecryptCollection(collection)) {
                return new Q();
            }

            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return new Q();
            }

            return this._decryptCollection(collection);
        },

        /**
         * Check if collection should be decrypted.
         *
         * @param {Backbone.Collection} collection
         * @return bool
         */
        _shouldDecryptCollection: function(collection) {
            return collection.length && Number(this.configs.encrypt);
        },

        /**
         * Decrypt all models in collection.
         *
         * @param {Backbone.Collection} collection
         * @return promise
         */
        _decryptCollection: function(collection) {
            Radio.trigger('encrypt', 'decrypting:models', collection);

            var promises = [];

            collection.each(function(model) {
                promises.push(function() {
                    return new Q(this.decryptModel(model));
                }, this);
            }, this);

            return this._processCollectionPromises(promises);
        },

        /**
         * Decrypt a model by getting data from "encryptedData" attribute.
         *
         * @return promise
         */
        _decryptModel: function(model) {
            return this._decryptModelFromEncryptedData(model);
        },

        /**
         * Decrypt model from encryptedData attribute.
         *
         * @param {Backbone.Model} model
         * @return promise
         */
        _decryptModelFromEncryptedData: function(model) {
            return new Q(this.sjcl.decrypt({
                configs : this.configs,
                string  : model.get('encryptedData'),
                keys    : this.keys,
            }))
            .then(function(data) {
                return this._updateModelFromDecryptedData(model, data);
            }, this);
        },

        /**
         * Update model with decrypted data.
         *
         * @param {Backbone.Model} model
         * @param {object} data
         * @return {Backbone.Model}
         */
        _updateModelFromDecryptedData: function(model, data) {
            _.each(JSON.parse(data), function(val, key) {
                model.set(key, val);
            });

            Radio.trigger('encrypt', 'decrypted:model', model);
            return model;
        },

        /**
         * Decrypt model using legacy keys.
         *
         * @param {Backbone.Model} model
         * @return promise
         */
        _decryptModelKeys: function(model) {
            var promises = [];

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
         * @param {Backbone.Model} model
         * @param {array} promises
         */
        _decryptLegacyModelKeys: function(model, promises) {
            _.each(model.encryptKeys, function(key) {
                promises.push(
                    new Q(this.sjcl.decryptLegacy({
                        configs : this.configs,
                        string  : model.get(key),
                        keys    : this.keys
                    }))
                    .then(function(data) {
                        model.set(key, data);
                    })
                );
            }, this);
        },

        /**
         * Save PBKDF2 to sessionStorage. That way the user will not have to
         * type their passwords every time.
         */
        _saveSession: function() {
            if (!this._canSaveSession()) {
                return;
            }

            window.sessionStorage.setItem(
                this._getSessionKey(),
                JSON.stringify(this.keys)
            );
        },

        /**
         * Check if session storage can be used.
         *
         * @return bool
         */
        _canSaveSession: function() {
            return window.sessionStorage && this.keys;
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
         * @return string|null
         */
        _getItemFromSessionStorage: function() {
            return window.sessionStorage.getItem(this._getSessionKey());
        },

        /**
         * Return session storage key which will be used to save PBKDF2.
         *
         * @return string
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