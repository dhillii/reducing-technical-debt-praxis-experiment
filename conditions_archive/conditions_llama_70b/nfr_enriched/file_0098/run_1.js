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

        /**
         * Configuration object.
         * @type {Object}
         */
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

        /**
         * Initialize the synchronizer.
         */
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

        /**
         * Start synchronizing immediately.
         */
        startSync: function() {
            this.clearTimeout();
            this.checkChanges();
        },

        /**
         * Check if Dropbox was authenticated.
         * @returns {Promise}
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
         * @returns {Object}
         */
        parseHash: function() {
            const hash = window.location.hash.replace('#', '').split('&');
            const ret = {};

            if (!hash.length) {
                return ret;
            }

            hash.forEach((str) => {
                const parts = str.replace(/\+/g, ' ').split('=');

                if (parts.length > 1) {
                    const key = parts.shift();
                    const val = parts.length > 0 ? parts.join('=') : undefined;
                    ret[key] = val ? decodeURIComponent(val.trim()) : null;
                }
            });

            return ret;
        },

        /**
         * Authenticate with Dropbox.
         * @returns {Promise}
         */
        authenticate: function() {
            const defer = Q.defer();
            const authUrl = this.client.getAuthenticationUrl(document.location);

            Radio.once('Confirm', 'cancel', () => defer.reject());
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
         * @param {String} accessToken
         * @returns {Promise}
         */
        saveAccessToken: function(accessToken) {
            return Radio.request('configs', 'save:object', {
                name: 'dropboxAccessToken',
                value: accessToken,
            })
                .then(() => {
                    Radio.request('uri', 'navigate', '/');
                    return true;
                });
        },

        /**
         * Start synchronizing all data after Dropbox client is ready.
         */
        onReady: function() {
            const profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);

            this.checkChanges();
        },

        /**
         * Check for changes.
         * @returns {Promise}
         */
        checkChanges: function() {
            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            const promises = this.getSynchronizationPromises();

            return Q.all(promises)
                .then(() => {
                    Radio.trigger('sync', 'stop', 'dropbox');
                    this.startWatch();
                })
                .fail((err) => {
                    if (err) {
                        switch (err.status) {
                            case 401:
                                this.checkAuth();
                                break;
                            case 0:
                                this.configs.interval = this.configs.intervalMax;
                                this.startWatch();
                                break;
                        }
                    }

                    Radio.trigger('sync', 'stop', 'dropbox');
                    Radio.trigger('sync', 'error', { cloud: 'dropbox', error: err });
                    console.error('Error', err);
                });
        },

        /**
         * Get synchronization promises for all collections.
         * @returns {Array<Promise>}
         */
        getSynchronizationPromises: function() {
            const promises = [];

            ['notes', 'notebooks', 'tags'].forEach((module) => {
                promises.push(this.syncCollection(module));
            });

            return promises;
        },

        /**
         * Synchronize a collection.
         * @param {String} module
         * @returns {Promise}
         */
        syncCollection: function(module) {
            return Q.all([
                Radio.request(module, 'fetch', { encrypt: true }),
                adapter.getAll(module)
            ])
                .spread((localData, remoteData) => {
                    return this.syncAll(localData, remoteData, module);
                });
        },

        /**
         * Synchronize all data in a collection.
         * @param {Array} localData
         * @param {Array} remoteData
         * @param {String} module
         * @returns {Promise}
         */
        syncAll: function(localData, remoteData, module) {
            const promises = this.checkRemoteChanges(localData, remoteData, module);
            promises.push(...this.checkLocalChanges(localData, remoteData, module));

            return Q.all(promises)
                .then(() => {
                    return Radio.request(module, 'fetch', { encrypt: true });
                });
        },

        /**
         * Check for remote changes in a collection.
         * @param {Array} localData
         * @param {Array} remoteData
         * @param {String} module
         * @returns {Array<Promise>}
         */
        checkRemoteChanges: function(localData, remoteData, module) {
            const promises = [];
            const newData = remoteData.filter((rModel) => {
                const model = localData.find((lModel) => lModel.id === rModel.id);
                return !model || model.updated < rModel.updated;
            });

            if (newData.length) {
                console.log('Dropbox changes:', newData);
                this.configs.statRemote = true;

                promises.push(Radio.request(module, 'save:all:raw', newData, { profile: adapter.profile }));
            }

            return promises;
        },

        /**
         * Check for local changes in a collection.
         * @param {Array} localData
         * @param {Array} remoteData
         * @param {String} module
         * @returns {Array<Promise>}
         */
        checkLocalChanges: function(localData, remoteData, module) {
            const promises = [];

            localData.forEach((lModel) => {
                const model = remoteData.find((rModel) => rModel.id === lModel.id);
                if (model && model.updated >= lModel.updated) {
                    return;
                }

                console.log('Dropbox local changes:', lModel);
                promises.push(adapter.save(module, lModel, lModel.encryptKeys));
            });

            return promises;
        },

        /**
         * Start watching for changes.
         */
        startWatch: function() {
            this.clearTimeout();
            this.calcInterval();
            console.log('interval is', this.configs.interval);

            this.timeout = setTimeout(() => {
                this.checkChanges();
            }, this.configs.interval);
        },

        /**
         * Calculate the watch interval.
         */
        calcInterval: function() {
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
         * Clear the timeout.
         */
        clearTimeout: function() {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }
        },

        /**
         * Immediately after a model is changed locally, synchronize it with
         * Dropbox.
         * @param {Object} model
         * @returns {Promise}
         */
        onSave: function(model) {
            return adapter.save(model.storeName, model.attributes, model.encryptKeys);
        }
    });

    return Sync;
});
```