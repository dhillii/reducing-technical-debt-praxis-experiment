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
        collectionNames: ['notes', 'tags', 'notebooks'],
        collections: {},

        initialize: function(options) {
            this.options = options;
            this.vent = Radio.channel('encrypt');

            // Configs
            this.configs = Radio.request('configs', 'get:object');
            this.backup = _.extend({}, this.configs, this.configs.encryptBackup);

            // Remove current secure key from session
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
         * Handle error when getting profiles fails.
         */
        handleGetProfilesError: function(e) {
            console.error('Error:', e);
        },

        show: function(profiles) {
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

        checkPasswords: function(data) {
            // Normalize old password if encryption was enabled
            this.normalizePasswords(data);

            // Validate both old and new passwords
            return this.validatePasswords(data);
        },

        /**
         * Normalize password data for validation.
         * If encryption was enabled in old configs but the old password
         * was not provided by the user, try to use the new password instead.
         */
        normalizePasswords: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Validate both old and new passwords against configs.
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

            return Q.all(promises)
                .then(this.handlePasswordValidationResults);
        },

        /**
         * Handle password validation results.
         */
        handlePasswordValidationResults: function(results) {
            if (!results.length || _.indexOf(results, false) > -1) {
                return this.view.trigger('password:invalid', results);
            }

            this.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Initialize encryption process.
         */
        initEncrypt: function() {
            var profile = this.selectProfile();
            this.rawData = {};
            this.rawData[profile] = this.prepareRawData(profile);

            // Re-encrypt every profile
            return this.reencryptProfiles()
                .then(this.resetBackup)
                .then(this.showBackup)
                .then(this.redirect)
                .fail(this.handleEncryptError);
        },

        /**
         * Select the profile to encrypt.
         */
        selectProfile: function() {
            return this.profiles.length === 1 ? this.profiles[0] : 'notes-db';
        },

        /**
         * Prepare raw data for encryption.
         */
        prepareRawData: function(profile) {
            return {
                configs: _.map(this.configs, this.mapConfigItem, profile)
            };
        },

        /**
         * Map config item for encryption.
         */
        mapConfigItem: function(item, key) {
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
        },

        /**
         * Re-encrypt all profiles.
         */
        reencryptProfiles: function() {
            var promises = [];

            _.each(this.profiles, function(profile) {
                promises.push(this.encryptProfile({
                    profile: profile
                }));
            }, this);

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Start encryption process for a profile.
         */
        encryptProfile: function(options) {
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            // Fetch all collections in a profile
            return this.fetchCollections(options)
                .then(this.prepareCollectionsForEncryption)
                .then(this.encrypt)
                .then(this.saveChanges);
        },

        /**
         * Fetch all collections for a profile.
         */
        fetchCollections: function(options) {
            var promises = [];

            _.each(this.collectionNames, function(name) {
                promises.push(
                    new Q(Radio.request(name, 'fetch', options))
                );
            });

            return Q.all(promises);
        },

        /**
         * Prepare collections for encryption.
         */
        prepareCollectionsForEncryption: function() {
            var self = this;

            // Re-encrypt the collections that are not empty
            this.collections = _.filter(arguments, function(collection) {
                self.rawData[self.options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });

            this.view.trigger('encrypt:init', this.collections.length);
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            // Encryption is disabled
            if (Number(this.configs.encrypt) === 0) {
                this.clearEncryptedData();
                return;
            }

            // Use new encryption configs
            this.vent.request('change:configs', this.configs);

            // Encrypt every collection
            var promises = [];

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return this.vent.request(
                        'encrypt:models', collection
                    ).then(this.checkEncryption);
                }.bind(this));
            });

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(function() {
                    return _.reduce(promises, Q.when, new Q());
                });
        },

        /**
         * Clear encrypted data from all collections.
         */
        clearEncryptedData: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
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
            var promises = [];

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                });
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Remove backup configs after encryption is complete.
         */
        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Show backup view to advise user to download backup with data.
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
                includeProfile: true,
                trigger: false
            });
            window.location.reload();
        },

        /**
         * Handle error during encryption process.
         */
        handleEncryptError: function() {
            console.error('Error!', arguments);
        }

    });

    return Controller;
});
```