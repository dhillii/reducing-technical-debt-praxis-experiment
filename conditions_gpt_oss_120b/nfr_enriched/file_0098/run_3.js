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
     */
    const Sync = Marionette.Object.extend({

        configs: {
            key: '10iirspliqts95d',
            interval: 2000,
            intervalMax: 15000,
            intervalMin: 2000,
            statRemote: false
        },

        initialize: function () {
            const key = Radio.request('configs', 'get:config', 'dropboxKey');
            this.configs.key = key || this.configs.key;
            this.configs.accessToken = Radio.request('configs', 'get:config', 'dropboxAccessToken');

            this.vent = Radio.channel('dropbox');

            this.client = new Dropbox({ clientId: this.configs.key });

            Radio.reply('sync', 'start', this.startSync, this);

            this.listenTo(Radio.channel('notes'), 'sync:model destroy:model restore:model', this.onSave);
            this.listenTo(Radio.channel('notebooks'), 'sync:model destroy:model restore:model', this.onSave);
            this.listenTo(Radio.channel('tags'), 'sync:model destroy:model restore:model', this.onSave);

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
         * Verify Dropbox authentication status.
         * @returns {Promise<boolean>}
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

            return this.handleUnauthenticated(hash);
        },

        /**
         * Handle unauthenticated state (error or start auth flow).
         * @param {Object} hash
         * @returns {Promise}
         */
        handleUnauthenticated: function (hash) {
            if (hash.error) {
                Radio.request('uri', 'navigate', '/');
            }
            return this.authenticate();
        },

        /**
         * Parse location hash into an object.
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
         * @param {String} accessToken
         * @returns {Promise<boolean>}
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
         * Initialize adapter and start initial sync.
         */
        onReady: function () {
            const profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);

            this.timeout = window.setTimeout(() => this.checkChanges(), 500);
        },

        /**
         * Perform a full synchronization cycle.
         */
        checkChanges: function () {
            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            const syncPromises = this.buildSyncPromises();

            _.reduce(syncPromises, Q.when, new Q())
                .then(() => {
                    Radio.trigger('sync', 'stop', 'dropbox');
                    this.startWatch();
                })
                .fail(err => this.handleSyncError(err));
        },

        /**
         * Build an array of functions that return promises for each module sync.
         * @returns {Array<Function>}
         */
        buildSyncPromises: function () {
            const modules = ['notes', 'notebooks', 'tags'];
            return _.map(modules, module => {
                return () => Q.all([
                    Radio.request(module, 'fetch', { encrypt: true }),
                    adapter.getAll(module)
                ])
                    .spread((localData, remoteData) => this.syncAll(localData, remoteData, module));
            });
        },

        /**
         * Handle errors occurring during synchronization.
         * @param {Object} err
         */
        handleSyncError: function (err) {
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
        },

        /**
         * Synchronize a collection between local and remote data.
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

            return _.reduce(allPromises, Q.when, new Q())
                .then(() => Radio.request(module, 'fetch', { encrypt: true }));
        },

        /**
         * Generate promises for remote changes that need to be applied locally.
         * @param {Array} localData
         * @param {Array} remoteData
         * @param {String} module
         * @returns {Array<Function>}
         */
        checkRemoteChanges: function (localData, remoteData, module) {
            const newData = _.filter(remoteData, rModel => {
                const model = _.findWhere(localData, { id: rModel.id });
                return !model || model.updated < rModel.updated;
            });

            if (!newData.length) {
                return [];
            }

            console.log('Dropbox changes:', newData);
            this.configs.statRemote = true;

            return [() => Radio.request(module, 'save:all:raw', newData, { profile: adapter.profile })];
        },

        /**
         * Generate promises for local changes that need to be uploaded to Dropbox.
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

        /**
         * Schedule the next watch cycle.
         */
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
         * Immediately sync a locally changed model to Dropbox.
         * @param {Backbone.Model} model
         * @returns {Promise}
         */
        onSave: function (model) {
            return adapter.save(model.storeName, model.attributes, model.encryptKeys);
        }

    });

    return Sync;
});