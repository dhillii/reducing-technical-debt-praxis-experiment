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
     *    initializes encryption.
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
            this.options = options;
            this.vent    = Radio.channel('encrypt');

            // Configs
            this.configs = Radio.request('configs', 'get:object');
            this.backup  = _.extend({}, this.configs, this.configs.encryptBackup);

            // Remove current secure key from the session
            this.vent.request('delete:secureKey');

            // Show the view
            Radio.request('configs', 'get:profiles')
            .then(this.show)
            .fail(this.handleGetProfilesError);

            // Events
            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
        },

        onDestroy: function() {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        /**
         * Handles errors when fetching profiles.
         * @param {Error} e - The error object.
         */
        handleGetProfilesError: function(e) {
            console.error('Error:', e);
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
            var self = this;

            // If encryption was enabled in old configs but the old password
            // was not provided by the user, try to use the new password instead.
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }

            // Switch to backup configs and check old password
            if (data.old) {
                this.vent.request('change:configs', this.backup);
                self.passwordCheckPromises.push(this.vent.request('check:password', data.old));
            }
            // Switch to new configs and check new password
            if (data.password) {
                this.vent.request('change:configs', this.configs);
                self.passwordCheckPromises.push(this.vent.request('check:password', data.password));
            }

            return Q.all(this.passwordCheckPromises)
            .then(self.handlePasswordCheckResults);
        },

        /**
         * Handles the results of password checks.
         * @param {Array} results - Array of boolean results from password checks.
         */
        handlePasswordCheckResults: function(results) {
            var self = this;

            if (!results.length || _.indexOf(results, false) > -1) {
                self.view.trigger('password:invalid', results);
                return;
            }

            self.passwords = this.checkPasswords.data;
            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Stores the data passed to checkPasswords for later use.
         * @param {Object} data - The password data object.
         */
        storePasswordData: function(data) {
            this.checkPasswords.data = data;
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            var self = this;
            var profile = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');

            this.rawData = {};
            this.rawData[profile] = this.prepareRawData(profile);

            // Re-encrypt every profile
            this.reEncryptPromises = this.profiles.map(function(profile) {
                return self.vent.request('change:configs', self.backup)
                .then(function() {
                    return self.vent.request('save:secureKey', self.passwords.old)
                    .then(function() {
                        return self.encryptProfile({
                            profile: profile
                        });
                    });
                });
            });

            return Q.all(this.reEncryptPromises)
            .then(this.resetBackup)
            .then(this.showBackup)
            .then(this.redirect)
            .fail(this.handleInitEncryptError);
        },

        /**
         * Handles errors during initialization of encryption.
         */
        handleInitEncryptError: function() {
            console.error('Error!', arguments);
        },

        /**
         * Prepares the raw data configuration for a specific profile.
         * @param {string} profile - The profile name.
         * @returns {Object} The prepared raw data object.
         */
        prepareRawData: function(profile) {
            var configs = _.map(this.configs, function(item, key) {
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

            return {configs: configs};
        },

        /**
         * Start encryption process for a specific profile.
         * @param {Object} options - The encryption options.
         */
        encryptProfile: function(options) {
            var self = this;
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            // Fetch all collections in a profile
            var fetchPromises = this.collectionNames.map(function(name) {
                return new Q(Radio.request(name, 'fetch', options));
            });

            /**
             * After the collections are fetched, start re-encryption process.
             */
            return Q.all(fetchPromises)
            .spread(function() {
                // Re-encrypt the collections that are not empty
                self.collections = _.filter(arguments, function(collection) {
                    self.rawData[options.profile][collection.storeName] = collection.toJSON();
                    return collection.length > 0;
                });
                self.view.trigger('encrypt:init', self.collections.length);
            })
            .then(this.encrypt)
            .then(this.saveChanges);
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            var self = this;

            // Encryption is disabled
            if (Number(this.configs.encrypt) === 0) {
                _.each(this.collections, function(collection) {
                    collection.each(function(model) {
                        model.set('encryptedData', null);
                    });
                });
                return Q();
            }

            // Use new encryption configs
            this.vent.request('change:configs', this.configs);

            // Encrypt every collection
            var encryptPromises = this.collections.map(function(collection) {
                return self.vent.request('encrypt:models', collection)
                .then(function() {
                    return self.checkEncryption(collection);
                });
            });

            return this.vent.request('save:secureKey', this.passwords.password)
            .then(function() {
                return Q.all(encryptPromises);
            });
        },

        /**
         * Validate encryption by picking one of the models in a collection,
         * decrypting it, and comparing to the original value.
         * @param {Object} collection - The collection to check.
         * @returns {Q} A promise that resolves on success.
         */
        checkEncryption: function(collection) {
            if (!collection.length) {
                return Q();
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
         * @returns {Q} A promise that resolves when all saves are complete.
         */
        saveChanges: function() {
            var self = this;

            var savePromises = this.collections.map(function(collection) {
                return new Q(Radio.request(collection.storeName, 'save:collection', collection));
            });

            return Q.all(savePromises);
        },

        /**
         * Probably we don't need backup configs and we can safely remove them.
         * @returns {Q} A promise that resolves when the reset is complete.
         */
        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Advice to download backup with data.
         * @returns {Q} A promise that resolves when the backup view is shown.
         */
        showBackup: function() {
            var self = this;
            var defer = Q.defer();

            this.view = new BackupView({
                data: this.rawData
            });

            this.view.once('confirm:download', this.downloadBackup, this);
            this.view.once('next:step', defer.resolve, defer);
            Radio.request('global', 'region:show', 'brand', this.view);

            return defer.promise;
        },

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