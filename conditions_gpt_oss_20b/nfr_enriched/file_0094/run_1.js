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

    var Controller = Marionette.Object.extend({

        collectionNames : ['notes', 'tags', 'notebooks'],
        collections     : {},

        initialize: function(options) {
            _.bindAll(this, 'saveChanges', 'encrypt', 'redirect', 'show', 'encryptProfile', 'showBackup');

            this.options = options;
            this.vent    = Radio.channel('encrypt');

            this.configs = Radio.request('configs', 'get:object');
            this.backup  = _.extend({}, this.configs, this.configs.encryptBackup);

            this.vent.request('delete:secureKey');

            Radio.request('configs', 'get:profiles')
                .then(this.show)
                .fail(function(e) {
                    console.error('Error:', e);
                });

            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
        },

        onDestroy: function() {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        show: function(profiles) {
            this.profiles = profiles;

            this.view = new View({
                collections : this.collectionNames,
                configs     : this.configs
            });
            Radio.request('global', 'region:show', 'brand', this.view);

            this.listenTo(this.view, 'check:passwords', this.checkPasswords);
        },

        checkPasswords: function(data) {
            const promises = [];

            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }

            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }
            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }

            return Q.all(promises)
                .then((results) => {
                    if (!results.length || _.indexOf(results, false) > -1) {
                        return this.view.trigger('password:invalid', results);
                    }

                    this.passwords = data;
                    Radio.trigger('Encryption', 'password:valid');
                });
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            const profile = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
            this.rawData = {};
            this.rawData[profile] = {configs: this._buildRawConfigs()};

            const profilePromises = this._createProfilePromises();

            return Q.all(profilePromises)
                .then(this.resetBackup)
                .then(this.showBackup)
                .then(this.redirect)
                .fail(() => {
                    console.error('Error!', arguments);
                });
        },

        /**
         * Build raw configuration data for the initial profile.
         * @private
         */
        _buildRawConfigs: function() {
            return _.map(this.configs, (item, key) => {
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
         * Create an array of promises that re-encrypt each profile.
         * @private
         */
        _createProfilePromises: function() {
            const self = this;
            return this.profiles.map((profile) => {
                return () => {
                    self.vent.request('change:configs', self.backup);
                    return self.vent.request('save:secureKey', self.passwords.old)
                        .then(() => self.encryptProfile({profile}));
                };
            });
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            const self = this;
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            const fetchPromises = this.collectionNames.map((name) => {
                return new Q(Radio.request(name, 'fetch', options));
            });

            return Q.all(fetchPromises)
                .spread(() => {
                    self.collections = _.filter(arguments, (collection) => {
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
            if (Number(this.configs.encrypt) === 0) {
                this.collections.forEach((collection) => {
                    collection.each((model) => {
                        model.set('encryptedData', null);
                    });
                });
                return;
            }

            const self = this;
            this.vent.request('change:configs', this.configs);

            const encryptPromises = this.collections.map((collection) => {
                return () => {
                    return self.vent.request('encrypt:models', collection)
                        .then(() => self.checkEncryption(collection));
                };
            });

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(() => {
                    return _.reduce(encryptPromises, Q.when, new Q());
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
                .fail((e) => {
                    console.error('Encryption error:', e);
                    throw new Error('Error with encryption');
                });
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const promises = this.collections.map((collection) => {
                return () => {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                };
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