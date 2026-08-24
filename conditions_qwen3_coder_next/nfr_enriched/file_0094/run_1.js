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
         * Check passwords from the user input and validate them with configs.
         */
        checkPasswords: function(data) {
            const self     = this;
            const promises = [];
            const {old: oldPassword, password} = data;

            this._normalizeOldPassword(data);

            if (oldPassword) {
                this._switchToBackupConfigs();
                promises.push(this._checkPassword(oldPassword));
            }

            if (password) {
                this._switchToCurrentConfigs();
                promises.push(this._checkPassword(password));
            }

            return Q.all(promises)
            .then(results => this._handlePasswordResults(results, data, self));
        },

        /**
         * Normalize old password if encryption was previously enabled.
         */
        _normalizeOldPassword: function(data) {
            const {old: oldPassword, password} = data;

            if (Number(this.backup.encrypt) && !oldPassword && password) {
                data.old = password;
            }
        },

        /**
         * Switch to backup encryption configuration.
         */
        _switchToBackupConfigs: function() {
            this.vent.request('change:configs', this.backup);
        },

        /**
         * Switch to current encryption configuration.
         */
        _switchToCurrentConfigs: function() {
            this.vent.request('change:configs', this.configs);
        },

        /**
         * Check a single password against active config.
         */
        _checkPassword: function(password) {
            return this.vent.request('check:password', password);
        },

        /**
         * Handle password checking results and trigger next steps accordingly.
         */
        _handlePasswordResults: function(results, data, self) {
            if (!results.length || _.indexOf(results, false) > -1) {
                return self.view.trigger('password:invalid', results);
            }

            self.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Initialize encryption with re-encryption of all profiles.
         */
        initEncrypt: function() {
            const profile = this._getMainProfile();
            this.rawData = {};
            this.rawData[profile] = this._prepareRawConfigData();

            return this._reEncryptAllProfiles()
            .then(this.resetBackup)
            .then(this.showBackup)
            .then(this.redirect)
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Determine which profile to use for initial configuration data storage.
         */
        _getMainProfile: function() {
            return (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
        },

        /**
         * Prepare raw config data for backup profile initialization.
         */
        _prepareRawConfigData: function() {
            return _.map(this.configs, function(item, key) {
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
         * Re-encrypt all profiles and handle each profile independently.
         */
        _reEncryptAllProfiles: function() {
            const promises = [],
                profile = this._getMainProfile(),
                self = this;

            this.rawData[profile] = this._prepareRawConfigData();

            _.each(this.profiles, function(p) {
                promises.push(() =>
                    self._reEncryptSingleProfile(p)
                );
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Re-encrypt a single profile.
         */
        _reEncryptSingleProfile: function(profile) {
            return this._re EncryptProfile({
                profile: profile
            });
        },

        /**
         * Re-encrypt a specific profile.
         */
        _reEncryptProfile: function(options) {
            // Use backup configs
            this.vent.request('change:configs', this.backup);

            // Generate PBKDF2 before starting re-encryption
            return this.vent.request('save:secureKey', this.passwords.old)
            .then(() => this.encryptProfile({
                profile: options.profile
            }));
        },

        /**
         * Start encryption process for a given profile.
         */
        encryptProfile: function(options) {
            const promises = [];
            const self = this;

            // Fetch options
            options          = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            // Fetch all collections in a profile
            _.each(this.collectionNames, function(name) {
                promises.push(
                    new Q(Radio.request(name, 'fetch', options))
                );
            });

            /**
             * After the collections are fetched, start re-encryption process.
             */
            return Q.all(promises)
            .spread(function() {
                // Re-encrypt the collections that are not empty
                self.collections = _.filter(arguments, function(collection) {
                    self.rawData[options.profile][collection.storeName] = collection.toJSON();
                    return collection.length > 0;
                });
                self.view.trigger('encrypt:init', self.collections.length);
            })
            .then(() => self.encrypt())
            .then(() => self.saveChanges());
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this._disableEncryptionForCollections();
                return;
            }

            const promises = [];
            const self = this;

            // Use new encryption configs
            this.vent.request('change:configs', this.configs);

            // Encrypt every collection
            _.each(this.collections, function(collection) {
                promises.push(() =>
                    self._encryptSingleCollection(collection)
                );
            });

            return this.vent.request('save:secureKey', this.passwords.password)
            .then(() => _.reduce(promises, Q.when, new Q()));
        },

        /**
         * Enable encryption by clearing encryptedData field on all models.
         */
        _disableEncryptionForCollections: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Encrypt a single collection.
         */
        _encryptSingleCollection: function(collection) {
            return this.vent.request('encrypt:models', collection)
            .then(() => this.checkEncryption(collection));
        },

        /**
         * Validate encryption by decrypting a sample model.
         */
        checkEncryption: function(collection) {
            if (!collection.length) {
                return new Q();
            }

            const model = collection.at(0);

            return this.vent.request('decrypt:model', model)
            .fail(function(e) {
                console.error('Encryption error:', e);
                throw new Error('Error with encryption');
            });
        },

        /**
         * Save all encrypted collections to storage.
         */
        saveChanges: function() {
            const promises = [];

            _.each(this.collections, function(collection) {
                promises.push(() =>
                    new Q(Radio.request(collection.storeName, 'save:collection', collection))
                );
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Possibly remove backup configs as they are no longer needed.
         */
        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Show backup view for user download.
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
         * Trigger export of raw data as backup file.
         */
        downloadBackup: function() {
            Radio.request('importExport', 'export', this.rawData);
        },

        /**
         * Delete secure key and redirect to notes page.
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