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
            var self = this;

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
                self.vent.request('check:password', data.old);
            }
            // Switch to new configs and check new password
            if (data.password) {
                this.vent.request('change:configs', this.configs);
                self.vent.request('check:password', data.password);
            }

            return Q.all([
                data.old ? self.vent.request('check:password', data.old) : new Q(true),
                data.password ? self.vent.request('check:password', data.password) : new Q(true)
            ])
            .then(function(results) {
                if (!results.length || _.indexOf(results, false) > -1) {
                    return self.view.trigger('password:invalid', results);
                }

                self.passwords = data;
                Radio.trigger('Encryption', 'password:valid');
            });
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            var self = this,
                profile  = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db'),
                promises = [];

            this.rawData = {};
            this.rawData[profile] = this.prepareConfigs();

            // Re-encrypt every profile
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

            return Q.all(promises)
            .then(this.resetBackup)
            .then(this.showBackup)
            .then(this.redirect)
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Prepare configuration values for encryption.
         * @returns {Object} Prepared configs.
         */
        prepareConfigs: function() {
            return _.map(this.configs, function(item, key) {
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
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            var self = this,
                promises = [],
                pageSize = 0;

            options          = options || this.options;
            options.pageSize = pageSize;

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
            .then(this.encrypt)
            .then(this.saveChanges);
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {

            // Encryption is disabled
            if (Number(this.configs.encrypt) === 0) {
                _.each(this.collections, function(collection) {
                    collection.each(function(model) {
                        model.set('encryptedData', null);
                    });
                });
                return new Q();
            }

            var self = this,
                promises = [];

            // Use new encryption configs
            this.vent.request('change:configs', this.configs);

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

            return this.vent.request('save:secureKey', this.passwords.password)
            .then(function() {
                return Q.all(promises);
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
            var self = this,
                promises = [];

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                });
            });

            return Q.all(promises);
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