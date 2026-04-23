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
     * Build initial raw data structure for encryption.
     * @param {Object} configs
     * @param {Array} profiles
     * @param {Object} passwords
     * @param {Object} backup
     * @returns {Object}
     */
    function buildRawData(configs, profiles, passwords, backup) {
        const rawData = {};
        const profile = (profiles.length === 1 ? profiles[0] : 'notes-db');
        rawData[profile] = {
            configs: _.map(configs, function(item, key) {
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
        return rawData;
    }

    /**
     * Create re-encryption functions for each profile.
     * @param {Array} profiles
     * @param {Object} backup
     * @param {Object} passwords
     * @param {Object} self
     * @returns {Array<Function>}
     */
    function reencryptProfiles(profiles, backup, passwords, self) {
        return profiles.map(function(profile) {
            return function() {
                self.vent.request('change:configs', backup);
                return self.vent.request('save:secureKey', passwords.old)
                    .then(function() {
                        return self.encryptProfile({profile: profile});
                    });
            };
        });
    }

    /**
     * Fetch all collections for a profile.
     * @param {Array} collectionNames
     * @param {Object} options
     * @returns {Array<Promise>}
     */
    function fetchCollections(collectionNames, options) {
        return collectionNames.map(function(name) {
            return new Q(Radio.request(name, 'fetch', options));
        });
    }

    /**
     * Handle fetched collections: store data and trigger init event.
     * @param {Array} collections
     * @param {Object} options
     * @param {Object} rawData
     * @param {Object} self
     * @returns {Array}
     */
    function handleFetchedCollections(collections, options, rawData, self) {
        const filtered = _.filter(collections, function(collection) {
            rawData[options.profile][collection.storeName] = collection.toJSON();
            return collection.length > 0;
        });
        self.view.trigger('encrypt:init', filtered.length);
        return filtered;
    }

    /**
     * Disable encryption by clearing encrypted data.
     * @param {Array} collections
     */
    function encryptDisabled(collections) {
        _.each(collections, function(collection) {
            collection.each(function(model) {
                model.set('encryptedData', null);
            });
        });
    }

    /**
     * Encrypt enabled collections and validate.
     * @param {Array} collections
     * @param {Object} vent
     * @param {Object} passwords
     * @param {Object} self
     * @returns {Promise}
     */
    function encryptEnabled(collections, vent, passwords, self) {
        const promises = collections.map(function(collection) {
            return function() {
                return vent.request('encrypt:models', collection)
                    .then(function() {
                        return self.checkEncryption(collection);
                    });
            };
        });
        return vent.request('save:secureKey', passwords.password)
            .then(function() {
                return _.reduce(promises, Q.when, new Q());
            });
    }

    /**
     * Save changes for all collections.
     * @param {Array} collections
     * @returns {Promise}
     */
    function saveAllCollections(collections) {
        const promises = collections.map(function(collection) {
            return function() {
                return new Q(Radio.request(collection.storeName, 'save:collection', collection));
            };
        });
        return _.reduce(promises, Q.when, new Q());
    }

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
            const self     = this;
            const promises = [];

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
         * Initialize encryption.
         */
        initEncrypt: function() {
            const self     = this;
            const profile  = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');

            this.rawData = buildRawData(this.configs, this.profiles, this.passwords, this.backup);

            // Re-encrypt every profile
            const reencryptFuncs = reencryptProfiles(this.profiles, this.backup, this.passwords, this);

            return _.reduce(reencryptFuncs, Q.when, new Q())
            .then(this.resetBackup)
            .then(this.showBackup)
            .then(this.redirect)
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            const self     = this;
            options          = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            // Fetch all collections in a profile
            const fetchPromises = fetchCollections(this.collectionNames, options);

            return Q.all(fetchPromises)
            .spread(function(...collections) {
                self.collections = handleFetchedCollections(collections, options, self.rawData, self);
            })
            .then(this.encrypt)
            .then(this.saveChanges);
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                encryptDisabled(this.collections);
                return Q.resolve();
            }

            return encryptEnabled(this.collections, this.vent, this.passwords, this);
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
            return saveAllCollections(this.collections);
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