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
            var self     = this,
                promises = [];

            /*
             * If encryption was enabled in old configs but the old password
             * was not provided by the user, try to use the new password instead.
             */
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }

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

            return Q.all(promises)
            .then(function(results) {
                if (!results.length || _.indexOf(results, false) > -1) {
                    return self.view.trigger('password:invalid', results);
                }

                self.passwords = data;
                Radio.trigger('Encryption', 'password:valid');
            });
        },

        /**
         * Initialize encryption process.
         */
        initEncrypt: function() {
            var self = this;

            // Determine which profile to use
            var profile = self.getProfile();

            // Prepare raw data structure
            self.rawData = self.prepareRawData(profile);

            // Re-encrypt every profile
            return self.reencryptProfiles(profile)
            .then(self.resetBackup)
            .then(self.showBackup)
            .then(self.redirect)
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Determine which profile to use for encryption.
         * @returns {string} Profile name
         */
        getProfile: function() {
            return (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
        },

        /**
         * Prepare raw data structure for encryption.
         * @param {string} profile - Profile name
         * @returns {object} Raw data object
         */
        prepareRawData: function(profile) {
            var self = this;
            var rawData = {};

            rawData[profile] = {configs: _.map(this.configs, function(item, key) {
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

            return rawData;
        },

        /**
         * Re-encrypt all profiles.
         * @param {string} profile - Profile name
         * @returns {Promise} Promise that resolves when all profiles are re-encrypted
         */
        reencryptProfiles: function(profile) {
            var self = this;
            var promises = [];

            _.each(this.profiles, function(profile) {
                promises.push(function() {
                    // Use backup configs
                    self.vent.request('change:configs', self.backup);

                    // Generate PBKDF2 before starting re-encryption
                    return self.vent.request('save:secureKey', self.passwords.old)
                    .then(function() {
                        return self.encryptProfile({
                            profile: profile
                        });
                    });
                });
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Start encryption process for a profile.
         * @param {object} options - Encryption options
         */
        encryptProfile: function(options) {
            var self = this;

            // Fetch options
            options          = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            // Fetch all collections in a profile
            return this.fetchCollections(options)
            .then(this.prepareCollectionsForEncryption)
            .then(this.encryptCollections)
            .then(this.saveChanges);
        },

        /**
         * Fetch all collections for a profile.
         * @param {object} options - Encryption options
         * @returns {Promise} Promise that resolves with collections
         */
        fetchCollections: function(options) {
            var self = this;
            var promises = [];

            // Fetch all collections in a profile
            _.each(this.collectionNames, function(name) {
                promises.push(
                    new Q(Radio.request(name, 'fetch', options))
                );
            });

            return Q.all(promises);
        },

        /**
         * Prepare collections for encryption by filtering empty ones.
         * @param {array} collections - Array of collections
         * @param {string} profile - Profile name
         * @returns {Promise} Promise that resolves with filtered collections
         */
        prepareCollectionsForEncryption: function(collections) {
            var self = this;
            var options = this.options;

            // Re-encrypt the collections that are not empty
            self.collections = _.filter(collections, function(collection) {
                self.rawData[options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });
            self.view.trigger('encrypt:init', self.collections.length);

            return self.collections;
        },

        /**
         * Encrypt all collections with new encryption configs.
         * @returns {Promise} Promise that resolves when encryption is complete
         */
        encrypt: function() {
            var self = this;

            // Encryption is disabled
            if (Number(this.configs.encrypt) === 0) {
                return this.disableEncryption();
            }

            return this.enableEncryption()
            .then(this.encryptAllCollections)
            .then(this.saveSecureKey);
        },

        /**
         * Disable encryption by clearing encrypted data from all models.
         * @returns {Promise} Resolved promise
         */
        disableEncryption: function() {
            var self = this;

            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });

            return new Q();
        },

        /**
         * Enable encryption by switching to new configs.
         * @returns {Promise} Resolved promise
         */
        enableEncryption: function() {
            this.vent.request('change:configs', this.configs);
            return new Q();
        },

        /**
         * Encrypt all collections.
         * @returns {Promise} Promise that resolves when all collections are encrypted
         */
        encryptAllCollections: function() {
            var self = this;
            var promises = [];

            // Encrypt every collection
            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return self.vent.request(
                        'encrypt:models', collection
                    ).then(function() {
                        return self.checkEncryption(collection);
                    });
                });
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Validate encryption by picking one of the models in a collection,
         * decrypting it, and comparing to the original value.
         * @param {object} collection - Collection to check
         * @returns {Promise} Promise that resolves on success
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
         * @returns {Promise} Promise that resolves when all changes are saved
         */
        saveChanges: function() {
            var self = this;
            var promises = [];

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                });
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Probably we don't need backup configs and we can safely remove them.
         * @returns {Promise} Promise that resolves when backup is reset
         */
        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Advice to download backup with data.
         * @returns {Promise} Promise that resolves when backup view is shown
         */
        showBackup: function() {
            var defer = Q.defer();

            this.view = new BackupView({
                data: this.rawData
            });

            this.view.once('confirm:download', this.downloadBackup, this);
            this.view.once('next:step', defer.resolve, defer);
            Radio.request('global', 'region:show', 'brand', this.view);

            return defer.promise;
        },

        /**
         * Download backup data.
         */
        downloadBackup: function() {
            Radio.request('importExport', 'export', this.rawData);
        },

        /**
         * Delete current secure key from session storage and reload the page.
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
```