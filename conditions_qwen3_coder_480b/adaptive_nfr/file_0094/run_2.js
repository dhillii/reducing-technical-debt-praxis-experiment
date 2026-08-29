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
    const Controller = Marionette.Object.extend({

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
         * Check if provided passwords are valid
         */
        checkPasswords: function(data) {
            const self     = this;
            const promises = [];

            this.handlePasswordFallback(data);
            
            // Switch to backup configs and check old password
            if (data.old) {
                this.switchToBackupConfigs();
                promises.push(this.checkOldPassword(data.old));
            }
            
            // Switch to new configs and check new password
            if (data.password) {
                this.switchToNewConfigs();
                promises.push(this.checkNewPassword(data.password));
            }

            return this.validatePasswordResults(promises)
            .then(function(results) {
                if (!results.length || _.indexOf(results, false) > -1) {
                    return self.view.trigger('password:invalid', results);
                }

                self.passwords = data;
                Radio.trigger('Encryption', 'password:valid');
            });
        },

        /**
         * Handle fallback when encryption was enabled but old password wasn't provided
         */
        handlePasswordFallback: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Switch to backup configurations
         */
        switchToBackupConfigs: function() {
            this.vent.request('change:configs', this.backup);
        },

        /**
         * Switch to new configurations
         */
        switchToNewConfigs: function() {
            this.vent.request('change:configs', this.configs);
        },

        /**
         * Check validity of old password
         */
        checkOldPassword: function(oldPassword) {
            return this.vent.request('check:password', oldPassword);
        },

        /**
         * Check validity of new password
         */
        checkNewPassword: function(newPassword) {
            return this.vent.request('check:password', newPassword);
        },

        /**
         * Validate password checking results
         */
        validatePasswordResults: function(promises) {
            return Q.all(promises);
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            const promises = [];
            const profile  = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
            const self     = this;

            this.rawData = {};
            this.setupInitialRawData(profile);

            // Re-encrypt every profile
            _.each(this.profiles, function(profile) {
                promises.push(function() {
                    return self.prepareReencryption(profile);
                });
            });

            return this.processEncryptionPromises(promises)
            .then(this.resetBackup.bind(this))
            .then(this.showBackup.bind(this))
            .then(this.redirect.bind(this))
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Setup initial raw data structure
         */
        setupInitialRawData: function(profile) {
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
        },

        /**
         * Prepare for re-encryption of a specific profile
         */
        prepareReencryption: function(profile) {
            const self = this;
            
            // Use backup configs
            this.vent.request('change:configs', this.backup);

            // Generate PBKDF2 before starting re-encryption
            return this.vent.request('save:secureKey', this.passwords.old)
            .then(function() {
                return self.encryptProfile({
                    profile: profile
                });
            });
        },

        /**
         * Process all encryption promises sequentially
         */
        processEncryptionPromises: function(promises) {
            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            const promises = [];
            const self     = this;

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
                return self.processFetchedCollections(arguments, options);
            })
            .then(this.encrypt.bind(this))
            .then(this.saveChanges.bind(this));
        },

        /**
         * Process fetched collections after retrieval
         */
        processFetchedCollections: function(collections, options) {
            const self = this;
            
            // Re-encrypt the collections that are not empty
            this.collections = _.filter(collections, function(collection) {
                self.rawData[options.profile][collection.storeName] = collection.toJSON();
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
                this.handleDisabledEncryption();
                return;
            }

            const promises = [];
            const self     = this;

            // Use new encryption configs
            this.vent.request('change:configs', this.configs);

            // Encrypt every collection
            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return self.encryptCollection(collection);
                });
            });

            return this.saveSecureKey()
            .then(function() {
                return self.executeEncryptionPromises(promises);
            });
        },

        /**
         * Handle case when encryption is disabled
         */
        handleDisabledEncryption: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Encrypt a single collection
         */
        encryptCollection: function(collection) {
            const self = this;
            
            return this.vent.request(
                'encrypt:models', collection
            ).then(function() {
                return self.checkEncryption(collection);
            });
        },

        /**
         * Save secure key for encryption
         */
        saveSecureKey: function() {
            return this.vent.request('save:secureKey', this.passwords.password);
        },

        /**
         * Execute encryption promises sequentially
         */
        executeEncryptionPromises: function(promises) {
            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Validate encryption by picking one of the models in a collection,
         * decrypting it, and comparing to the original value.
         */
        checkEncryption: function(collection) {
            if (!collection.length) {
                return new Q();
            }

            const model = collection.at(0);

            return this.decryptAndValidateModel(model)
            .fail(function(e) {
                console.error('Encryption error:', e);
                throw new Error('Error with encryption');
            });
        },

        /**
         * Decrypt and validate a model
         */
        decryptAndValidateModel: function(model) {
            return this.vent.request('decrypt:model', model);
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const promises = [];
            const self = this;

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return self.saveCollection(collection);
                });
            });

            return this.executeSavePromises(promises);
        },

        /**
         * Save a single collection
         */
        saveCollection: function(collection) {
            return new Q(Radio.request(collection.storeName, 'save:collection', collection));
        },

        /**
         * Execute save promises sequentially
         */
        executeSavePromises: function(promises) {
            return _.reduce(promises, Q.when, new Q());
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
            const defer = Q.defer();

            this.view = new BackupView({
                data: this.rawData
            });

            this.setupBackupViewEvents(defer);
            Radio.request('global', 'region:show', 'brand', this.view);

            return defer.promise;
        },

        /**
         * Setup events for backup view
         */
        setupBackupViewEvents: function(defer) {
            this.view.once('confirm:download', this.downloadBackup.bind(this), this);
            this.view.once('next:step', defer.resolve, defer);
        },

        downloadBackup: function() {
            Radio.request('importExport', 'export', this.rawData);
        },

        /**
         * Delete current secure key from session storage and reload the page.
         */
        redirect: function() {
            this.deleteSecureKey();
            this.navigateToNotes();
            window.location.reload();
        },

        /**
         * Delete secure key from session storage
         */
        deleteSecureKey: function() {
            this.vent.request('delete:secureKey');
        },

        /**
         * Navigate to notes page
         */
        navigateToNotes: function() {
            Radio.request('uri', 'navigate', '/notes', {
                includeProfile : true,
                trigger        : false
            });
        }

    });

    return Controller;
});