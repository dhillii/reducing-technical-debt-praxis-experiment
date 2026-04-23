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

        configs  : {
            key         : '10iirspliqts95d',
            interval    : 2000,
            intervalMax : 15000,
            intervalMin : 2000,
            statRemote  : false
        },

        initialize: function() {
            const key = Radio.request('configs', 'get:config', 'dropboxKey');
            this.configs.key = key || this.configs.key;
            this.configs.accessToken = Radio.request('configs', 'get:config', 'dropboxAccessToken');

            this.vent = Radio.channel('dropbox');

            this.client = new Dropbox({
                clientId: this.configs.key
            });

            Radio.reply('sync', 'start', this.startSync, this);

            this.listenTo(Radio.channel('notes'), 'sync:model destroy:model restore:model', this.onSave);
            this.listenTo(Radio.channel('notebooks'), 'sync:model destroy:model restore:model', this.onSave);
            this.listenTo(Radio.channel('tags'), 'sync:model destroy:model restore:model', this.onSave);

            this.checkAuth()
                .then((authenticated) => {
                    if (authenticated) {
                        return this.onReady();
                    }
                    console.error('Dropbox authentication failed.');
                })
                .catch((err) => {
                    console.log('Dropbox error', err);
                });
        },

        startSync: function() {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }
            this.timeout = setTimeout(() => this.checkChanges(), 0);
        },

        checkAuth: function() {
            const hash = this.parseHash();

            if (this.configs.accessToken && this.configs.accessToken.length) {
                this.client.setAccessToken(this.configs.accessToken);
                return Promise.resolve(true);
            } else if (hash.access_token && hash.access_token.length) {
                return this.saveAccessToken(hash.access_token);
            } else {
                if (hash.error) {
                    Radio.request('uri', 'navigate', '/');
                }
                return this.authenticate();
            }
        },

        parseHash: function() {
            const hash = window.location.hash.replace('#', '').split('&');
            const ret  = {};

            if (!hash.length) {
                return ret;
            }

            hash.forEach((str) => {
                const parts = str.replace(/\+/g, ' ').split('=');
                if (parts.length > 1) {
                    const key  = parts.shift();
                    const val  = parts.length > 0 ? parts.join('=') : undefined;
                    const decoded = val ? decodeURIComponent(val.trim()) : null;
                    ret[key] = decoded;
                }
            });

            return ret;
        },

        authenticate: function() {
            const defer = Q.defer();
            const authUrl = this.client.getAuthenticationUrl(document.location);

            Radio.once('Confirm', 'cancel', defer.reject.bind(defer));
            Radio.once('Confirm', 'confirm', () => {
                window.location = authUrl;
            });

            Radio.request('Confirm', 'start', {
                title  : $.t('dropbox.auth title'),
                content: $.t('dropbox.auth confirm')
            });

            return defer.promise;
        },

        saveAccessToken: function(accessToken) {
            return Radio.request('configs', 'save:object', {
                name  : 'dropboxAccessToken',
                value : accessToken,
            })
            .then(() => {
                Radio.request('uri', 'navigate', '/');
                this.configs.accessToken = accessToken;
                return true;
            });
        },

        onReady: function() {
            const profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);

            this.timeout = window.setTimeout(() => this.checkChanges(), 500);
        },

        checkChanges: function() {
            const promises = [];
            const self = this;

            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            ['notes', 'notebooks', 'tags'].forEach((module) => {
                promises.push(() => {
                    return Q.all([
                        Radio.request(module, 'fetch', {encrypt: true}),
                        adapter.getAll(module)
                    ])
                    .spread((localData, remoteData) => {
                        return self.syncAll(localData, remoteData, module);
                    });
                });
            });

            return _.reduce(promises, Q.when, new Q())
                .then(() => {
                    Radio.trigger('sync', 'stop', 'dropbox');
                    self.startWatch();
                })
                .fail((err) => {
                    if (err) {
                        switch (err.status) {
                            case 401:
                                self.checkAuth();
                                break;
                            case 0:
                                self.configs.interval = self.configs.intervalMax;
                                self.startWatch();
                                break;
                        }
                    }
                    Radio.trigger('sync', 'stop', 'dropbox');
                    Radio.trigger('sync', 'error', {cloud: 'dropbox', error: err});
                    console.error('Error', err, arguments);
                });
        },

        syncAll: function(localData, remoteData, module) {
            let promises;
            const encryptKeys = localData.model.prototype.encryptKeys;

            localData = (localData.fullCollection || localData).toJSON();

            promises = this.checkRemoteChanges(localData, remoteData, module);
            promises.push(...this.checkLocalChanges(localData, remoteData, module, encryptKeys));

            return _.reduce(promises, Q.when, new Q())
                .then(() => Radio.request(module, 'fetch', {encrypt: true}));
        },

        checkRemoteChanges: function(localData, remoteData, module) {
            const promises = [];
            const newData = _.filter(remoteData, (rModel) => {
                const model = _.findWhere(localData, {id: rModel.id});
                return !model || model.updated < rModel.updated;
            });

            if (newData.length) {
                console.log('Dropbox changes:', newData);
                this.configs.statRemote = true;

                promises.push(() => {
                    return Radio.request(module, 'save:all:raw', newData, {profile: adapter.profile});
                });
            }

            return promises;
        },

        checkLocalChanges: function(localData, remoteData, module, encryptKeys) {
            const promises = [];

            localData.forEach((lModel) => {
                const model = _.findWhere(remoteData, {id: lModel.id});
                if (model && model.updated >= lModel.updated) {
                    return;
                }
                console.log('Dropbox local changes:', lModel);
                promises.push(() => adapter.save(module, lModel, encryptKeys));
            });

            return promises;
        },

        startWatch: function() {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }

            this.calcInterval();
            console.log('interval is', this.configs.interval);

            this.timeout = setTimeout(() => this.checkChanges(), this.configs.interval);
        },

        calcInterval: function() {
            const range = this.configs.intervalMax - this.configs.intervalMin;

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
        }

    });

    return Sync;
});