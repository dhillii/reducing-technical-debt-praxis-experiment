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

        configs: {
            // Dropbox app key
            key: '10iirspliqts95d',

            // Interval configs
            interval: 2000,
            intervalMax: 15000,
            intervalMin: 2000,

            // A state which shows if something is changed remotely
            statRemote: false
        },

        initialize: function () {
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
            this.checkAuth()
                .then(authenticated => {
                    if (authenticated) {
                        return this.onReady();
                    }
                    console.error('Dropbox authentication failed.');
                })
                .catch(err => {
                    console.log('Dropbox error', err);
                });
        },

        /**
         * Start synchronizing immediately.
         */
        startSync: function () {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }
            this.timeout = setTimeout(() => this.checkChanges(), 0);
        },

        /**
         * Check if Dropbox was authenticated.
         */
        checkAuth: function () {
            const hash = this.parseHash();

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

        /**
         * Parse location hash.
         *
         * @returns {Object}
         */
        parseHash: function () {
            const hashParts = window.location.hash.replace('#', '').split('&');
            const result = {};

            if (!hashParts.length) {
                return result;
            }

            _.each(hashParts, str => {
                const parts = str.replace(/\+/g, ' ').split('=');
                if (parts.length > 1) {
                    const key = parts.shift();
                    let val = parts.length > 0 ? parts.join('=') : undefined;
                    val = undefined ? null : decodeURIComponent(val.trim());
                    result[key] = val;
                }
            });

            return result;
        },

        authenticate: function () {
            const defer = Q.defer();
            const authUrl = this.client.getAuthenticationUrl(document.location);

            Radio.once('Confirm', 'cancel', defer.reject);
            Radio.once('Confirm', 'confirm', () => {
                window.location = authUrl;
            });

            Radio.request('Confirm', 'start', {
                title: $.t('dropbox.auth title'),
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
        saveAccessToken: function (accessToken) {
            return Radio.request('configs', 'save:object', {
                name: 'dropboxAccessToken',
                value: accessToken,
            })
                .then(() => {
                    Radio.request('uri', 'navigate', '/');
                    this.configs.accessToken = accessToken;
                    return true;
                });
        },

        /**
         * Start synchronizing all data after Dropbox client is ready.
         */
        onReady: function () {
            const profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);

            this.timeout = window.setTimeout(() => this.checkChanges(), 500);
        },

        /**
         * Check for changes across all modules.
         */
        checkChanges: function () {
            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            const modules = ['notes', 'notebooks', 'tags'];
            const syncChain = modules.reduce((chain, module) => {
                return chain.then(() => this.syncModule(module));
            }, Q());

            return syncChain
                .then(() => {
                    Radio.trigger('sync', 'stop', 'dropbox');
                    this.startWatch();
                })
                .catch(err => this.handleSyncError(err));
        },

        /**
         * Synchronize a single module (notes, notebooks, tags).
         *
         * @param {String} module
         * @returns {Promise}
         */
        syncModule: function (module) {
            return Q.all([
                Radio.request(module, 'fetch', { encrypt: true }),
                adapter.getAll(module)
            ])
                .spread((localData, remoteData) => this.syncAll(localData, remoteData, module));
        },

        /**
         * Centralised error handling for checkChanges.
         *
         * @param {Object} err
         */
        handleSyncError: function (err) {
            if (err) {
                if (err.status === 401) {
                    this.checkAuth();
                } else if (err.status === 0) {
                    this.configs.interval = this.configs.intervalMax;
                    this.startWatch();
                }
            }

            Radio.trigger('sync', 'stop', 'dropbox');
            Radio.trigger('sync', 'error', { cloud: 'dropbox', error: err });
            console.error('Error', err);
        },

        /**
         * Synchronize a collection.
         *
         * @param {Backbone.Collection} localData
         * @param {Array} remoteData
         * @param {String} module
         * @returns {Promise}
         */
        syncAll: function (localData, remoteData, module) {
            const encryptKeys = localData.model.prototype.encryptKeys;
            const localJson = (localData.fullCollection || localData).toJSON();

            const remotePromises = this.checkRemoteChanges(localJson, remoteData, module);
            const localPromises = this.checkLocalChanges(localJson, remoteData, module, encryptKeys);

            const allPromises = remotePromises.concat(localPromises);
            return allPromises.reduce((chain, fn) => chain.then(fn), Q())
                .then(() => Radio.request(module, 'fetch', { encrypt: true }));
        },

        /**
         * Save only models which don't exist locally or which were updated remotely.
         *
         * @param {Array} localData
         * @param {Array} remoteData
         * @param {String} module
         * @returns {Array<Function>}
         */
        checkRemoteChanges: function (localData, remoteData, module) {
            const newData = _.filter(remoteData, rModel => {
                const localModel = _.findWhere(localData, { id: rModel.id });
                return !localModel || localModel.updated < rModel.updated;
            });

            if (!newData.length) {
                return [];
            }

            console.log('Dropbox changes:', newData);
            this.configs.statRemote = true;

            return [() => Radio.request(module, 'save:all:raw', newData, { profile: adapter.profile })];
        },

        /**
         * Save only models which don't exist on Dropbox or which were updated locally.
         *
         * @param {Array} localData
         * @param {Array} remoteData
         * @param {String} module
         * @param {Array} encryptKeys
         * @returns {Array<Function>}
         */
        checkLocalChanges: function (localData, remoteData, module, encryptKeys) {
            const promises = [];

            _.each(localData, lModel => {
                const remoteModel = _.findWhere(remoteData, { id: lModel.id });
                if (remoteModel && remoteModel.updated >= lModel.updated) {
                    return;
                }

                console.log('Dropbox local changes:', lModel);
                promises.push(() => adapter.save(module, lModel, encryptKeys));
            });

            return promises;
        },

        startWatch: function () {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }

            this.calcInterval();
            console.log('interval is', this.configs.interval);

            this.timeout = setTimeout(() => this.checkChanges(), this.configs.interval);
        },

        /**
         * Adjust watch interval based on recent remote activity.
         */
        calcInterval: function () {
            const range = this.configs.intervalMax - this.configs.intervalMin;

            if (this.configs.statRemote) {
                this.configs.interval -= range * 0.4;
            } else {
                this.configs.interval += range * 0.2;
            }

            this.configs.interval = Math.max(this.configs.intervalMin, this.configs.interval);
            this.configs.interval = Math.min(this.configs.intervalMax, this.configs.interval);
        },

        /**
         * Immediately after a model is changed locally, synchronize it with Dropbox.
         *
         * @param {Backbone.Model} model
         * @returns {Promise}
         */
        onSave: function (model) {
            return adapter.save(model.storeName, model.attributes, model.encryptKeys);
        }

    });

    return Sync;
});