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

            this.configs = Radio.request('configs', 'get:object');
            this.backup = _.extend({}, this.configs, this.configs.encryptBackup);

            this.vent.request('delete:secureKey');

            Radio.request('configs', 'get:profiles')
                .then(this.show)
                .fail(this.handleGetProfilesError);

            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
        },

        onDestroy: function() {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        /**
         * Handle error when fetching profiles.
         */
        handleGetProfilesError: function(e) {
            console.error('Error:', e);
        },

        /**
         * Display profiles and initialize view.
         */
        show: function(profiles) {
            this.profiles = profiles;

            this.view = new View({
                collections: this.collectionNames,
                configs: this.configs
            });

            Radio.request('global', 'region:show', 'brand', this.view);

            this.listenTo(this.view, 'check:passwords', this.checkPasswords);
        },

        /**
         * Validate old and new passwords against encryption configs.
         */
        checkPasswords: function(data) {
            this.preparePasswordData(data);

            var promises = [];

            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }

            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }

            return Q.all(promises)
                .then(this.handlePasswordValidation);
        },

        /**
         * Prepare password data for validation.
         */
        preparePasswordData: function(data) {
            if (Number(this.backup.encrypt) && !data.old && data.password) {
                data.old = data.password;
            }
        },

        /**
         * Handle password validation results.
         */
        handlePasswordValidation: function(results) {
            if (!results.length || _.indexOf(results, false) > -1) {
                return this.view.trigger('password:invalid', results);
            }

            this.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Initialize encryption process for all profiles.
         */
        initEncrypt: function() {
            var profile = this.selectProfile();
            this.rawData = {};
            this.rawData[profile] = this.prepareRawData(profile);

            var promises = [];

            _.each(this.profiles, function(profile) {
                promises.push(this.encryptProfile({
                    profile: profile
                }));
            }, this);

            return Q.all(promises)
                .then(this.resetBackup)
                .then(this.showBackup)
                .then(this.redirect)
                .fail(this.handleEncryptionError);
        },

        /**
         * Select default profile for encryption.
         */
        selectProfile: function() {
            return this.profiles.length === 1 ? this.profiles[0] : 'notes-db';
        },

        /**
         * Prepare raw data configuration for encryption.
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
         * Handle encryption errors.
         */
        handleEncryptionError: function() {
            console.error('Error!', arguments);
        },

        /**
         * Fetch collections and start encryption process.
         */
        encryptProfile: function(options) {
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            var promises = [];

            _.each(this.collectionNames, function(name) {
                promises.push(new Q(Radio.request(name, 'fetch', options)));
            });

            return Q.all(promises)
                .then(this.processCollections)
                .then(this.encrypt)
                .then(this.saveChanges);
        },

        /**
         * Process fetched collections for encryption.
         */
        processCollections: function() {
            var self = this;

            this.collections = _.filter(arguments, function(collection) {
                self.rawData[self.options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });

            this.view.trigger('encrypt:init', this.collections.length);
        },

        /**
         * Encrypt all collections with current encryption configuration.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                return this.decryptAllCollections();
            }

            this.vent.request('change:configs', this.configs);

            var promises = [];

            _.each(this.collections, function(collection) {
                promises.push(this.encryptCollection(collection));
            }, this);

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(function() {
                    return Q.all(promises);
                });
        },

        /**
         * Decrypt all collections when encryption is disabled.
         */
        decryptAllCollections: function() {
            var self = this;

            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Encrypt a single collection.
         */
        encryptCollection: function(collection) {
            return this.vent.request('encrypt:models', collection)
                .then(this.checkEncryption);
        },

        /**
         * Validate encryption by decrypting and comparing a sample model.
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
                promises.push(new Q(Radio.request(collection.storeName, 'save:collection', collection)));
            });

            return Q.all(promises);
        },

        /**
         * Remove backup encryption configuration.
         */
        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Display backup download view.
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
         * Export and download backup data.
         */
        downloadBackup: function() {
            Radio.request('importExport', 'export', this.rawData);
        },

        /**
         * Clear secure key and reload page.
         */
        redirect: function() {
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
```