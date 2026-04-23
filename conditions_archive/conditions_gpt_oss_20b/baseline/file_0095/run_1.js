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
            this.configs = Radio.request('configs', 'get:object');
            this.keys = {};

            this.sjcl = new Sjcl(this.configs);

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

        randomize(number, paranoia, noHex) {
            if (noHex) {
                return sjcl.random.randomWords(number, paranoia);
            }
            return sjcl.codec.hex.fromBits(
                sjcl.random.randomWords(number, paranoia)
            );
        },

        changeConfigs(configs) {
            const newConfigs = configs || Radio.request('configs', 'get:object');
            this.configs = _.extend(this.configs, newConfigs);
        },

        checkAuth() {
            if (!_.isEmpty(this.configs.encryptBackup)) {
                Radio.trigger('encrypt', 'changed');
                return { isChanged: true };
            }
            if (!Number(this.configs.encrypt) || this.configs.encryptPass === '') {
                return true;
            }
            return !_.isEmpty(this.keys) || this._getSession() !== null;
        },

        checkPassword(password) {
            const pwd = this.configs.encryptPass;
            return new Q(this.sjcl.sha256(password))
                .then(hash => hash.toString() === pwd.toString());
        },

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

        deleteSecureKey() {
            this.keys = {};
            if (window.sessionStorage) {
                window.sessionStorage.removeItem(this._getSessionKey());
            }
        },

        encrypt(str) {
            return new Q(this.sjcl.encrypt({
                configs: this.configs,
                string: str,
                keys: this.keys,
                iv: sjcl.random.randomWords(4, 0)
            }));
        },

        decrypt(str) {
            return new Q(this.sjcl.decrypt({
                configs: this.configs,
                string: str,
                keys: this.keys
            }));
        },

        encryptModel(model) {
            const data = _.pick(model.attributes, model.encryptKeys);
            return this.encrypt(data)
                .then(encrypted => {
                    model.set('encryptedData', encrypted);
                    return model;
                });
        },

        decryptModel(model) {
            if (model.attributes.encryptedData) {
                return this._decryptModel(model);
            }
            return this._decryptModelKeys(model);
        },

        encryptModels(collection) {
            if (!collection.length || !Number(this.configs.encrypt) || !this.keys.key) {
                return new Q();
            }
            const promises = [];
            Radio.trigger('encrypt', 'encrypting:models', collection);
            collection.each(model => {
                promises.push(() => new Q(this.encryptModel(model)));
            });
            return _.reduce(promises, Q.when, new Q())
                .fail(e => console.error('EncryptModels Error:', e));
        },

        decryptModels(collection) {
            if (!collection.length || !Number(this.configs.encrypt)) {
                return new Q();
            }
            if (!this.keys.key) {
                Radio.trigger('encrypt', 'decrypt:error', 'PBKDF2 is empty');
                return new Q();
            }
            const promises = [];
            Radio.trigger('encrypt', 'decrypting:models', collection);
            collection.each(model => {
                promises.push(() => new Q(this.decryptModel(model)));
            });
            return _.reduce(promises, Q.when, new Q())
                .fail(e => console.error('DecryptModels Error:', e));
        },

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

        _saveSession() {
            if (!window.sessionStorage || !this.keys) {
                return;
            }
            window.sessionStorage.setItem(
                this._getSessionKey(),
                JSON.stringify(this.keys)
            );
        },

        _getSession() {
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

        _getSessionKey() {
            let profile = Radio.request('uri', 'profile') || 'default';
            profile = Number(this.configs.useDefaultConfigs) ? 'default' : profile;
            return 'secureKey.' + profile;
        }

    });

    Radio.request('init', 'add', 'app:before', () => {
        new Encrypt();
    });

    return Encrypt;
});