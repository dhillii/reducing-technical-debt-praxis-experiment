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

    var Encrypt = Marionette.Object.extend({

        initialize: function() {
            this.configs = Radio.request('configs', 'get:object');
            this.keys    = {};

            this.sjcl = new Sjcl(this.configs);

            Radio.reply('encrypt', {
                'sha256'           : this.sjcl.sha256,
            }, this.sjcl);

            Radio.reply('encrypt', {
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

        randomize: function(number, paranoia, noHex) {
            if (noHex) {
                return sjcl.random.randomWords(number, paranoia);
            }

            return sjcl.codec.hex.fromBits(
                sjcl.random.randomWords(number, paranoia)
            );
        },

        changeConfigs: function(configs) {
            configs      = configs || Radio.request('configs', 'get:object');
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
            const pwd = this.configs.encryptPass;

            return new Q(this.sjcl.sha256(password))
            .then(hash => hash.toString() === pwd.toString());
        },

        saveSecureKey: function(password) {
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

        deleteSecureKey: function() {
            this.keys = {};

            if (window.sessionStorage) {
                window.sessionStorage.removeItem(this._getSessionKey());
            }
        },

        encrypt: function(str) {
            return new Q(this.sjcl.encrypt({
                configs : this.configs,
                string  : str,
                keys    : this.keys,
                iv      : sjcl.random.randomWords(4, 0),
            }));
        },

        decrypt: function(str) {
            return new Q(this.sjcl.decrypt({
                configs : this.configs,
                string  : str,
                keys    : this.keys,
            }));
        },

        encryptModel: function(model) {
            const data = _.pick(model.attributes, model.encryptKeys);

            return this.encrypt(data)
            .then(encrypted => {
                model.set('encryptedData', encrypted);
                return model;
            });
        },

        decryptModel: function(model) {
            if (model.attributes.encryptedData) {
                return this._decryptModel(model);
            }

            return this._decryptModelKeys(model);
        },

        encryptModels: function(collection) {
            if (!this._checkEncryptModelsPreconditions(collection)) {
                return new Q();
            }

            this._triggerEncryptingModels(collection);

            const promises = this._createEncryptModelPromises(collection);

            return this._reducePromises(promises)
            .fail(e => console.error('EncryptModels Error:', e));
        },

        decryptModels: function(collection) {
            if (!this._checkDecryptModelsPreconditions(collection)) {
                return new Q();
            }

            this._triggerDecryptingModels(collection);

            const promises = this._createDecryptModelPromises(collection);

            return this._reducePromises(promises)
            .fail(e => console.error('DecryptModels Error:', e));
        },

        _decryptModel: function(model) {
            return new Q(this.sjcl.decrypt({
                configs : this.configs,
                string  : model.get('encryptedData'),
                keys    : this.keys,
            }))
            .then(data => {
                _.each(JSON.parse(data), (val, key) => {
                    model.set(key, val);
                });

                Radio.trigger('encrypt', 'decrypted:model', model);
                return model;
            });
        },

        _decryptModelKeys: function(model) {
            const promises = this._createLegacyDecryptPromises(model);

            return Q.all(promises)
            .then(() => {
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

            const keysStr = window.sessionStorage.getItem(this._getSessionKey());
            try {
                const keys = JSON.parse(keysStr);
                this.keys = keys || this.keys;
                return keys;
            } catch (e) {
                return null;
            }
        },

        _getSessionKey: function() {
            const profile = Radio.request('uri', 'profile') || 'default';
            const finalProfile = Number(this.configs.useDefaultConfigs) ? 'default' : profile;
            return 'secureKey.' + finalProfile;
        },

        /* ------------------------------------------------------------------ */
        /* Private helper methods for encryptModels and decryptModels        */
        /* ------------------------------------------------------------------ */

        _checkEncryptModelsPreconditions: function(collection) {
            return collection.length && Number(this.configs.encrypt) && this.keys.key;
        },

        _triggerEncryptingModels: function(collection) {
            Radio.trigger('encrypt', 'encrypting:models', collection);
        },

        _createEncryptModelPromises: function(collection) {
            const self = this;
            const promises = [];
            collection.each(function(model) {
                promises.push(() => new Q(self.encryptModel(model)));
            }, this);
            return promises;
        },

        _checkDecryptModelsPreconditions: function(collection) {
            if (!collection.length || !Number(this.configs.encrypt)) {
                return false;
            }
            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return false;
            }
            return true;
        },

        _triggerDecryptingModels: function(collection) {
            Radio.trigger('encrypt', 'decrypting:models', collection);
        },

        _createDecryptModelPromises: function(collection) {
            const self = this;
            const promises = [];
            collection.each(function(model) {
                promises.push(() => new Q(self.decryptModel(model)));
            }, this);
            return promises;
        },

        _reducePromises: function(promises) {
            return _.reduce(promises, Q.when, new Q());
        },

        _createLegacyDecryptPromises: function(model) {
            const self = this;
            const promises = [];
            _.each(model.encryptKeys, function(key) {
                promises.push(
                    new Q(self.sjcl.decryptLegacy({
                        configs : self.configs,
                        string  : model.get(key),
                        keys    : self.keys
                    }))
                    .then(data => model.set(key, data))
                );
            }, this);
            return promises;
        }

    });

    Radio.request('init', 'add', 'app:before', function() {
        new Encrypt();
    });

    return Encrypt;
});