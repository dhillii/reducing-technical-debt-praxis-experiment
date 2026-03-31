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
    'underscore',
    'jquery',
    'q',
    'backbone',
    'marionette',
    'backbone.radio',
    'dropbox',
    'modules/dropbox/classes/adapter'
], function(_, $, Q, Backbone, Marionette, Radio, Dropbox, adapter) {
    'use strict';

    var DEFAULT_CONFIG = {
        key: '10iirspliqts95d',
        interval: 2000,
        intervalMax: 15000,
        intervalMin: 2000,
        statRemote: false
    };

    var MODULES = ['notes', 'notebooks', 'tags'];
    var HTTP_STATUS = {
        UNAUTHORIZED: 401,
        CONNECTION_ERROR: 0
    };

    var Sync = Marionette.Object.extend({

        configs: _.clone(DEFAULT_CONFIG),

        initialize: function() {
            this._setupConfigs();
            this._setupClient();
            this._setupRadioListeners();
            this._initializeAuth();
        },

        _setupConfigs: function() {
            var dropboxKey = Radio.request('configs', 'get:config', 'dropboxKey');
            this.configs.key = dropboxKey || this.configs.key;
            this.configs.accessToken = Radio.request('configs', 'get:config', 'dropboxAccessToken');
        },

        _setupClient: function() {
            this.client = new Dropbox({
                clientId: this.configs.key
            });
        },

        _setupRadioListeners: function() {
            Radio.reply('sync', 'start', this.startSync, this);

            MODULES.forEach(function(module) {
                this.listenTo(
                    Radio.channel(module),
                    'sync:model destroy:model restore:model',
                    this.onSave
                );
            }, this);
        },

        _initializeAuth: function() {
            this.checkAuth()
                .then(this._handleAuthSuccess.bind(this))
                .catch(this._handleAuthError.bind(this));
        },

        _handleAuthSuccess: function(authenticated) {
            if (authenticated) {
                return this.onReady();
            }
            console.error('Dropbox authentication failed.');
        },

        _handleAuthError: function(err) {
            console.log('Dropbox error', err);
        },

        startSync: function() {
            this._clearTimeout();
            this.timeout = setTimeout(this.checkChanges.bind(this), 0);
        },

        checkAuth: function() {
            if (this.configs.accessToken && this.configs.accessToken.length) {
                this.client.setAccessToken(this.configs.accessToken);
                return Promise.resolve(true);
            }

            var hash = this._parseHash();

            if (hash.access_token && hash.access_token.length) {
                return this.saveAccessToken(hash.access_token);
            }

            if (hash.error) {
                Radio.request('uri', 'navigate', '/');
            }

            return this.authenticate();
        },

        _parseHash: function() {
            var hash = window.location.hash.replace('#', '').split('&');
            var result = {};

            hash.forEach(function(str) {
                var parts = str.replace(/\+/g, ' ').split('=');

                if (parts.length > 1) {
                    var key = parts.shift();
                    var val = parts.join('=');
                    result[key] = decodeURIComponent(val.trim());
                }
            });

            return result;
        },

        authenticate: function() {
            var defer = Q.defer();
            var authUrl = this.client.getAuthenticationUrl(document.location);

            Radio.once('Confirm', 'cancel', defer.reject.bind(defer));
            Radio.once('Confirm', 'confirm', function() {
                window.location = authUrl;
            });

            Radio.request('Confirm', 'start', {
                title: $.t('dropbox.auth title'),
                content: $.t('dropbox.auth confirm')
            });

            return defer.promise;
        },

        saveAccessToken: function(accessToken) {
            return Radio.request('configs', 'save:object', {
                name: 'dropboxAccessToken',
                value: accessToken
            })
            .then(function() {
                Radio.request('uri', 'navigate', '/');
                this.configs.accessToken = accessToken;
                return true;
            }.bind(this));
        },

        onReady: function() {
            var profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);
            this.timeout = window.setTimeout(this.checkChanges.bind(this), 500);
        },

        checkChanges: function() {
            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            var promises = this._createSyncPromises();

            return _.reduce(promises, Q.when, new Q())
                .then(this._handleSyncSuccess.bind(this))
                .catch(this._handleSyncError.bind(this));
        },

        _createSyncPromises: function() {
            return MODULES.map(function(module) {
                return function() {
                    return Q.all([
                        Radio.request(module, 'fetch', {encrypt: true}),
                        adapter.getAll(module)
                    ])
                    .spread(function(localData, remoteData) {
                        return this.syncAll(localData, remoteData, module);
                    }.bind(this));
                }.bind(this);
            }, this);
        },

        _handleSyncSuccess: function() {
            Radio.trigger('sync', 'stop', 'dropbox');
            this.startWatch();
        },

        _handleSyncError: function(err) {
            Radio.trigger('sync', 'stop', 'dropbox');

            if (err && err.status) {
                this._handleSyncErrorByStatus(err.status);
            }

            Radio.trigger('sync', 'error', {cloud: 'dropbox', error: err});
            console.error('Sync error:', err);
        },

        _handleSyncErrorByStatus: function(status) {
            switch (status) {
                case HTTP_STATUS.UNAUTHORIZED:
                    this.checkAuth();
                    break;
                case HTTP_STATUS.CONNECTION_ERROR:
                    this.configs.interval = this.configs.intervalMax;
                    this.startWatch();
                    break;
            }
        },

        syncAll: function(localData, remoteData, module) {
            var encryptKeys = localData.model.prototype.encryptKeys;
            localData = (localData.fullCollection || localData).toJSON();

            var promises = this.checkRemoteChanges(localData, remoteData, module);
            promises.push.apply(
                promises,
                this.checkLocalChanges(localData, remoteData, module, encryptKeys)
            );

            return _.reduce(promises, Q.when, new Q())
                .then(function() {
                    return Radio.request(module, 'fetch', {encrypt: true});
                });
        },

        checkRemoteChanges: function(localData, remoteData, module) {
            var newData = _.filter(remoteData, function(rModel) {
                var model = _.findWhere(localData, {id: rModel.id});
                return !model || model.updated < rModel.updated;
            });

            if (!newData.length) {
                return [];
            }

            console.log('Dropbox changes:', newData);
            this.configs.statRemote = true;

            return [function() {
                return Radio.request(module, 'save:all:raw', newData, {profile: adapter.profile});
            }];
        },

        checkLocalChanges: function(localData, remoteData, module, encryptKeys) {
            var promises = [];

            _.each(localData, function(lModel) {
                var model = _.findWhere(remoteData, {id: lModel.id});
                if (model && model.updated >= lModel.updated) {
                    return;
                }

                console.log('Dropbox local changes:', lModel);
                promises.push(function() {
                    return adapter.save(module, lModel, encryptKeys);
                });
            });

            return promises;
        },

        startWatch: function() {
            this._clearTimeout();
            this._updateInterval();
            this.timeout = setTimeout(this.checkChanges.bind(this), this.configs.interval);
        },

        _updateInterval: function() {
            var range = this.configs.intervalMax - this.configs.intervalMin;

            if (this.configs.statRemote) {
                this.configs.interval -= (range * 0.4);
            } else {
                this.configs.interval += (range * 0.2);
            }

            this.configs.interval = Math.max(this.configs.intervalMin, this.configs.interval);
            this.configs.interval = Math.min(this.configs.intervalMax, this.configs.interval);
        },

        onSave: function(model) {
            return adapter.save(model.storeName, model.attributes, model.encryptKeys);
        },

        _clearTimeout: function() {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }
        }

    });

    return Sync;
});
```