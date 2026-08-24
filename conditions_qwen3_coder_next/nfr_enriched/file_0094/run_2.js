/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
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
], function(Q, _, Marionette, Radio, View, BackupView) {
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
    var Controller = Marionette.Object.extend({

        // Collections to encrypt
        collectionNames : ['notes', 'tags', 'notebooks'],
        collections     : {},

        initialize: function(options) {
            _.bindAll(this, 'saveChanges', 'encrypt', 'redirect', 'show', 'encryptProfile', 'showBackup');

            this.options = options;
            this.vent    = Radio.channel('encrypt');

            // Configs
            this.configs = Radio.request('configs', 'get:object');
            this.backup  = _.extend({}, this.configs, this.configs.encryptBackup);

            // Just to be save remove current secure key from the session
            this.vent.request('delete:secureKey');

            // Show the view
            Radio.request('configs', 'get:profiles')
            .then(this.show)
            .fail(function(e) {
                console.error('Error:', e);
            });

            // Events
            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
        },

        onDestroy: function() {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        show: function(profiles) {
            this.profiles = profiles;

            // Instantiate and show the view
            this.view = new View({
                collections : this.collectionNames,
                configs     : this.configs
            });
            Radio.request('global', 'region:show', 'brand', this.view);

            // Events
            this.listenTo(this.view, 'check:passwords', this.checkPasswords);
        },

        /**
         * Check old and new passwords against appropriate configs.
         */
        checkPasswords: function(data) {
            const self     = this;
            const promises = [];

            this._normalizePasswordData(data);
            this._addPasswordPromises(data, promises);

            return Q.all(promises)
            .then(results => {
                if (!results.length || _.indexOf(results, false) > -1) {
                    self.view.trigger('password:invalid', results);
                    return;
                }

                self.passwords = data;
                Radio.trigger('Encryption', 'password:valid');
            });
        },

        /**
         * Normalize password data: fallback old password to new if needed.
         */
        _normalizePasswordData: function(data) {
            if (Number(this.backup.encrypt) && !data.old && data.password) {
                data.old = data.password;
            }
        },

        /**
         * Add password validation promises to the array.
         */
        _addPasswordPromises: function(data, promises) {
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
         * Initialize encryption process.
         */
        initEncrypt: function() {
            const profile = this._determineProfile();
            const self    = this;

            this.rawData = {};
            this.rawData[profile] = {
                configs: this._buildConfigArray()
            };

            const promises = this._buildReencryptionPromises(profile);

            return _.reduce(promises, Q.when, new Q())
            .then(() => this.resetBackup())
            .then(() => this.showBackup())
            .then(() => this.redirect())
            .fail(() => console.error('Error!', arguments));
        },

        /**
         * Determine which profile to use for encryption initialization.
         */
        _determineProfile: function() {
            return (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
        },

        /**
         * Build configuration array for the profile.
         */
        _buildConfigArray: function() {
            return _.map(this.configs, (item, key) => {
                if (key === 'encrypt') {
                    item = '0';
                }
                if (key === 'encryptBackup') {
                    item = {};
                }
                if (key === 'appProfiles') {
                    item = JSON.stringify(item);
                }
                return {name: key, value: item};
            });
        },

        /**
         * Build re-encryption promises for each profile.
         */
        _buildReencryptionPromises: function(profile) {
            const self = this;

            return _.map(this.profiles, profileName => () =>
                this.vent.request('change:configs', this.backup)
                .then(() => this.vent.request('save:secureKey', this.passwords.old))
                .then(() => this.encryptProfile({profile: profileName}))
            );
        },

        /**
         * Start encryption process for a specific profile.
         */
        encryptProfile: function(options) {
            const self = this;

            options          = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            const promises = this._buildFetchPromises(options);

            return Q.all(promises)
            .spread(() => {
                self._processFetchedCollections(options.profile, arguments);
                self.view.trigger('encrypt:init', self.collections.length);
            })
            .then(() => self.encrypt())
            .then(() => self.saveChanges());
        },

        /**
         * Build fetch promises for all collections.
         */
        _buildFetchPromises: function(options) {
            return _.map(this.collectionNames, name =>
                new Q(Radio.request(name, 'fetch', options))
            );
        },

        /**
         * Process fetched collections and store raw data.
         */
        _processFetchedCollections: function(profile, collections) {
            this.collections = _.filter(collections, collection => {
                this.rawData[profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });
        },

        /**
         * Encrypt all collections with new encryption configs.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this._disableEncryption();
                return;
            }

            const self = this;

            this.vent.request('change:configs', this.configs);

            const promises = _.map(this.collections, collection => () =>
                this.vent.request('encrypt:models', collection)
                .then(() => self.checkEncryption(collection))
            );

            return this.vent.request('save:secureKey', this.passwords.password)
            .then(() => _.reduce(promises, Q.when, new Q()));
        },

        /**
         * Disable encryption by clearing encryptedData on all models.
         */
        _disableEncryption: function() {
            _.each(this.collections, collection => {
                collection.each(model => {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Validate encryption by decrypting and comparing a sample model.
         */
        checkEncryption: function(collection) {
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
         * Save all encrypted collections.
         */
        saveChanges: function() {
            const promises = _.map(this.collections, collection => () =>
                new Q(Radio.request(collection.storeName, 'save:collection', collection))
            );

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Reset backup encryption configs.
         */
        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Show backup view with raw data.
         */
        showBackup: function() {
            const defer = Q.defer();

            this.view = new BackupView({
                data: this.rawData
            });

            this.view.once('confirm:download', this.downloadBackup, this);
            this.view.once('next:step', defer.resolve, defer);
            Radio.request('global', 'region:show', 'brand', this.view);

            return defer.promise;
        },

        /**
         * Trigger export of raw data as backup.
         */
        downloadBackup: function() {
            Radio.request('importExport', 'export', this.rawData);
        },

        /**
         * Redirect to notes page after encryption.
         */
        redirect: function() {
            this.vent.request('delete:secureKey');

            Radio.request('uri', 'navigate', '/notes', {
                includeProfile : true,
                trigger        : false
            });
            window.location.reload();
        }

    });

    return Controller;
});