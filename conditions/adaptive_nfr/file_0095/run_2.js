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
            this.configs = Radio.request('configs', 'get:object');
            this.keys = {};
            this.sjcl = new Sjcl(this.configs);

            this._registerRadioReplies();
        },

        _registerRadioReplies: function() {
            Radio.reply('encrypt', {
                'sha256': this.sjcl.sha256,
            }, this.sjcl);

            Radio.reply('encrypt', {
                'randomize': this.randomize,
                'change:configs': this.changeConfigs,
                'check:auth': this.checkAuth,
                'check:password': this.checkPassword,
                'save:secureKey': this.saveSecureKey,
                'delete:secureKey': this.deleteSecureKey,
                'encrypt': this.encrypt,
                'decrypt': this.decrypt,
                'encrypt:model': this.encryptModel,
                'decrypt:model': this.decryptModel,
                'encrypt:models': this.encryptModels,
                'decrypt:models': this.decryptModels
            }, this);
        },

        randomize: function(number, paranoia, noHex) {
            var randomWords = sjcl.random.randomWords(number, paranoia);
            return noHex ? randomWords : sjcl.codec.hex.fromBits(randomWords);
        },

        changeConfigs: function(configs) {
            configs = configs || Radio.request('configs', 'get:object');
            this.configs = _.extend(this.configs, configs);
        },

        checkAuth: function() {
            if (!_.isEmpty(this.configs.encryptBackup)) {
                Radio.trigger('encrypt', 'changed');
                return {isChanged: true};
            }

            if (!Number(this.configs.encrypt) || this.configs.encryptPass === '') {
                return true;
            }

            return !_.isEmpty(this.keys) || this._getSession() !== null;
        },

        checkPassword: function(password) {
            var pwd = this.configs.encryptPass;
            return new Q(this.sjcl.sha256(password))
                .then(function(hash) {
                    return hash.toString() === pwd.toString();
                });
        },

        saveSecureKey: function(password) {
            var self = this;
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

        deleteSecureKey: function() {
            this.keys = {};
            if (window.sessionStorage) {
                window.sessionStorage.removeItem(this._getSessionKey());
            }
        },

        encrypt: function(str) {
            return new Q(this.sjcl.encrypt({
                configs: this.configs,
                string: str,
                keys: this.keys,
                iv: sjcl.random.randomWords(4, 0),
            }));
        },

        decrypt: function(str) {
            return new Q(this.sjcl.decrypt({
                configs: this.configs,
                string: str,
                keys: this.keys,
            }));
        },

        encryptModel: function(model) {
            var data = _.pick(model.attributes, model.encryptKeys);
            return this.encrypt(data)
                .then(function(encrypted) {
                    model.set('encryptedData', encrypted);
                    return model;
                });
        },

        decryptModel: function(model) {
            return model.attributes.encryptedData ?
                this._decryptModel(model) :
                this._decryptModelKeys(model);
        },

        encryptModels: function(collection) {
            if (!this._canEncryptCollection(collection)) {
                return new Q();
            }

            var promises = [];
            var self = this;

            Radio.trigger('encrypt', 'encrypting:models', collection);

            collection.each(function(model) {
                promises.push(function() {
                    return new Q(self.encryptModel(model));
                });
            }, this);

            return this._executePromiseSequence(promises, 'EncryptModels Error');
        },

        decryptModels: function(collection) {
            if (!this._canDecryptCollection(collection)) {
                return new Q();
            }

            var promises = [];
            var self = this;

            Radio.trigger('encrypt', 'decrypting:models', collection);

            collection.each(function(model) {
                promises.push(function() {
                    return new Q(self.decryptModel(model));
                });
            }, this);

            return this._executePromiseSequence(promises, 'DecryptModels Error');
        },

        _canEncryptCollection: function(collection) {
            return collection.length && Number(this.configs.encrypt) && this.keys.key;
        },

        _canDecryptCollection: function(collection) {
            if (!collection.length || !Number(this.configs.encrypt)) {
                return false;
            }

            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return false;
            }

            return true;
        },

        _executePromiseSequence: function(promises, errorLabel) {
            return _.reduce(promises, Q.when, new Q())
                .fail(function(e) {
                    console.error(errorLabel + ':', e);
                });
        },

        _decryptModel: function(model) {
            var self = this;
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

        _decryptModelKeys: function(model) {
            var promises = [];
            var self = this;

            _.each(model.encryptKeys, function(key) {
                promises.push(
                    new Q(self.sjcl.decryptLegacy({
                        configs: self.configs,
                        string: model.get(key),
                        keys: self.keys
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

        _saveSession: function() {
            if (!window.sessionStorage || !this.keys) {
                return;
            }

            window.sessionStorage.setItem(
                this._getSessionKey(),
                JSON.stringify(this.keys)
            );
        },

        _getSession: function() {
            if (!window.sessionStorage) {
                return null;
            }

            var keys = window.sessionStorage.getItem(this._getSessionKey());
            try {
                keys = JSON.parse(keys);
                this.keys = keys || this.keys;
            } catch (e) {
                keys = null;
            }

            return keys;
        },

        _getSessionKey: function() {
            var profile = Radio.request('uri', 'profile') || 'default';
            profile = Number(this.configs.useDefaultConfigs) ? 'default' : profile;
            return 'secureKey.' + profile;
        }

    });

    Radio.request('init', 'add', 'app:before', function() {
        new Encrypt();
    });

    return Encrypt;
});
```