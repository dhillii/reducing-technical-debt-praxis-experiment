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
    var Sync = Marionette.Object.extend({

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
            this.checkAuth()
            .then(this.handleAuthResult.bind(this))
            .catch(this.handleAuthError.bind(this));
        },

        /**
         * Handle authentication result.
         *
         * @param {Boolean} authenticated
         */
        handleAuthResult: function(authenticated) {
            if (authenticated) {
                return this.onReady();
            }

            console.error('Dropbox authentication failed.');
        },

        /**
         * Handle authentication errors.
         *
         * @param {Error} err
         */
        handleAuthError: function(err) {
            console.log('Dropbox error', err);
        },

        /**
         * Start synchronizing immediately.
         */
        startSync: function() {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }

            this.timeout = setTimeout(() => this.checkChanges(), 0);
        },

        /**
         * Check if Dropbox was authenticated.
         */
        checkAuth: function() {
            const hash = this.parseHash();

            if (this.configs.accessToken && this.configs.accessToken.length) {
                this.client.setAccessToken(this.configs.accessToken);
                return Promise.resolve(true);
            }
            else if (hash.access_token && hash.access_token.length) {
                return this.saveAccessToken(hash.access_token);
            }
            else {
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

            hash.forEach(str => {
                const parts = str.replace(/\+/g, ' ').split('=');
                if (parts.length > 1) {
                    const key = parts.shift();
                    const val = parts.length > 0 ? parts.join('=') : undefined;
                    ret[key] = val === undefined ? null : decodeURIComponent(val.trim());
                }
            });

            return ret;
        },

        /**
         * Authenticate with Dropbox.
         *
         * @returns {Promise}
         */
        authenticate: function() {
            const defer = Q.defer();
            const authUrl = this.client.getAuthenticationUrl(document.location);

            Radio.once('Confirm', 'cancel',  defer.reject.bind(defer));
            Radio.once('Confirm', 'confirm', () => window.location = authUrl);

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

        /**
         * Initialize Dropbox adapter and schedule first sync.
         */
        onReady: function() {
            const profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);

            this.timeout = window.setTimeout(() => this.checkChanges(), 500);
        },

        /**
         * Check for changes across collections.
         */
        checkChanges: function() {
            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            const modules = ['notes', 'notebooks', 'tags'];
            const promises = modules.map(module => this synchronizationModule.bind(this, module));

            this.runSequentially(promises)
            .then(() => {
                Radio.trigger('sync', 'stop', 'dropbox');
                this.startWatch();
            })
            .catch(err => this.handleSyncError(err));
        },

        /**
         * Execute promises sequentially.
         *
         * @param {Array<Function>} functions - Functions returning promises
         * @returns {Promise}
         */
        runSequentially: function(functions) {
            return functions.reduce((prev, curr) => {
                return prev.then(() => curr());
            }, Q());
        },

        /**
         * Synchronize one module's collections.
         *
         * @param {String} module
         * @returns {Promise}
         */
        synchronizationModule: function(module) {
            return Q.all([
                Radio.request(module, 'fetch', {encrypt: true}),
                adapter.getAll(module)
            ])
            .spread((localData, remoteData) => this.syncAll(localData, remoteData, module));
        },

        /**
         * Synchronize a collection.
         *
         * @type array localData
         * @type array remoteData
         * @type string module
         * @return promise
         */
        syncAll: function(localData, remoteData, module) {
            const encryptKeys = localData.model.prototype.encryptKeys;
            localData = (localData.fullCollection || localData).toJSON();

            const remotePromises = this.checkRemoteChanges(localData, remoteData, module);
            const localPromises  = this.checkLocalChanges(localData, remoteData, module, encryptKeys);
            const allPromises    = remotePromises.concat(localPromises);

            return this.runSequentially(allPromises)
            .then(() => Radio.request(module, 'fetch', {encrypt: true}));
        },

        /**
         * Save only models which don't exist locally or were updated remotely.
         */
        checkRemoteChanges: function(localData, remoteData, module) {
            const newData = remoteData.filter(rModel => {
                const model = _.findWhere(localData, {id: rModel.id});
                return !model || model.updated < rModel.updated;
            });

            if (!newData.length) {
                return [];
            }

            console.log('Dropbox changes:', newData);
            this.configs.statRemote = true;

            return [() => Radio.request(module, 'save:all:raw', newData, {profile: adapter.profile})];
        },

        /**
         * Save only models which don't exist on Dropbox or were updated locally.
         */
        checkLocalChanges: function(localData, remoteData, module, encryptKeys) {
            const promises = [];

            localData.forEach(lModel => {
                const model = _.findWhere(remoteData, {id: lModel.id});
                if (model && model.updated >= lModel.updated) {
                    return;
                }

                console.log('Dropbox local changes:', lModel);
                promises.push(() => adapter.save(module, lModel, encryptKeys));
            });

            return promises;
        },

        /**
         * Schedule next sync interval.
         */
        startWatch: function() {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }

            this.calcInterval();
            console.log('interval is', this.configs.interval);

            this.timeout = setTimeout(() => this.checkChanges(), this.configs.interval);
        },

        /**
         * Calculate next interval based on last sync status.
         */
        calcInterval: function() {
            const range = this.configs.intervalMax - this.configs.intervalMin;

            if (this.configs.statRemote) {
                this.configs.interval -= (range * 0.4);
            }
            else {
                this.configs.interval += (range * 0.2);
            }

            this.configs.interval = Math.min(
                Math.max(this.configs.intervalMin, this.configs.interval),
                this.configs.intervalMax
            );
        },

        /**
         * Handle sync errors.
         *
         * @param {Error} err
         */
        handleSyncError: function(err) {
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
            Radio.trigger('sync', 'error', {cloud: 'dropbox', error: err});
            console.error('Error', arguments[0], arguments);
        },

        /**
         * Immediately after a model is changed locally, synchronize it with
         * Dropbox.
         */
        onSave: function(model) {
            return adapter.save(model.storeName, model.attributes, model.encryptKeys);
        }

    });

    return Sync;
});