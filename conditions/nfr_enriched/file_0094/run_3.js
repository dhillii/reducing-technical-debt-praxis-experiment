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
         * Normalizes old password if encryption was previously enabled.
         */
        normalizeOldPassword: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Builds password validation promises for old and new passwords.
         */
        buildPasswordValidationPromises: function(data) {
            const promises = [];

            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }

            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }

            return promises;
        },

        /**
         * Handles password validation results.
         */
        handlePasswordValidationResults: function(results, data) {
            if (!results.length || _.indexOf(results, false) > -1) {
                return this.view.trigger('password:invalid', results);
            }

            this.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        checkPasswords: function(data) {
            this.normalizeOldPassword(data);
            const promises = this.buildPasswordValidationPromises(data);

            return Q.all(promises)
            .then((results) => this.handlePasswordValidationResults(results, data));
        },

        /**
         * Transforms config object into array of name-value pairs.
         */
        transformConfigsToArray: function() {
            return _.map(this.configs, (item, key) => {
                let value = item;
                if (key === 'encrypt') {
                    value = '0';
                }
                if (key === 'encryptBackup') {
                    value = {};
                }
                if (key === 'appProfiles') {
                    value = JSON.stringify(item);
                }
                return {name: key, value: value};
            });
        },

        /**
         * Determines the profile to use for encryption.
         */
        getTargetProfile: function() {
            return this.profiles.length === 1 ? this.profiles[0] : 'notes-db';
        },

        /**
         * Initializes raw data structure with configs.
         */
        initializeRawData: function(profile) {
            this.rawData = {};
            this.rawData[profile] = {
                configs: this.transformConfigsToArray()
            };
        },

        /**
         * Creates a promise chain for re-encrypting a single profile.
         */
        createProfileEncryptionPromise: function(profile) {
            return () => {
                this.vent.request('change:configs', this.backup);

                return this.vent.request('save:secureKey', this.passwords.old)
                .then(() => this.encryptProfile({profile: profile}));
            };
        },

        /**
         * Builds promise chain for all profiles.
         */
        buildProfileEncryptionPromises: function() {
            const promises = [];

            _.each(this.profiles, (profile) => {
                promises.push(this.createProfileEncryptionPromise(profile));
            });

            return promises;
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            const profile = this.getTargetProfile();
            this.initializeRawData(profile);

            const promises = this.buildProfileEncryptionPromises();

            return _.reduce(promises, Q.when, new Q())
            .then(() => this.resetBackup())
            .then(() => this.showBackup())
            .then(() => this.redirect())
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Fetches all collections for a profile.
         */
        fetchCollections: function(options) {
            const promises = [];

            _.each(this.collectionNames, (name) => {
                promises.push(
                    new Q(Radio.request(name, 'fetch', options))
                );
            });

            return Q.all(promises);
        },

        /**
         * Filters and stores non-empty collections.
         */
        filterAndStoreCollections: function(collections, profile) {
            this.collections = _.filter(collections, (collection) => {
                this.rawData[profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            return this.fetchCollections(options)
            .then((collections) => {
                this.filterAndStoreCollections(collections, options.profile);
                this.view.trigger('encrypt:init', this.collections.length);
            })
            .then(() => this.encrypt())
            .then(() => this.saveChanges());
        },

        /**
         * Handles encryption when disabled.
         */
        disableEncryption: function() {
            _.each(this.collections, (collection) => {
                collection.each((model) => {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Creates encryption promise for a single collection.
         */
        createCollectionEncryptionPromise: function(collection) {
            return () => {
                return this.vent.request('encrypt:models', collection)
                .then(() => this.checkEncryption(collection));
            };
        },

        /**
         * Builds promise chain for all collections.
         */
        buildCollectionEncryptionPromises: function() {
            const promises = [];

            _.each(this.collections, (collection) => {
                promises.push(this.createCollectionEncryptionPromise(collection));
            });

            return promises;
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this.disableEncryption();
                return;
            }

            this.vent.request('change:configs', this.configs);
            const promises = this.buildCollectionEncryptionPromises();

            return this.vent.request('save:secureKey', this.passwords.password)
            .then(() => _.reduce(promises, Q.when, new Q()));
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
         * Creates save promise for a single collection.
         */
        createCollectionSavePromise: function(collection) {
            return () => {
                return new Q(Radio.request(collection.storeName, 'save:collection', collection));
            };
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const promises = [];

            _.each(this.collections, (collection) => {
                promises.push(this.createCollectionSavePromise(collection));
            });

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
```