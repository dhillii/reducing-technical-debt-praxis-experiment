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
    'apps/encryption/encrypt/view',
    'apps/encryption/encrypt/backupView'
], function(Q, _, Marionette, Radio, View, BackupView) {
    'use strict';

    var Controller = Marionette.Object.extend({

        collectionNames: ['notes', 'tags', 'notebooks'],
        collections: {},

        initialize: function(options) {
            _.bindAll(this, 'saveChanges', 'encrypt', 'redirect', 'show', 
                      'encryptProfile', 'showBackup', 'checkPasswords', 'initEncrypt');

            this.options = options;
            this.vent = Radio.channel('encrypt');
            this.configs = Radio.request('configs', 'get:object');
            this.backup = _.extend({}, this.configs, this.configs.encryptBackup);

            this.vent.request('delete:secureKey');
            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);

            Radio.request('configs', 'get:profiles')
                .then(this.show)
                .fail(this._handleError);
        },

        onDestroy: function() {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        show: function(profiles) {
            this.profiles = profiles;
            this.view = new View({
                collections: this.collectionNames,
                configs: this.configs
            });
            Radio.request('global', 'region:show', 'brand', this.view);
            this.listenTo(this.view, 'check:passwords', this.checkPasswords);
        },

        checkPasswords: function(data) {
            var promises = this._buildPasswordCheckPromises(data);

            return Q.all(promises)
                .then(_.bind(this._validatePasswords, this, data))
                .fail(this._handleError);
        },

        _buildPasswordCheckPromises: function(data) {
            var promises = [];

            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }

            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }

            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }

            return promises;
        },

        _validatePasswords: function(data, results) {
            if (!results.length || _.indexOf(results, false) > -1) {
                this.view.trigger('password:invalid', results);
                return;
            }

            this.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        initEncrypt: function() {
            var profile = this.profiles.length === 1 ? this.profiles[0] : 'notes-db';
            this._initializeRawData(profile);

            var promises = _.map(this.profiles, _.bind(this._createProfileEncryptionTask, this));

            return _.reduce(promises, Q.when, new Q())
                .then(_.bind(this._resetBackup, this))
                .then(_.bind(this.showBackup, this))
                .then(_.bind(this.redirect, this))
                .fail(this._handleError);
        },

        _initializeRawData: function(profile) {
            this.rawData = {};
            this.rawData[profile] = {
                configs: _.map(this.configs, function(item, key) {
                    return {
                        name: key,
                        value: this._transformConfigValue(key, item)
                    };
                }, this)
            };
        },

        _transformConfigValue: function(key, item) {
            if (key === 'encrypt') return '0';
            if (key === 'encryptBackup') return {};
            if (key === 'appProfiles') return JSON.stringify(item);
            return item;
        },

        _createProfileEncryptionTask: function(profile) {
            return _.bind(function() {
                this.vent.request('change:configs', this.backup);
                return this.vent.request('save:secureKey', this.passwords.old)
                    .then(_.bind(this.encryptProfile, this, { profile: profile }));
            }, this);
        },

        encryptProfile: function(options) {
            options = _.extend({}, this.options, options, { pageSize: 0 });
            this.rawData[options.profile] = this.rawData[options.profile] || {};

            var promises = _.map(this.collectionNames, function(name) {
                return new Q(Radio.request(name, 'fetch', options));
            });

            return Q.all(promises)
                .then(_.bind(this._processCollections, this, options))
                .then(_.bind(this.encrypt, this))
                .then(_.bind(this.saveChanges, this))
                .fail(this._handleError);
        },

        _processCollections: function(options) {
            this.collections = _.filter(arguments, function(collection) {
                this.rawData[options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            }, this);
            this.view.trigger('encrypt:init', this.collections.length);
        },

        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this._disableEncryption();
                return new Q();
            }

            this.vent.request('change:configs', this.configs);
            var promises = _.map(this.collections, _.bind(this._createEncryptionTask, this));

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(_.bind(function() {
                    return _.reduce(promises, Q.when, new Q());
                }, this));
        },

        _disableEncryption: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
        },

        _createEncryptionTask: function(collection) {
            return _.bind(function() {
                return this.vent.request('encrypt:models', collection)
                    .then(_.bind(this.checkEncryption, this, collection));
            }, this);
        },

        checkEncryption: function(collection) {
            if (!collection.length) {
                return new Q();
            }

            var model = collection.at(0);
            return this.vent.request('decrypt:model', model)
                .fail(function(e) {
                    console.error('Encryption error:', e);
                    throw new Error('Error with encryption');
                });
        },

        saveChanges: function() {
            var promises = _.map(this.collections, function(collection) {
                return _.bind(function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                }, this);
            }, this);

            return _.reduce(promises, Q.when, new Q());
        },

        _resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        showBackup: function() {
            var defer = Q.defer();

            this.view = new BackupView({
                data: this.rawData
            });

            this.view.once('confirm:download', this.downloadBackup, this);
            this.view.once('next:step', defer.resolve, defer);
            Radio.request('global', 'region:show', 'brand', this.view);

            return defer.promise;
        },

        downloadBackup: function() {
            Radio.request('importExport', 'export', this.rawData);
        },

        redirect: function() {
            this.vent.request('delete:secureKey');
            Radio.request('uri', 'navigate', '/notes', {
                includeProfile: true,
                trigger: false
            });
            window.location.reload();
        },

        _handleError: function(e) {
            console.error('Error:', e);
        }

    });

    return Controller;
});
```