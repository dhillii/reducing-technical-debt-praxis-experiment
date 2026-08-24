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

        /**
         * Display encryption view.
         */
        show: function(profiles) {
            this.profiles = profiles;

            this.view = new View({
                collections : this.collectionNames,
                configs     : this.configs
            });
            Radio.request('global', 'region:show', 'brand', this.view);
            this.listenTo(this.view, 'check:passwords', this.checkPasswords);
        },

        /**
         * Validate old and/or new passwords.
         *
         * Falls back to using new password as old if encryption was previously enabled
         * but no old password was provided.
         */
        checkPasswords: function(data) {
            const self = this;

            // Create mutable copy of input data to avoid unintended mutation
            const passwords = _.clone(data);

            // If encryption was enabled previously, but old password not provided, use new one
            if (Number(this.backup.encrypt) && !passwords.old && passwords.password) {
                passwords.old = passwords.password;
            }

            const promises = [];

            if (passwords.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', passwords.old));
            }

            if (passwords.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', passwords.password));
            }

            return Q.all(promises)
            .then(results => {
                if (!results.length || results.includes(false)) {
                    self.view.trigger('password:invalid', results);
                    return;
                }

                self.passwords = passwords;
                Radio.trigger('Encryption', 'password:valid');
            });
        },

        /**
         * Initialize encryption.
         *
         * Steps:
         * 1. Prepare raw dataset for all profiles
         * 2. Re-encrypt all profiles one-by-one using old credentials
         * 3. Switch to new configs and re-encrypt collections
         * 4. Show backup confirmation
         * 5. Redirect to notes
         */
        initEncrypt: function() {
            const profile  = this.profiles.length === 1 ? this.profiles[0] : 'notes-db';
            this.rawData   = {};
            this.rawData[profile] = {configs: this._buildRawConfigurations()};

            const promises = this.profiles.map(p => this.reencryptProfileWithOldCredentials(p));

            return _.reduce(promises, Q.when, new Q())
            .then(() => this.resetBackup())
            .then(() => this.showBackup())
            .then(() => this.redirect())
            .fail(() => console.error('Error!', arguments));
        },

        /**
         * Re-encrypt a single profile using the old password.
         */
        reencryptProfileWithOldCredentials: function(profile) {
            const self = this;

            return function() {
                self.vent.request('change:configs', self.backup);
                return self.vent.request('save:secureKey', self.passwords.old)
                .then(() => self.encryptProfile({profile}));
            };
        },

        /**
         * Build raw configuration data model.
         */
        _buildRawConfigurations: function() {
            return _.map(this.configs, (value, key) => {
                if (key === 'encrypt') {
                    value = '0';
                } else if (key === 'encryptBackup') {
                    value = {};
                } else if (key === 'appProfiles') {
                    value = JSON.stringify(value);
                }

                return {name: key, value};
            });
        },

        /**
         * Fetch and re-encrypt a profile’s collections.
         */
        encryptProfile: function(options) {
            const self = this;
            const opts = _.defaults(options || {}, {pageSize: 0});
            this.rawData[opts.profile] = this.rawData[opts.profile] || {};

            const promises = this.collectionNames.map(name =>
                new Q(Radio.request(name, 'fetch', opts))
            );

            return Q.all(promises)
            .then spreadResults =>
                self._processFetchedCollections(spreadResults, opts.profile)
            )
            .then(() => self.encrypt())
            .then(() => self.saveChanges());
        },

        /**
         * Store fetched collections and notify view.
         */
        _processFetchedCollections: function(collections, profile) {
            const self = this;

            self.collections = _.chain(collections)
                .filter(collection => collection.length > 0)
                .tap(collections =>
                    collections.forEach(collection => {
                        self.rawData[profile][collection.storeName] = collection.toJSON();
                    })
                )
                .value();

            self.view.trigger('encrypt:init', self.Collections.length);
        },

        /**
         * Re-encrypt all selected collections using the new config.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this._disableEncryption();
                return;
            }

            this.vent.request('change:configs', this.configs);

            const promises = _.map(this.collections, collection => {
                return () => this.vent.request('encrypt:models', collection)
                .then(() => this.checkEncryption(collection));
            });

            return this.vent.request('save:secureKey', this.passwords.password)
            .then(() => _.reduce(promises, Q.when, new Q()));
        },

        /**
         * Disable encryption for all collections by clearing encryptedData.
         */
        _disableEncryption: function() {
            _.each(this.collections, collection => {
                collection.each(model => model.set('encryptedData', null));
            });
        },

        /**
         * Validate encryption by checking if decryption succeeds for the first model.
         */
        checkEncryption: function(collection) {
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
         * Save all encrypted collections.
         */
        saveChanges: function() {
            const promises = _.map(this.collections, collection => {
                return () => new Q(Radio.request(collection.storeName, 'save:collection', collection));
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Reset encryption-related configs.
         */
        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

        /**
         * Prompt user to download backup data before moving forward.
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

        /**
         * Trigger export of raw data for backup.
         */
        downloadBackup: function() {
            Radio.request('importExport', 'export', this.rawData);
        },

        /**
         * Clean up and navigate to notes.
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