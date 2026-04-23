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
         * Adjust old password if encryption was previously enabled.
         */
        _adjustOldPassword: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Check old password against backup configs.
         */
        _checkOldPassword: function(data, promises) {
            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }
        },

        /**
         * Check new password against current configs.
         */
        _checkNewPassword: function(data, promises) {
            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }
        },

        /**
         * Handle password validation results.
         */
        _handlePasswordResults: function(results, data) {
            const self = this;
            if (!results.length || _.indexOf(results, false) > -1) {
                return self.view.trigger('password:invalid', results);
            }
            self.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        checkPasswords: function(data) {
            const self     = this;
            const promises = [];

            this._adjustOldPassword(data);
            this._checkOldPassword(data, promises);
            this._checkNewPassword(data, promises);

            return Q.all(promises)
            .then(function(results) {
                self._handlePasswordResults(results, data);
            });
        },

        /**
         * Build raw data structure for configs.
         */
        _buildConfigsRawData: function(profile) {
            const configsData = _.map(this.configs, function(item, key) {
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
            return configsData;
        },

        /**
         * Create re-encryption promise for a profile.
         */
        _createProfileEncryptionPromise: function(profile) {
            const self = this;
            return function() {
                self.vent.request('change:configs', self.backup);
                return self.vent.request('save:secureKey', self.passwords.old)
                .then(function() {
                    return self.encryptProfile({
                        profile: profile
                    });
                });
            };
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            const promises = [];
            const profile  = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
            const self     = this;

            this.rawData = {};
            this.rawData[profile] = {configs: this._buildConfigsRawData(profile)};

            // Re-encrypt every profile
            _.each(this.profiles, function(profileName) {
                promises.push(self._createProfileEncryptionPromise(profileName));
            });

            return _.reduce(promises, Q.when, new Q())
            .then(this.resetBackup)
            .then(this.showBackup)
            .then(this.redirect)
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Fetch all collections for a profile.
         */
        _fetchCollections: function(options) {
            const promises = [];
            _.each(this.collectionNames, function(name) {
                promises.push(
                    new Q(Radio.request(name, 'fetch', options))
                );
            });
            return promises;
        },

        /**
         * Process fetched collections and prepare raw data.
         */
        _processCollections: function(options) {
            const self = this;
            return function() {
                self.collections = _.filter(arguments, function(collection) {
                    self.rawData[options.profile][collection.storeName] = collection.toJSON();
                    return collection.length > 0;
                });
                self.view.trigger('encrypt:init', self.collections.length);
            };
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            const self     = this;

            // Fetch options
            options          = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            const promises = this._fetchCollections(options);

            return Q.all(promises)
            .spread(this._processCollections(options))
            .then(this.encrypt)
            .then(this.saveChanges);
        },

        /**
         * Handle disabled encryption case.
         */
        _disableEncryption: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Create encryption promise for a collection.
         */
        _createCollectionEncryptionPromise: function(collection) {
            const self = this;
            return function() {
                return self.vent.request(
                    'encrypt:models', collection
                ).then(function() {
                    return self.checkEncryption(collection);
                });
            };
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            // Encryption is disabled
            if (Number(this.configs.encrypt) === 0) {
                this._disableEncryption();
                return;
            }

            const promises = [];
            const self     = this;

            // Use new encryption configs
            this.vent.request('change:configs', this.configs);

            // Encrypt every collection
            _.each(this.collections, function(collection) {
                promises.push(self._createCollectionEncryptionPromise(collection));
            });

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
         * Create save promise for a collection.
         */
        _createCollectionSavePromise: function(collection) {
            return function() {
                return new Q(Radio.request(collection.storeName, 'save:collection', collection));
            };
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const promises = [];
            const self = this;

            _.each(this.collections, function(collection) {
                promises.push(self._createCollectionSavePromise(collection));
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