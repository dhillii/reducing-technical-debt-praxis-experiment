/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/.
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

    /**
     * Builder for sync parameter objects.
     *
     * @class SyncParamsBuilder
     */
    const SyncParamsBuilder = class {
        constructor() {
            this.params = {};
        }
        /**
         * @param {Object} localData
         * @returns {SyncParamsBuilder}
         */
        setLocalData(localData) {
            this.params.localData = localData;
            return this;
        }
        /**
         * @param {Object} remoteData
         * @returns {SyncParamsBuilder}
         */
        setRemoteData(remoteData) {
            this.params.remoteData = remoteData;
            return this;
        }
        /**
         * @param {string} module
         * @returns {SyncParamsBuilder}
         */
        setModule(module) {
            this.params.module = module;
            return this;
        }
        /**
         * @param {Array|string} encryptKeys
         * @returns {SyncParamsBuilder}
         */
        setEncryptKeys(encryptKeys) {
            this.params.encryptKeys = encryptKeys;
            return this;
        }
        /**
         * @returns {Object}
         */
        build() {
            return this.params;
        }
    };

    /**
     * Dropbox synchronizer.
     *
     * Triggers:
     * 1. `auth:success` on `dropbox` channel
     *     - after authentication is completed successfully.
     * 2. `start` on `sync` channel
     *     when synchronizing starts
     * 3. `stop` on `sync` channel
     *     when synchronizing stops
     *
     * Replies:
     * 1. `start` on `sync` channel
     *     starts synchronizing.
     */
    const Sync = Marionette.Object.extend({

        configs  : {
            // Dropbox app key
            key         : '10iirspliqts95d',

            // Interval configs
            interval    : 2000,
            intervalMax : 15000,
            intervalMin : 2000,

            // A state which shows if something is changed remotely
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

            // Replies
            Radio.reply('sync', 'start', this.startSync, this);

            // Listen to Laverna events
            this.listenTo(Radio.channel('notes'), 'sync:model destroy:model restore:model', this.onSave);
            this.listenTo(Radio.channel('notebooks'), 'sync:model destroy:model restore:model', this.onSave);
            this.listenTo(Radio.channel('tags'), 'sync:model destroy:model restore:model', this.onSave);

            // Authorize the app
            const self = this;
            this.checkAuth()
                .then(function(authenticated) {
                    if (authenticated) {
                        return self.onReady();
                    }

                    console.error('Dropbox authentication failed.');
                })
                .catch(function(err) {
                    console.log('Dropbox error', err);
                });
        },

        /**
         * Start synchronizing immediately.
         */
        startSync: function() {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }

            this.timeout = setTimeout(_.bind(function() {
                this.checkChanges();
            }, this), 0);
        },

        /**
         * Check if Dropbox was authenticated.
         */
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

        /**
         * Parse location hash.
         *
         * @returns {Object}
         */
        parseHash: function() {
            const hash = window.location.hash.replace('#', '').split('&');
            const ret  = {};

            if (!hash.length) {
                return ret;
            }

            _.each(hash, function(str) {
                const parts = str.replace(/\+/g, ' ').split('=');

                if (parts.length > 1) {
                    const key  = parts.shift();
                    const val  = parts.length > 0 ? parts.join('=') : undefined;
                    const decoded = undefined ? null : decodeURIComponent(val.trim());
                    ret[key] = decoded;
                }
            });

            return ret;
        },

        authenticate: function() {
            const defer = Q.defer();
            const authUrl = this.client.getAuthenticationUrl(document.location);

            Radio.once('Confirm', 'cancel',  _.bind(defer.reject, defer));
            Radio.once('Confirm', 'confirm', function() {
                window.location = authUrl;
            });

            Radio.request('Confirm', 'start', {
                title  : $.t('dropbox.auth title'),
                content: $.t('dropbox.auth confirm')
            });

            return defer.promise;
        },

        /**
         * Save the access token in configs.
         *
         * @param {String} accessToken
         * @returns {Promise}
         */
        saveAccessToken: function(accessToken) {
            const self = this;
            return Radio.request('configs', 'save:object', {
                name  : 'dropboxAccessToken',
                value : accessToken,
            })
                .then(function() {
                    Radio.request('uri', 'navigate', '/');
                    self.configs.accessToken.accessToken;
                    return true;
                });
        },

        /**
         * Start synchronizing all data after Dropbox client is ready.
         */
        onReady: function() {
            const profile = Radio.request('uri', 'profile') || 'notes-db';
            const self = this;
            adapter.init(this.client, profile);

            this.timeout = window.setTimeout(function() {
                self.checkChanges();
            }, 500);
        },

        /**
         * Check for changes.
         */
        checkChanges: function() {
            const promises = [];
            const self = this;

            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            // Synchronize all collections
            _.each(['notes', 'notebooks', 'tags'], function(module) {
                promises.push(function() {
                    return Q.all([
                        Radio.request(module, 'fetch', {encrypt: true}),
                        adapter.getAll(module)
                    ])
                        .spread(function(localData, remoteData) {
                            const params = new SyncParamsBuilder()
                                .setLocalData(localData)
                                .setRemoteData(remoteData)
                                .setModule(module)
                                .build();
                            return self.syncAll(params);
                        });
                });
            });

            // After synchronizing, start watching for changes
            return _.reduce(promises, Q.when, new Q())
                .then(function() {
                    Radio.trigger('sync', 'stop', 'dropbox');
                    self.startWatch();
                })
                .fail(function(err) {
                    if (err) {
                        switch (err.status) {

                            // If access was revoked, try to ask for it again
                            case 401:
                                self.checkAuth();
                                break;

                            // On connection error, increase watch interval
                            case 0:
                                self.configs.interval = self.configs.intervalMax;
                                self.startWatch();
                                break;
                        }
                    }

                    Radio.trigger('sync', 'stop', 'dropbox');
                    Radio.trigger('sync', 'error', {cloud: 'dropbox', error: err});
                    console.error('Error', arguments[0], arguments);
                });
        },

        /**
         * Synchronize a collection using a parameter object.
         *
         * @param {Object} params - Contains localData, remoteData, module.
         * @returns {Promise}
         */
        syncAll: function(params) {
            const { localData, remoteData, module } = params;
            const encryptKeys = localData.model.prototype.encryptKeys;

            const localJson = (localData.fullCollection || localData).toJSON();

            const remotePromises = this.checkRemoteChanges({
                localData: localJson,
                remoteData,
                module
            });

            const localPromises = this.checkLocalChanges({
                localData: localJson,
                remoteData,
                module,
                encryptKeys
            });

            const allPromises = remotePromises.concat(localPromises);

            return _.reduce(allPromises, Q.when, new Q())
                .then(function() {
                    return Radio.request(module, 'fetch', {encrypt: true});
                });
        },

        /**
         * Backward-compatible wrapper for syncAll.
         *
         * @param {Object} localData
         * @param {Object} remoteData
         * @param {string} module
         * @returns {Promise}
         */
        syncAllLegacy: function(localData, remoteData, module) {
            const params = new SyncParamsBuilder()
                .setLocalData(localData)
                .setRemoteData(remoteData)
                .setModule(module)
                .build();
            return this.syncAll(params);
        },

        /**
         * Save only models which don't exist locally or which were updated remotely.
         *
         * @param {Object} params - Contains localData, remoteData, module.
         * @returns {Array<Function>}
         */
        checkRemoteChanges: function(params) {
            const { localData, remoteData, module } = params;
            const promises = [];
            const newData = _.filter(remoteData, function(rModel) {
                const model = _.findWhere(localData, {id: rModel.id});
                return !model || model.updated < rModel.updated;
            });

            if (newData.length) {
                console.log('Dropbox changes:', newData);
                this.configs.statRemote = true;

                promises.push(function() {
                    return Radio.request(module, 'save:all:raw', newData, {profile: adapter.profile});
                });
            }

            return promises;
        },

        /**
         * Save only models which don't exist on Dropbox or which were updated locally.
         *
         * @param {Object} params - Contains localData, remoteData, module, encryptKeys.
         * @returns {Array<Function>}
         */
        checkLocalChanges: function(params) {
            const { localData, remoteData, module, encryptKeys } = params;
            const promises = [];

            _.each(localData, function(lModel) {
                const model = _.findWhere(remoteData, {id: lModel.id});
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
            if (this.timeout) {
                clearTimeout(this.timeout);
            }

            this.calcInterval();
            console.log('interval is', this.configs.interval);

            this.timeout = setTimeout(_.bind(function() {
                this.checkChanges();
            }, this), this.configs.interval);
        },

        /**
         * Increase or decrease watch interval depending on
         * whether changes appear on Dropbox.
         */
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

        /**
         * Immediately after a model is changed locally, synchronize it with
         * Dropbox.
         *
         * @param {Backbone.Model} model
         * @returns {Promise}
         */
        onSave: function(model) {
            return adapter.save(model.storeName, model.attributes, model.encryptKeys);
        }

    });

    return Sync;
});