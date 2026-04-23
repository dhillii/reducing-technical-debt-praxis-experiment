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

        checkPasswords: function(data) {
            var preparedData = this.preparePasswordData(data);
            var validationResults = this.validatePasswords(preparedData);
            return this.handlePasswordValidation(validationResults);
        },

        /**
         * Prepare password data for validation.
         * @param {Object} data - Password data object
         * @returns {Object} Prepared password data
         */
        preparePasswordData: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
            return data;
        },

        /**
         * Validate both old and new passwords.
         * @param {Object} data - Password data object
         * @returns {Promise} Validation results
         */
        validatePasswords: function(data) {
            var promises = [];

            // Switch to backup configs and check old password
            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }
            // Switch to new configs and check new password
            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }

            return Q.all(promises);
        },

        /**
         * Handle password validation results.
         * @param {Array} results - Validation results
         * @returns {Promise} Validation outcome
         */
        handlePasswordValidation: function(results) {
            if (!results.length || _.indexOf(results, false) > -1) {
                return this.view.trigger('password:invalid', results);
            }

            this.passwords = results;
            Radio.trigger('Encryption', 'password:valid');
            return new Q();
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            var profile = this.selectProfile();
            var rawData = this.prepareRawData(profile);
            var encryptionPromises = this.reencryptProfiles(profile, rawData);

            return Q.all(encryptionPromises)
            .then(this.resetBackup)
            .then(this.showBackup)
            .then(this.redirect)
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Select profile for encryption.
         * @returns {string} Profile name
         */
        selectProfile: function() {
            return (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
        },

        /**
         * Prepare raw data for encryption.
         * @param {string} profile - Profile name
         * @returns {Object} Raw data object
         */
        prepareRawData: function(profile) {
            this.rawData = {};
            this.rawData[profile] = {configs: _.map(this.configs, function(item, key) {
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
            })};
            return this.rawData[profile];
        },

        /**
         * Re-encrypt all profiles.
         * @param {string} profile - Profile name
         * @param {Object} rawData - Raw data object
         * @returns {Array} Array of promises
         */
        reencryptProfiles: function(profile, rawData) {
            var promises = [];

            _.each(this.profiles, function(profile) {
                promises.push(function() {
                    // Use backup configs
                    this.vent.request('change:configs', this.backup);

                    // Generate PBKDF2 before starting re-encryption
                    return this.vent.request('save:secureKey', this.passwords.old)
                    .then(function() {
                        return this.encryptProfile({
                            profile: profile
                        });
                    });
                });
            });

            return promises;
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            // Fetch all collections in a profile
            var collectionPromises = this.fetchCollections(options);

            // After the collections are fetched, start re-encryption process.
            return Q.all(collectionPromises)
            .spread(this.prepareCollectionsForEncryption)
            .then(this.performEncryption)
            .then(this.saveChanges);
        },

        /**
         * Fetch all collections for a profile.
         * @param {Object} options - Encryption options
         * @returns {Array} Array of promises
         */
        fetchCollections: function(options) {
            var promises = [];

            _.each(this.collectionNames, function(name) {
                promises.push(
                    new Q(Radio.request(name, 'fetch', options))
                );
            });

            return promises;
        },

        /**
         * Prepare collections for encryption.
         * @param {Array} collections - Fetched collections
         * @returns {Object} Prepared collections
         */
        prepareCollectionsForEncryption: function(collections) {
            // Re-encrypt the collections that are not empty
            this.collections = _.filter(collections, function(collection) {
                this.rawData[options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });
            this.view.trigger('encrypt:init', this.collections.length);
            return this.collections;
        },

        /**
         * Perform encryption on collections.
         * @returns {Promise} Encryption result
         */
        performEncryption: function() {
            return this.encrypt();
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {

            // Encryption is disabled
            if (Number(this.configs.encrypt) === 0) {
                return this.handleDisabledEncryption();
            }

            var encryptionPromises = this.encryptCollections();

            return this.vent.request('save:secureKey', this.passwords.password)
            .then(function() {
                return Q.all(encryptionPromises);
            });
        },

        /**
         * Handle disabled encryption.
         * @returns {Promise} Empty promise
         */
        handleDisabledEncryption: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
            return new Q();
        },

        /**
         * Encrypt all collections.
         * @returns {Array} Array of promises
         */
        encryptCollections: function() {
            var promises = [];

            // Use new encryption configs
            this.vent.request('change:configs', this.configs);

            // Encrypt every collection
            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return this.vent.request(
                        'encrypt:models', collection
                    ).then(function() {
                        return this.checkEncryption(collection);
                    });
                });
            });

            return promises;
        },

        /**
         * Validate encryption by picking one of the models in a collection,
         * decrypting it, and comparing to the original value.
         */
        checkEncryption: function(collection) {
            if (!collection.length) {
                return new Q();
            }

            var model = collection.at(0);

            return this.vent.request('decrypt:model', model)
            .fail(function(e) {
                console.error('Encryption error:', e);
                throw new Error('Error with encryption');
            });
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function() {
            var collectionPromises = this.saveAllCollections();

            return Q.all(collectionPromises);
        },

        /**
         * Save all collections.
         * @returns {Array} Array of promises
         */
        saveAllCollections: function() {
            var promises = [];

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                });
            });

            return promises;
        },

        /**
         * Probably we don't need backup configs and we can safely remove them.
         */
        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Advice to download backup with data.
         */
        showBackup: function() {
            var backupView = this.createBackupView();

            this.view = backupView;

            this.view.once('confirm:download', this.downloadBackup, this);
            this.view.once('next:step', function() {
                return new Q();
            });
            Radio.request('global', 'region:show', 'brand', this.view);

            return new Q();
        },

        /**
         * Create backup view.
         * @returns {BackupView} Backup view instance
         */
        createBackupView: function() {
            return new BackupView({
                data: this.rawData
            });
        },

        /**
         * Download backup.
         */
        downloadBackup: function() {
            Radio.request('importExport', 'export', this.rawData);
        },

        /**
         * Delete current secure key from session storage and reload the page.
         */
        redirect: function() {
            this.clearSecureKey();
            this.navigateAndReload();
        },

        /**
         * Clear secure key from session.
         */
        clearSecureKey: function() {
            this.vent.request('delete:secureKey');
        },

        /**
         * Navigate to notes and reload page.
         */
        navigateAndReload: function() {
            Radio.request('uri', 'navigate', '/notes', {
                includeProfile : true,
                trigger        : false
            });
            window.location.reload();
        }

    });

    return Controller;
});
```