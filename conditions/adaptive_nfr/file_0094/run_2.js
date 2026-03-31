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
            _.bindAll(this, 'saveChanges', 'encrypt', 'redirect', 'show', 'encryptProfile', 'showBackup');

            this.options = options;
            this.vent = Radio.channel('encrypt');
            this.configs = Radio.request('configs', 'get:object');
            this.backup = _.extend({}, this.configs, this.configs.encryptBackup);

            this.vent.request('delete:secureKey');

            Radio.request('configs', 'get:profiles')
                .then(this.show)
                .fail(this._handleError);

            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
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
            var self = this;
            var promises = [];

            data = this._normalizePasswordData(data);

            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }

            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }

            return Q.all(promises)
                .then(function(results) {
                    return self._validatePasswordResults(results, data);
                });
        },

        _normalizePasswordData: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
            return data;
        },

        _validatePasswordResults: function(results, data) {
            if (!results.length || _.indexOf(results, false) > -1) {
                this.view.trigger('password:invalid', results);
                return;
            }

            this.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        initEncrypt: function() {
            var self = this;
            var profile = this.profiles.length === 1 ? this.profiles[0] : 'notes-db';

            this._initializeRawData(profile);

            var promises = _.map(this.profiles, function(profile) {
                return function() {
                    return self._encryptProfileWithBackup(profile);
                };
            });

            return _.reduce(promises, Q.when, new Q())
                .then(_.bind(this.resetBackup, this))
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
            if (key === 'encrypt') {
                return '0';
            }
            if (key === 'encryptBackup') {
                return {};
            }
            if (key === 'appProfiles') {
                return JSON.stringify(item);
            }
            return item;
        },

        _encryptProfileWithBackup: function(profile) {
            var self = this;

            this.vent.request('change:configs', this.backup);

            return this.vent.request('save:secureKey', this.passwords.old)
                .then(function() {
                    return self.encryptProfile({ profile: profile });
                });
        },

        encryptProfile: function(options) {
            var self = this;
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            var promises = _.map(this.collectionNames, function(name) {
                return new Q(Radio.request(name, 'fetch', options));
            });

            return Q.all(promises)
                .spread(function() {
                    return self._processCollections(arguments, options);
                })
                .then(_.bind(this.encrypt, this))
                .then(_.bind(this.saveChanges, this));
        },

        _processCollections: function(collections, options) {
            var self = this;

            this.collections = _.filter(collections, function(collection) {
                self.rawData[options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });

            this.view.trigger('encrypt:init', this.collections.length);
        },

        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                return this._disableEncryption();
            }

            return this._performEncryption();
        },

        _disableEncryption: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
        },

        _performEncryption: function() {
            var self = this;

            this.vent.request('change:configs', this.configs);

            var promises = _.map(this.collections, function(collection) {
                return function() {
                    return self.vent.request('encrypt:models', collection)
                        .then(function() {
                            return self.checkEncryption(collection);
                        });
                };
            });

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(function() {
                    return _.reduce(promises, Q.when, new Q());
                });
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
                return function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                };
            });

            return _.reduce(promises, Q.when, new Q());
        },

        resetBackup: function() {
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