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
                promises.push(this.validateOldPassword(data.old));
            }
            
            // Switch to new configs and check new password
            if (data.password) {
                this.switchToNewConfigs();
                promises.push(this.validateNewPassword(data.password));
            }

            return this.processPasswordValidation(promises, self, data);
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
         * Validate old password
         */
        validateOldPassword: function(oldPassword) {
            return this.vent.request('check:password', oldPassword);
        },

        /**
         * Validate new password
         */
        validateNewPassword: function(newPassword) {
            return this.vent.request('check:password', newPassword);
        },

        /**
         * Process validation results and trigger appropriate events
         */
        processPasswordValidation: function(promises, context, data) {
            return Q.all(promises)
            .then(function(results) {
                if (!results.length || _.indexOf(results, false) > -1) {
                    return context.view.trigger('password:invalid', results);
                }

                context.passwords = data;
                Radio.trigger('Encryption', 'password:valid');
            });
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
                promises.push(self.createReencryptionPromise(profile, self));
            });

            return this.executeReencryptionChain(promises)
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
         * Create promise for re-encrypting a profile
         */
        createReencryptionPromise: function(profile, context) {
            return function() {
                // Use backup configs
                context.vent.request('change:configs', context.backup);

                // Generate PBKDF2 before starting re-encryption
                return context.vent.request('save:secureKey', context.passwords.old)
                .then(function() {
                    return context.encryptProfile({
                        profile: profile
                    });
                });
            };
        },

        /**
         * Execute the chain of re-encryption promises
         */
        executeReencryptionChain: function(promises) {
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
                // Re-encrypt the collections that are not empty
                self.collections = _.filter(arguments, function(collection) {
                    self.rawData[options.profile][collection.storeName] = collection.toJSON();
                    return collection.length > 0;
                });
                self.view.trigger('encrypt:init', self.collections.length);
            })
            .then(this.encrypt.bind(this))
            .then(this.saveChanges.bind(this));
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
                promises.push(self.createEncryptionPromise(collection, self));
            });

            return this.saveSecureKeyAndExecuteEncryption(promises);
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
         * Create promise for encrypting a collection
         */
        createEncryptionPromise: function(collection, context) {
            return function() {
                return context.vent.request(
                    'encrypt:models', collection
                ).then(function() {
                    return context.checkEncryption(collection);
                });
            };
        },

        /**
         * Save secure key and execute encryption promises
         */
        saveSecureKeyAndExecuteEncryption: function(promises) {
            return this.vent.request('save:secureKey', this.passwords.password)
            .then(function() {
                return _.reduce(promises, Q.when, new Q());
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

            const model = collection.at(0);

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
            const promises = [];
            const self = this;

            _.each(this.collections, function(collection) {
                promises.push(self.createSaveCollectionPromise(collection));
            });

            return this.executeSaveChain(promises);
        },

        /**
         * Create promise for saving a collection
         */
        createSaveCollectionPromise: function(collection) {
            return function() {
                return new Q(Radio.request(collection.storeName, 'save:collection', collection));
            };
        },

        /**
         * Execute the chain of save promises
         */
        executeSaveChain: function(promises) {
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