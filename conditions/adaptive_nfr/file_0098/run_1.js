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
     * Configuration object for Sync module
     */
    const SyncConfig = {
        key: '10iirspliqts95d',
        interval: 2000,
        intervalMax: 15000,
        intervalMin: 2000,
        statRemote: false,
        accessToken: null
    };

    /**
     * Parameters for synchronization operations
     */
    const createSyncParams = (localData, remoteData, module) => ({
        localData,
        remoteData,
        module
    });

    /**
     * Parameters for change detection operations
     */
    const createChangeParams = (localData, remoteData, module, encryptKeys) => ({
        localData,
        remoteData,
        module,
        encryptKeys
    });

    /**
     * Parameters for remote change operations
     */
    const createRemoteChangeParams = (localData, remoteData, module) => ({
        localData,
        remoteData,
        module
    });

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

        configs: Object.assign({}, SyncConfig),

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
         * @returns {Object}
         */
        parseHash: function() {
            const hash = window.location.hash.replace('#', '').split('&');
            const ret = {};

            if (!hash.length) {
                return ret;
            }

            _.each(hash, function(str) {
                const parts = str.replace(/\+/g, ' ').split('=');

                if (parts.length > 1) {
                    const key = parts.shift();
                    const val = parts.length > 0 ? parts.join('=') : undefined;
                    const decodedVal = undefined ? null : decodeURIComponent(val.trim());
                    ret[key] = decodedVal;
                }
            });

            return ret;
        },

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
         * @param {String} accessToken
         * @returns {Promise}
         */
        saveAccessToken: function(accessToken) {
            const self = this;
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

            _.each(['notes', 'notebooks', 'tags'], function(module) {
                promises.push(function() {
                    return Q.all([
                        Radio.request(module, 'fetch', {encrypt: true}),
                        adapter.getAll(module)
                    ])
                        .spread(function(localData, remoteData) {
                            const syncParams = createSyncParams(localData, remoteData, module);
                            return self.syncAll(syncParams);
                        });
                });
            });

            return _.reduce(promises, Q.when, new Q())
                .then(function() {
                    Radio.trigger('sync', 'stop', 'dropbox');
                    self.startWatch();
                })
                .fail(function(err) {
                    self.handleSyncError(err);
                });
        },

        /**
         * Handle synchronization errors
         * @param {Object} err - Error object
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
            console.error('Error', err);
        },

        /**
         * Synchronize a collection.
         * @param {Object} syncParams - Parameters object containing localData, remoteData, module
         * @return {Promise}
         */
        syncAll: function(syncParams) {
            const {localData: rawLocalData, remoteData, module} = syncParams;
            const encryptKeys = rawLocalData.model.prototype.encryptKeys;
            const localData = (rawLocalData.fullCollection || rawLocalData).toJSON();

            const promises = this.checkRemoteChanges(createRemoteChangeParams(localData, remoteData, module));
            const localChanges = this.checkLocalChanges(createChangeParams(localData, remoteData, module, encryptKeys));
            
            promises.push.apply(promises, localChanges);

            return _.reduce(promises, Q.when, new Q())
                .then(function() {
                    return Radio.request(module, 'fetch', {encrypt: true});
                });
        },

        /**
         * Save only models which don't exist locally or which were updated remotely.
         * @param {Object} changeParams - Parameters object containing localData, remoteData, module
         */
        checkRemoteChanges: function(changeParams) {
            const {localData, remoteData, module} = changeParams;
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
         * @param {Object} changeParams - Parameters object containing localData, remoteData, module, encryptKeys
         */
        checkLocalChanges: function(changeParams) {
            const {localData, remoteData, module, encryptKeys} = changeParams;
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
         * Increase or descrease watch interval depending on whether changes appear on Dropbox.
         */
        calcInterval: function() {
            const range = this.configs.intervalMax - this.configs.intervalMin;

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
         * Immediately after a model is changed locally, synchronize it with Dropbox.
         */
        onSave: function(model) {
            return adapter.save(model.storeName, model.attributes, model.encryptKeys);
        }

    });

    return Sync;
});