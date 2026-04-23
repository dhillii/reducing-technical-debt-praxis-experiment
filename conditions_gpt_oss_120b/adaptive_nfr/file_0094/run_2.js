/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * license v. 2.0. If a copy of the MPL was not distributed with this
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
                .fail(e => {
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

            this._applyLegacyPasswordFallback(data);

            if (data.old) {
                promises.push(...this._preparePasswordCheck(data.old, this.backup));
            }
            if (data.password) {
                promises.push(...this._preparePasswordCheck(data.password, this.configs));
            }

            return Q.all(promises)
                .then(results => this._handlePasswordCheckResults(results));
        },

        /**
         * If encryption was enabled in old configs but the old password
         * was not provided, use the new password instead.
         * @private
         */
        _applyLegacyPasswordFallback: function (data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Switches configs and checks a single password.
         * @private
         * @param {string} pwd
         * @param {Object} cfg
         * @returns {Array<Function>}
         */
        _preparePasswordCheck: function (pwd, cfg) {
            this.vent.request('change:configs', cfg);
            return [this.vent.request.bind(this.vent, 'check:password', pwd)];
        },

        /**
         * Handles results of password checks.
         * @private
         * @param {Array<boolean>} results
         */
        _handlePasswordCheckResults: function (results) {
            if (!results.length || _.indexOf(results, false) > -1) {
                return this.view.trigger('password:invalid', results);
            }

            this.passwords = this.passwords || {};
            this.passwords.old = this.passwords.old || null;
            this.passwords.password = this.passwords.password || null;
            this.passwords = Object.assign(this.passwords, { old: this.passwords.old, password: this.passwords.password });
            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function () {
            const profile = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
            this.rawData = {};

            this._buildRawData(profile);
            const profilePromises = this._createProfilePromises();

            return _.reduce(profilePromises, Q.when, new Q())
                .then(this.resetBackup)
                .then(this.showBackup)
                .then(this.redirect)
                .fail(() => {
                    console.error('Error!', arguments);
                });
        },

        /**
         * Constructs rawData structure for a given profile.
         * @private
         * @param {string} profile
         */
        _buildRawData: function (profile) {
            this.rawData[profile] = {
                configs: _.map(this.configs, (item, key) => {
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
         * Creates an array of functions, each handling encryption for a profile.
         * @private
         * @returns {Array<Function>}
         */
        _createProfilePromises: function () {
            const promises = [];

            _.each(this.profiles, profile => {
                promises.push(() => {
                    this.vent.request('change:configs', this.backup);
                    return this.vent.request('save:secureKey', this.passwords.old)
                        .then(() => this.encryptProfile({ profile }));
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
                .spread((...collections) => this._processFetchedCollections(collections, opts))
                .then(this.encrypt)
                .then(this.saveChanges);
        },

        /**
         * Fetches all collections for the given profile.
         * @private
         * @param {Object} opts
         * @returns {Array<Promise>}
         */
        _fetchCollections: function (opts) {
            return this.collectionNames.map(name => new Q(Radio.request(name, 'fetch', opts)));
        },

        /**
         * Processes fetched collections, storing raw data and filtering empty ones.
         * @private
         * @param {Array} collections
         * @param {Object} opts
         */
        _processFetchedCollections: function (collections, opts) {
            this.collections = _.filter(collections, collection => {
                this.rawData[opts.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });
            this.view.trigger('encrypt:init', this.collections.length);
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function () {
            if (Number(this.configs.encrypt) === 0) {
                this._clearEncryptionData();
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
        _clearEncryptionData: function () {
            _.each(this.collections, collection => {
                collection.each(model => model.set('encryptedData', null));
            });
        },

        /**
         * Builds an array of functions that encrypt each collection and verify it.
         * @private
         * @returns {Array<Function>}
         */
        _buildEncryptPromises: function () {
            return this.collections.map(collection => () => {
                return this.vent.request('encrypt:models', collection)
                    .then(() => this.checkEncryption(collection));
            });
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
                .fail(e => {
                    console.error('Encryption error:', e);
                    throw new Error('Error with encryption');
                });
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function () {
            const savePromises = this.collections.map(collection => () => {
                return new Q(Radio.request(collection.storeName, 'save:collection', collection));
            });

            return _.reduce(savePromises, Q.when, new Q());
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

            this.view = new BackupView({
                data: this.rawData
            });

            this.view.once('confirm:download', this.downloadBackup, this);
            this.view.once('next:step', defer.resolve, defer);
            Radio.request('global', 'region:show', 'brand', this.view);

            return defer.promise;
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