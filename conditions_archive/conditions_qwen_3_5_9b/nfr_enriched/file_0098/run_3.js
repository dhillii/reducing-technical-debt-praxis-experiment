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
    var Sync = Marionette.Object.extend({

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

        initialize: function() {
            this.configs.key = this.getDropboxKey() || this.configs.key;
            this.configs.accessToken = this.getDropboxAccessToken();

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
                .then(this.onReady.bind(this))
                .catch(this.handleAuthError.bind(this));
        },

        /**
         * Get Dropbox key from configs or use default.
         * @returns {string}
         */
        getDropboxKey: function() {
            return Radio.request('configs', 'get:config', 'dropboxKey');
        },

        /**
         * Get Dropbox access token from configs.
         * @returns {string}
         */
        getDropboxAccessToken: function() {
            return Radio.request('configs', 'get:config', 'dropboxAccessToken');
        },

        /**
         * Handle authentication errors.
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

            this.timeout = setTimeout(this.scheduleCheck.bind(this), 0);
        },

        /**
         * Schedule the check for changes.
         */
        scheduleCheck: function() {
            this.checkChanges();
        },

        /**
         * Check if Dropbox was authenticated.
         * @returns {Promise}
         */
        checkAuth: function() {
            var hash = this.parseHash();

            if (this.hasAccessToken()) {
                this.client.setAccessToken(this.configs.accessToken);
                return Promise.resolve(true);
            }
            else if (hash.hasAccessToken()) {
                return this.saveAccessToken(hash.access_token);
            }
            else {
                if (hash.hasError()) {
                    Radio.request('uri', 'navigate', '/');
                }

                return this.authenticate();
            }
        },

        /**
         * Check if access token is configured.
         * @returns {boolean}
         */
        hasAccessToken: function() {
            return this.configs.accessToken && this.configs.accessToken.length;
        },

        /**
         * Parse location hash.
         *
         * @returns {Object}
         */
        parseHash: function() {
            var hash = window.location.hash.replace('#', '').split('&');
            var ret = {};

            if (!hash.length) {
                return ret;
            }

            _.each(hash, this.parseHashItem.bind(this));

            return ret;
        },

        /**
         * Parse a single hash item.
         * @param {string} str
         * @param {number} index
         * @param {Array} array
         */
        parseHashItem: function(str, index, array) {
            var parts = str.replace(/\+/g, ' ').split('=');

            if (parts.length > 1) {
                var key = parts.shift();
                var val = parts.length > 0 ? parts.join('=') : undefined;
                val = val ? decodeURIComponent(val.trim()) : null;
                ret[key] = val;
            }
        },

        /**
         * Authenticate with Dropbox.
         * @returns {Promise}
         */
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

        /**
         * Save the access token in configs.
         *
         * @param {String} accessToken
         * @returns {Promise}
         */
        saveAccessToken: function(accessToken) {
            var self = this;
            return Radio.request('configs', 'save:object', {
                name: 'dropboxAccessToken',
                value: accessToken,
            })
            .then(function() {
                Radio.request('uri', 'navigate', '/');
                self.configs.accessToken = accessToken;
                return true;
            });
        },

        /**
         * Start synchronizing all data after Dropbox client is ready.
         */
        onReady: function() {
            var profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);

            this.timeout = window.setTimeout(this.scheduleCheck.bind(this), 500);
        },

        /**
         * Check for changes.
         * @returns {Promise}
         */
        checkChanges: function() {
            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            var promises = this.getModulePromises();

            // After synchronizing, start watching for changes
            return this.waitForPromises(promises)
                .then(this.onSyncComplete.bind(this))
                .fail(this.handleSyncError.bind(this));
        },

        /**
         * Get promises for all modules.
         * @returns {Array}
         */
        getModulePromises: function() {
            var promises = [];

            _.each(['notes', 'notebooks', 'tags'], this.addModulePromise.bind(this));

            return promises;
        },

        /**
         * Add a promise for a module.
         * @param {string} module
         * @param {number} index
         * @param {Array} array
         */
        addModulePromise: function(module, index, array) {
            promises.push(this.syncModule.bind(this, module));
        },

        /**
         * Handle sync completion.
         */
        onSyncComplete: function() {
            Radio.trigger('sync', 'stop', 'dropbox');
            this.startWatch();
        },

        /**
         * Handle sync errors.
         * @param {Error} err
         */
        handleSyncError: function(err) {
            if (err) {
                this.handleAuthError(err);
            }

            Radio.trigger('sync', 'stop', 'dropbox');
            Radio.trigger('sync', 'error', {cloud: 'dropbox', error: err});
            console.error('Error', arguments[0], arguments);
        },

        /**
         * Wait for all promises to complete.
         * @param {Array} promises
         * @returns {Promise}
         */
        waitForPromises: function(promises) {
            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Synchronize a collection.
         *
         * @type array localData
         * @type array remoteData
         * @type string module
         * @return promise
         */
        syncModule: function(module) {
            var localData = this.getLocalData(module);
            var remoteData = this.getRemoteData(module);

            return this.syncAll(localData, remoteData, module);
        },

        /**
         * Get local data for a module.
         * @param {string} module
         * @returns {Object}
         */
        getLocalData: function(module) {
            var data = Radio.request(module, 'fetch', {encrypt: true});
            return (data.fullCollection || data).toJSON();
        },

        /**
         * Get remote data for a module.
         * @param {string} module
         * @returns {Object}
         */
        getRemoteData: function(module) {
            return adapter.getAll(module);
        },

        /**
         * Synchronize all changes.
         *
         * @type array localData
         * @type array remoteData
         * @type string module
         * @return promise
         */
        syncAll: function(localData, remoteData, module) {
            var promises = this.getRemoteChangePromises(localData, remoteData, module);
            promises.push.apply(
                promises,
                this.getLocalChangePromises(localData, remoteData, module)
            );

            return this.waitForPromises(promises)
                .then(function() {
                    return Radio.request(module, 'fetch', {encrypt: true});
                });
        },

        /**
         * Get promises for remote changes.
         * @param {Object} localData
         * @param {Object} remoteData
         * @param {string} module
         * @returns {Array}
         */
        getRemoteChangePromises: function(localData, remoteData, module) {
            var promises = [];
            var newData = this.getNewRemoteData(localData, remoteData);

            if (newData.length) {
                this.configs.statRemote = true;
                promises.push(this.saveRemoteData.bind(this, module, newData));
            }

            return promises;
        },

        /**
         * Get new remote data.
         * @param {Object} localData
         * @param {Object} remoteData
         * @returns {Array}
         */
        getNewRemoteData: function(localData, remoteData) {
            return _.filter(remoteData, this.isNewRemoteData.bind(this, localData));
        },

        /**
         * Check if remote data is new.
         * @param {Object} localData
         * @param {Object} rModel
         * @returns {boolean}
         */
        isNewRemoteData: function(localData, rModel) {
            var model = _.findWhere(localData, {id: rModel.id});
            return !model || model.updated < rModel.updated;
        },

        /**
         * Save remote data.
         * @param {string} module
         * @param {Array} newData
         */
        saveRemoteData: function(module, newData) {
            console.log('Dropbox changes:', newData);
            return Radio.request(module, 'save:all:raw', newData, {profile: adapter.profile});
        },

        /**
         * Get promises for local changes.
         * @param {Object} localData
         * @param {Object} remoteData
         * @param {string} module
         * @param {Object} encryptKeys
         * @returns {Array}
         */
        getLocalChangePromises: function(localData, remoteData, module, encryptKeys) {
            var promises = [];

            _.each(localData, this.processLocalData.bind(this, remoteData, module, encryptKeys));

            return promises;
        },

        /**
         * Process local data for changes.
         * @param {Object} remoteData
         * @param {string} module
         * @param {Object} encryptKeys
         * @param {Object} lModel
         * @param {number} index
         * @param {Array} array
         */
        processLocalData: function(remoteData, module, encryptKeys, lModel, index, array) {
            var model = _.findWhere(remoteData, {id: lModel.id});
            if (model && model.updated >= lModel.updated) {
                return;
            }

            console.log('Dropbox local changes:', lModel);
            promises.push(this.saveLocalData.bind(this, module, lModel, encryptKeys));
        },

        /**
         * Save local data.
         * @param {string} module
         * @param {Object} lModel
         * @param {Object} encryptKeys
         */
        saveLocalData: function(module, lModel, encryptKeys) {
            return adapter.save(module, lModel, encryptKeys);
        },

        startWatch: function() {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }

            this.calcInterval();
            console.log('interval is', this.configs.interval);

            this.timeout = setTimeout(this.scheduleCheck.bind(this), this.configs.interval);
        },

        /**
         * Increase or decrease watch interval depending on
         * whether changes appear on Dropbox.
         */
        calcInterval: function() {
            var range = this.configs.intervalMax - this.configs.intervalMin;

            if (this.configs.statRemote) {
                this.configs.interval -= (range * 0.4);
            }
            else {
                this.configs.interval += (range * 0.2);
            }

            this.configs.interval = Math.max(this.configs.intervalMin, this.configs.interval);
            this.configs.interval = Math.min(this.configs.intervalMax, this.configs.interval);
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
```