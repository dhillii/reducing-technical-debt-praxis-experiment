/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'q',
    'underscore',
    'marionette',
    'backbone.radio',
    'apps/encryption/encrypt/view',
    'apps/encryption/encrypt/backupView'
], function (Q, _, Marionette, Radio, View, BackupView) {
    'use strict';

    /**
     * Encryption controller.
     *
     * Listens to events:
     * 1. channel: `Encryption`, event: `password:valid`
     *    initilizes encryption.
     * 2. channel: this.view, event: `check:passwords`
     *    checks passwords
     *
     * Triggers:
     * 1. channel: `configs`, request: `get:object`
     * 2. channel: `configs`, request: `reset:encrypt`
     * 3. channel: `global`, request: `region:show`
     * 4. channel: `encrypt`, request: `change:configs`
     * 5. channel: `encrypt`, request: `save:secureKey`
     * 6. channel: `encrypt`, request: `decrypt:models`
     * 7. channel: `encrypt`, request: `encrypt:models`
     */
    const Controller = Marionette.Object.extend({

        // Collections to encrypt
        collectionNames: ['notes', 'tags', 'notebooks'],
        collections: {},

        initialize: function (options) {
            _.bindAll(this, 'saveChanges', 'encrypt', 'redirect', 'show', 'encryptProfile', 'showBackup');

            this.options = options;
            this.vent = Radio.channel('encrypt');

            // Configs
            this.configs = Radio.request('configs', 'get:object');
            this.backup = _.extend({}, this.configs, this.configs.encryptBackup);

            // Just to be save remove current secure key from the session
            this.vent.request('delete:secureKey');

            // Show the view
            Radio.request('configs', 'get:profiles')
                .then(this.show)
                .fail(function (e) {
                    console.error('Error:', e);
                });

            // Events
            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
        },

        onDestroy: function () {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        show: function (profiles) {
            this.profiles = profiles;

            // Instantiate and show the view
            this.view = new View({
                collections: this.collectionNames,
                configs: this.configs
            });
            Radio.request('global', 'region:show', 'brand', this.view);

            // Events
            this.listenTo(this.view, 'check:passwords', this.checkPasswords);
        },

        /**
         * Orchestrates password validation.
         */
        checkPasswords: function (data) {
            const promises = [];

            this._preparePasswordData(data);
            this._switchConfigsAndCheck(data, promises);

            return Q.all(promises)
                .then(this._handlePasswordCheckResults.bind(this, data));
        },

        /**
         * Adjusts password data when backup config is active.
         * @private
         */
        _preparePasswordData: function (data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Switches configs and queues password checks.
         * @private
         */
        _switchConfigsAndCheck: function (data, promises) {
            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }
            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }
        },

        /**
         * Handles results of password checks.
         * @private
         */
        _handlePasswordCheckResults: function (data, results) {
            if (!results.length || _.indexOf(results, false) > -1) {
                return this.view.trigger('password:invalid', results);
            }

            this.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function () {
            const profile = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');

            this.rawData = {};
            this._buildRawData(profile);

            const reencryptPromises = this._createReencryptPromises();

            return _.reduce(reencryptPromises, Q.when, new Q())
                .then(this.resetBackup)
                .then(this.showBackup)
                .then(this.redirect)
                .fail(function () {
                    console.error('Error!', arguments);
                });
        },

        /**
         * Builds raw data structure for a given profile.
         * @private
         */
        _buildRawData: function (profile) {
            this.rawData[profile] = {
                configs: _.map(this.configs, function (item, key) {
                    if (key === 'encrypt') {
                        item = '0';
                    }
                    if (key === 'encryptBackup') {
                        item = {};
                    }
                    if (key === 'appProfiles') {
                        item = JSON.stringify(item);
                    }
                    return { name: key, value: item };
                })
            };
        },

        /**
         * Creates promises for re‑encrypting each profile.
         * @private
         */
        _createReencryptPromises: function () {
            const self = this;
            const promises = [];

            _.each(this.profiles, function (profile) {
                promises.push(function () {
                    self.vent.request('change:configs', self.backup);
                    return self.vent.request('save:secureKey', self.passwords.old)
                        .then(function () {
                            return self.encryptProfile({ profile: profile });
                        });
                });
            });

            return promises;
        },

        /**
         * Start encryption process for a profile.
         */
        encryptProfile: function (options) {
            const opts = options || this.options;
            opts.pageSize = 0;

            this.rawData[opts.profile] = this.rawData[opts.profile] || {};

            const fetchPromises = this._fetchCollections(opts);
            return Q.all(fetchPromises)
                .spread(this._processFetchedCollections.bind(this, opts))
                .then(this.encrypt)
                .then(this.saveChanges);
        },

        /**
         * Fetches all collections for a profile.
         * @private
         */
        _fetchCollections: function (options) {
            const promises = [];

            _.each(this.collectionNames, function (name) {
                promises.push(new Q(Radio.request(name, 'fetch', options)));
            });

            return promises;
        },

        /**
         * Processes fetched collections, storing raw data and triggering view.
         * @private
         */
        _processFetchedCollections: function (options) {
            const args = Array.prototype.slice.call(arguments, 1);
            this.collections = _.filter(args, (collection) => {
                this.rawData[options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });
            this.view.trigger('encrypt:init', this.collections.length);
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function () {
            if (Number(this.configs.encrypt) === 0) {
                this._clearEncryption();
                return;
            }

            this.vent.request('change:configs', this.configs);
            const encryptPromises = this._buildEncryptPromises();

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(() => _.reduce(encryptPromises, Q.when, new Q()));
        },

        /**
         * Clears encrypted data when encryption is disabled.
         * @private
         */
        _clearEncryption: function () {
            _.each(this.collections, (collection) => {
                collection.each((model) => {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Builds promises to encrypt each collection and verify.
         * @private
         */
        _buildEncryptPromises: function () {
            const self = this;
            const promises = [];

            _.each(this.collections, (collection) => {
                promises.push(() => {
                    return self.vent.request('encrypt:models', collection)
                        .then(() => self.checkEncryption(collection));
                });
            });

            return promises;
        },

        /**
         * Validate encryption by picking one of the models in a collection,
         * decrypting it, and comparing to the original value.
         */
        checkEncryption: function (collection) {
            if (!collection.length) {
                return new Q();
            }

            const model = collection.at(0);

            return this.vent.request('decrypt:model', model)
                .fail(function (e) {
                    console.error('Encryption error:', e);
                    throw new Error('Error with encryption');
                });
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function () {
            const promises = this._buildSavePromises();
            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Builds promises to save each collection.
         * @private
         */
        _buildSavePromises: function () {
            const promises = [];

            _.each(this.collections, (collection) => {
                promises.push(() => new Q(Radio.request(collection.storeName, 'save:collection', collection)));
            });

            return promises;
        },

        /**
         * Probably we don't need backup configs and we can safely remove them.
         */
        resetBackup: function () {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Advice to download backup with data.
         */
        showBackup: function () {
            const defer = Q.defer();

            this._createBackupView(defer);
            return defer.promise;
        },

        /**
         * Creates and displays the backup view.
         * @private
         */
        _createBackupView: function (defer) {
            this.view = new BackupView({
                data: this.rawData
            });

            this.view.once('confirm:download', this.downloadBackup, this);
            this.view.once('next:step', defer.resolve, defer);
            Radio.request('global', 'region:show', 'brand', this.view);
        },

        downloadBackup: function () {
            Radio.request('importExport', 'export', this.rawData);
        },

        /**
         * Delete current secure key from session storage and reload the page.
         */
        redirect: function () {
            this.vent.request('delete:secureKey');

            Radio.request('uri', 'navigate', '/notes', {
                includeProfile: true,
                trigger: false
            });
            window.location.reload();
        }

    });

    return Controller;
});