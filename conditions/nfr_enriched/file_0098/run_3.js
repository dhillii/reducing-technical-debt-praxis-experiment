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
            key: '10iirspliqts95d',
            interval: 2000,
            intervalMax: 15000,
            intervalMin: 2000,
            statRemote: false
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

            this.initializeAuth();
        },

        /**
         * Initialize authentication flow.
         */
        initializeAuth: function() {
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
        parseHash: function() {
            const hash = window.location.hash.replace('#', '').split('&');
            const ret = {};

            if (!hash.length) {
                return ret;
            }

            _.each(hash, (str) => {
                const parts = str.replace(/\+/g, ' ').split('=');

                if (parts.length > 1) {
                    const key = parts.shift();
                    const val = parts.length > 0 ? parts.join('=') : undefined;
                    const decodedVal = val === undefined ? null : decodeURIComponent(val.trim());
                    ret[key] = decodedVal;
                }
            });

            return ret;
        },

        /**
         * Authenticate with Dropbox.
         */
        authenticate: function() {
            const defer = Q.defer();
            const authUrl = this.client.getAuthenticationUrl(document.location);

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

        /**
         * Save the access token in configs.
         *
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
                    this.configs.accessToken = accessToken;
                    return true;
                });
        },

        /**
         * Start synchronizing all data after Dropbox client is ready.
         */
        onReady: function() {
            const profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);

            this.timeout = window.setTimeout(() => {
                this.checkChanges();
            }, 500);
        },

        /**
         * Check for changes.
         */
        checkChanges: function() {
            const promises = [];

            this.configs.statRemote = false;
            Radio.trigger('sync', 'start', 'dropbox');

            _.each(['notes', 'notebooks', 'tags'], (module) => {
                promises.push(() => {
                    return Q.all([
                        Radio.request(module, 'fetch', {encrypt: true}),
                        adapter.getAll(module)
                    ])
                        .spread((localData, remoteData) => {
                            return this.syncAll(localData, remoteData, module);
                        });
                });
            });

            return _.reduce(promises, Q.when, new Q())
                .then(() => {
                    Radio.trigger('sync', 'stop', 'dropbox');
                    this.startWatch();
                })
                .fail((err) => {
                    this.handleSyncError(err);
                });
        },

        /**
         * Handle synchronization errors.
         */
        handleSyncError: function(err) {
            if (err) {
                this.handleErrorByStatus(err.status);
            }

            Radio.trigger('sync', 'stop', 'dropbox');
            Radio.trigger('sync', 'error', {cloud: 'dropbox', error: err});
            console.error('Error', arguments[0], arguments);
        },

        /**
         * Handle error based on HTTP status code.
         */
        handleErrorByStatus: function(status) {
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

        /**
         * Synchronize a collection.
         *
         * @param {Array} localData
         * @param {Array} remoteData
         * @param {String} module
         * @returns {Promise}
         */
        syncAll: function(localData, remoteData, module) {
            const encryptKeys = localData.model.prototype.encryptKeys;
            const jsonLocalData = (localData.fullCollection || localData).toJSON();

            const promises = this.checkRemoteChanges(jsonLocalData, remoteData, module);
            promises.push.apply(
                promises,
                this.checkLocalChanges(jsonLocalData, remoteData, module, encryptKeys)
            );

            return _.reduce(promises, Q.when, new Q())
                .then(() => {
                    return Radio.request(module, 'fetch', {encrypt: true});
                });
        },

        /**
         * Save only models which don't exist locally or which were updated
         * remotely.
         */
        checkRemoteChanges: function(localData, remoteData, module) {
            const newData = _.filter(remoteData, (rModel) => {
                const model = _.findWhere(localData, {id: rModel.id});
                return !model || model.updated < rModel.updated;
            });

            const promises = [];

            if (newData.length) {
                console.log('Dropbox changes:', newData);
                this.configs.statRemote = true;

                promises.push(() => {
                    return Radio.request(module, 'save:all:raw', newData, {profile: adapter.profile});
                });
            }

            return promises;
        },

        /**
         * Save only models which don't exist on Dropbox or
         * which were updated locally.
         */
        checkLocalChanges: function(localData, remoteData, module, encryptKeys) {
            const promises = [];

            _.each(localData, (lModel) => {
                const model = _.findWhere(remoteData, {id: lModel.id});
                if (model && model.updated >= lModel.updated) {
                    return;
                }

                console.log('Dropbox local changes:', lModel);
                promises.push(() => {
                    return adapter.save(module, lModel, encryptKeys);
                });
            });

            return promises;
        },

        /**
         * Start watching for changes with calculated interval.
         */
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
         */
        onSave: function(model) {
            return adapter.save(model.storeName, model.attributes, model.encryptKeys);
        }

    });

    return Sync;
});