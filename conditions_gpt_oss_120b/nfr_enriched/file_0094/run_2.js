/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not been distributed with this
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
], function (Q, _, Marionette, Radio, View, BackupView) {
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
        collectionNames: ['notes', 'tags', 'notebooks'],
        collections: {},

        initialize: function (options) {
            _.bindAll(this, 'saveChanges', 'encrypt', 'redirect', 'show', 'encryptProfile', 'showBackup');

            this.options = options;
            this.vent = Radio.channel('encrypt');

            // Configs
            this.configs = Radio.request('configs', 'get:object');
            this.backup = _.extend({}, this.configs, this.configs.encryptBackup);

            // Just to be safe remove current secure key from the session
            this.vent.request('delete:secureKey');

            // Show the view
            Radio.request('configs', 'get:profiles')
                .then(this.show)
                .fail(e => console.error('Error:', e));

            // Events
            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
        },

        onDestroy: function () {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        show: function (profiles) {
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

        /**
         * Validate provided passwords against current and backup configs.
         */
        checkPasswords: function (data) {
            const promises = [];

            // If encryption was enabled in old configs but the old password
            // was not provided by the user, try to use the new password instead.
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
                .then(results => {
                    if (!results.length || _.indexOf(results, false) > -1) {
                        return this.view.trigger('password:invalid', results);
                    }

                    this.passwords = data;
                    Radio.trigger('Encryption', 'password:valid');
                });
        },

        /**
         * Initialize encryption after passwords have been validated.
         */
        initEncrypt: function () {
            const profile = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');

            this.rawData = {};
            this._buildRawData(profile);

            const profilePromises = this._createProfilePromises();

            return _.reduce(profilePromises, Q.when, new Q())
                .then(this.resetBackup)
                .then(this.showBackup)
                .then(this.redirect)
                .fail(() => console.error('Error!', arguments));
        },

        /**
         * Build raw data structure for a given profile.
         * @private
         */
        _buildRawData: function (profile) {
            this.rawData[profile] = {
                configs: _.map(this.configs, (item, key) => {
                    if (key === 'encrypt') {
                        item = '0';
                    }
                    if (key === 'encryptBackup') {
                        item = {};
                    }
                    if (key === 'appProfiles') {
                        item = JSON.stringify(item);
                    }
                    return { name: key, value: item };
                })
            };
        },

        /**
         * Create an array of functions that encrypt each profile.
         * @private
         */
        _createProfilePromises: function () {
            const self = this;
            return _.map(this.profiles, profile => () => {
                // Use backup configs
                self.vent.request('change:configs', self.backup);

                // Generate PBKDF2 before starting re-encryption
                return self.vent.request('save:secureKey', self.passwords.old)
                    .then(() => self.encryptProfile({ profile }));
            });
        },

        /**
         * Start encryption process for a specific profile.
         */
        encryptProfile: function (options) {
            const self = this;
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            const fetchPromises = _.map(this.collectionNames, name =>
                new Q(Radio.request(name, 'fetch', options))
            );

            // After the collections are fetched, start re-encryption process.
            return Q.all(fetchPromises)
                .spread(function () {
                    // Re-encrypt the collections that are not empty
                    self.collections = _.filter(arguments, collection => {
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
        encrypt: function () {
            // Encryption is disabled
            if (Number(this.configs.encrypt) === 0) {
                _.each(this.collections, collection => {
                    collection.each(model => model.set('encryptedData', null));
                });
                return;
            }

            const self = this;
            const encryptPromises = _.map(this.collections, collection => () =>
                self.vent.request('encrypt:models', collection)
                    .then(() => self.checkEncryption(collection))
            );

            // Use new encryption configs
            this.vent.request('change:configs', this.configs);

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(() => _.reduce(encryptPromises, Q.when, new Q()));
        },

        /**
         * Validate encryption by decrypting the first model of a collection.
         */
        checkEncryption: function (collection) {
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
         * Save all changes in every collection.
         */
        saveChanges: function () {
            const savePromises = _.map(this.collections, collection => () =>
                new Q(Radio.request(collection.storeName, 'save:collection', collection))
            );

            return _.reduce(savePromises, Q.when, new Q());
        },

        /**
         * Remove backup configs after successful encryption.
         */
        resetBackup: function () {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Show backup view and return a promise resolved on next step.
         */
        showBackup: function () {
            const defer = Q.defer();

            this.view = new BackupView({
                data: this.rawData
            });

            this.view.once('confirm:download', this.downloadBackup, this);
            this.view.once('next:step', defer.resolve, defer);
            Radio.request('global', 'region:show', 'brand', this.view);

            return defer.promise;
        },

        downloadBackup: function () {
            Radio.request('importExport', 'export', this.rawData);
        },

        /**
         * Delete current secure key from session storage and reload the page.
         */
        redirect: function () {
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