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

    var Sync = Marionette.Object.extend({

        configs: {
            key: '10iirspliqts95d',
            interval: 2000,
            intervalMax: 15000,
            intervalMin: 2000,
            statRemote: false
        },

        initialize: function() {
            this._initializeConfigs();
            this._initializeClient();
            this._setupRadioReplies();
            this._setupEventListeners();
            this._authenticateAndStart();
        },

        _initializeConfigs: function() {
            var key = Radio.request('configs', 'get:config', 'dropboxKey');
            this.configs.key = key || this.configs.key;
            this.configs.accessToken = Radio.request('configs', 'get:config', 'dropboxAccessToken');
        },

        _initializeClient: function() {
            this.vent = Radio.channel('dropbox');
            this.client = new Dropbox({
                clientId: this.configs.key
            });
        },

        _setupRadioReplies: function() {
            Radio.reply('sync', 'start', this.startSync, this);
        },

        _setupEventListeners: function() {
            var modules = ['notes', 'notebooks', 'tags'];
            var events = 'sync:model destroy:model restore:model';

            _.each(modules, function(module) {
                this.listenTo(Radio.channel(module), events, this.onSave);
            }, this);
        },

        _authenticateAndStart: function() {
            this.checkAuth()
                .then(_.bind(this._handleAuthSuccess, this))
                .catch(_.bind(this._handleAuthError, this));
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
            this.timeout = setTimeout(_.bind(this.checkChanges, this), 0);
        },

        checkAuth: function() {
            var hash = this.parseHash();

            if (this.configs.accessToken && this.configs.accessToken.length) {
                this.client.setAccessToken(this.configs.accessToken);
                return Promise.resolve(true);
            }

            if (hash.access_token && hash.access_token.length) {
                return this.saveAccessToken(hash.access_token);
            }

            if (hash.error) {
                Radio.request('uri', 'navigate', '/');
            }

            return this.authenticate();
        },

        parseHash: function() {
            var hash = window.location.hash.replace('#', '').split('&');
            var ret = {};

            _.each(hash, function(str) {
                var parts = str.replace(/\+/g, ' ').split('=');

                if (parts.length > 1) {
                    var key = parts.shift();
                    var val = parts.length > 0 ? decodeURIComponent(parts.join('=').trim()) : null;
                    ret[key] = val;
                }
            });

            return ret;
        },

        authenticate: function() {
            var defer = Q.defer();
            var authUrl = this.client.getAuthenticationUrl(document.location);

            Radio.once('Confirm', 'cancel', _.bind(defer.reject, defer));
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
            .then(_.bind(function() {
                Radio.request('uri', 'navigate', '/');
                this.configs.accessToken = accessToken;
                return true;
            }, this));
        },

        onReady: function() {
            var profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);
            this.timeout = window.setTimeout(_.bind(this.checkChanges, this), 500);
        },

        checkChanges: function() {
            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            var promises = this._buildSyncPromises();

            return _.reduce(promises, Q.when, new Q())
                .then(_.bind(this._handleSyncSuccess, this))
                .fail(_.bind(this._handleSyncError, this));
        },

        _buildSyncPromises: function() {
            var modules = ['notes', 'notebooks', 'tags'];
            return _.map(modules, function(module) {
                return _.bind(function() {
                    return Q.all([
                        Radio.request(module, 'fetch', {encrypt: true}),
                        adapter.getAll(module)
                    ])
                    .spread(_.bind(function(localData, remoteData) {
                        return this.syncAll(localData, remoteData, module);
                    }, this));
                }, this);
            }, this);
        },

        _handleSyncSuccess: function() {
            Radio.trigger('sync', 'stop', 'dropbox');
            this.startWatch();
        },

        _handleSyncError: function(err) {
            if (err) {
                this._handleSyncErrorByStatus(err.status);
            }

            Radio.trigger('sync', 'stop', 'dropbox');
            Radio.trigger('sync', 'error', {cloud: 'dropbox', error: err});
            console.error('Sync error:', err);
        },

        _handleSyncErrorByStatus: function(status) {
            switch (status) {
                case 401:
                    this.checkAuth();
                    break;
                case 0:
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

            return [_.bind(function() {
                return Radio.request(module, 'save:all:raw', newData, {profile: adapter.profile});
            }, this)];
        },

        checkLocalChanges: function(localData, remoteData, module, encryptKeys) {
            var promises = [];

            _.each(localData, function(lModel) {
                var model = _.findWhere(remoteData, {id: lModel.id});
                if (model && model.updated >= lModel.updated) {
                    return;
                }

                console.log('Dropbox local changes:', lModel);
                promises.push(_.bind(function() {
                    return adapter.save(module, lModel, encryptKeys);
                }, this));
            }, this);

            return promises;
        },

        startWatch: function() {
            this._clearTimeout();
            this.calcInterval();
            console.log('interval is', this.configs.interval);
            this.timeout = setTimeout(_.bind(this.checkChanges, this), this.configs.interval);
        },

        calcInterval: function() {
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