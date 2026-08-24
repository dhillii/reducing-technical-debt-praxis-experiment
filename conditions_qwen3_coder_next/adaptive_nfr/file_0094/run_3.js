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
            const self   = this;
            const promises = [];

            this._preparePasswordData(data);
            this._buildPasswordCheckPromises(data, promises);

            return Q.all(promises)
                .then(this._handlePasswordValidationResults.bind(this, self, data));
        },

        /**
         * Adjust password data when old password is missing but new one is provided.
         * @param {Object} data - Password input data.
         */
        _preparePasswordData: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Build password validation promises for old/new passwords.
         * @param {Object} data - Password input data.
         * @param {Array}  promises - Array to collect promises.
         */
        _buildPasswordCheckPromises: function(data, promises) {
            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }

            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }
        },

        /**
         * Handle validation result for passwords.
         * @param {Object} self - Controller instance.
         * @param {Object} data - Original password data.
         * @param {Array}  results - Validation results.
         */
        _handlePasswordValidationResults: function(self, data, results) {
            if (!results.length || _.indexOf(results, false) > -1) {
                return self.view.trigger('password:invalid', results);
            }

            self.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            const profile = this._determineProfile();
            const promises = this._buildReencryptionPromises(profile);

            return _.reduce(promises, Q.when, new Q())
                .then(this.resetBackup)
                .then(this.showBackup)
                .then(this.redirect)
                .fail(function() {
                    console.error('Error!', arguments);
                });
        },

        /**
         * Determine which profile to use for encryption initialization.
         * @return {string} Profile name.
         */
        _determineProfile: function() {
            return (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
        },

        /**
         * Build re-encryption promises for all profiles.
         * @param {string} profile - Default profile name.
         * @return {Array} Array of promise-generating functions.
         */
        _buildReencryptionPromises: function(profile) {
            const self = this;
            const promises = [];

            this.rawData = {};
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
                    return {name: key, value: item};
                })
            };

            _.each(this.profiles, function(profile) {
                promises.push(function() {
                    self.vent.request('change:configs', self.backup);

                    return self.vent.request('save:secureKey', self.passwords.old)
                        .then(function() {
                            return self.encryptProfile({profile});
                        });
                });
            });

            return promises;
        },

        /**
         * Start encryption process.
         */
        encryptProfile: function(options) {
            const self = this;
            const proms = [];
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            _.each(this.collectionNames, function(name) {
                proms.push(new Q(Radio.request(name, 'fetch', options)));
            });

            return Q.all(proms)
                .spread(function() {
                    self.collections = _.filter(arguments, function(collection) {
                        self.rawData[options.profile][collection.storeName] = collection.toJSON();
                        return collection.length > 0;
                    });
                    self.view.trigger('encrypt:init', self.collections.length);
                    return self.encrypt();
                })
                .then(function() {
                    return self.saveChanges();
                });
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this._disableEncryption();
                return;
            }

            const self = this;
            const promises = [];

            this.vent.request('change:configs', this.configs);

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return self.vent
                        .request('encrypt:models', collection)
                        .then(function() {
                            return self.checkEncryption(collection);
                        });
                });
            });

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(function() {
                    return _.reduce(promises, Q.when, new Q());
                });
        },

        /**
         * Disable encryption by clearing encryptedData on models.
         */
        _disableEncryption: function() {
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
            const self = this;
            const promises = [];

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                });
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