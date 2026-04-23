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
         * Handles fallback to new password if old password is missing.
         */
        _handlePasswordFallback: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Builds array of password validation promises.
         */
        _buildPasswordPromises: function(data) {
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
         * Validates password check results.
         */
        _validatePasswordResults: function(results, data) {
            if (!results.length || _.indexOf(results, false) > -1) {
                this.view.trigger('password:invalid', results);
                return false;
            }

            this.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
            return true;
        },

        checkPasswords: function(data) {
            this._handlePasswordFallback(data);
            const promises = this._buildPasswordPromises(data);

            return Q.all(promises)
            .then((results) => this._validatePasswordResults(results, data));
        },

        /**
         * Transforms configs into serializable format.
         */
        _transformConfigsToRawData: function(profile) {
            return _.map(this.configs, function(item, key) {
                if (key === 'encrypt') {
                    return '0';
                }
                if (key === 'encryptBackup') {
                    return {};
                }
                if (key === 'appProfiles') {
                    return JSON.stringify(item);
                }
                return item;
            }).map(function(value, index) {
                const keys = Object.keys(this.configs);
                return {name: keys[index], value: value};
            }, this);
        },

        /**
         * Creates encryption promise for a single profile.
         */
        _createProfileEncryptionPromise: function(profile) {
            return () => {
                this.vent.request('change:configs', this.backup);

                return this.vent.request('save:secureKey', this.passwords.old)
                .then(() => this.encryptProfile({profile: profile}));
            };
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            const profile = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
            const promises = [];

            this.rawData = {};
            this.rawData[profile] = {
                configs: this._transformConfigsToRawData(profile)
            };

            // Re-encrypt every profile
            _.each(this.profiles, (prof) => {
                promises.push(this._createProfileEncryptionPromise(prof));
            });

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
        _fetchCollections: function(options) {
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
        _processCollections: function(options, collections) {
            this.collections = _.filter(collections, (collection) => {
                this.rawData[options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });
            this.view.trigger('encrypt:init', this.collections.length);
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            return this._fetchCollections(options)
            .spread((...collections) => {
                this._processCollections(options, collections);
            })
            .then(() => this.encrypt())
            .then(() => this.saveChanges());
        },

        /**
         * Handles encryption when disabled.
         */
        _disableEncryption: function() {
            _.each(this.collections, (collection) => {
                collection.each((model) => {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Creates encryption promise for a single collection.
         */
        _createCollectionEncryptionPromise: function(collection) {
            return () => {
                return this.vent.request('encrypt:models', collection)
                .then(() => this.checkEncryption(collection));
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

            // Use new encryption configs
            this.vent.request('change:configs', this.configs);

            // Encrypt every collection
            _.each(this.collections, (collection) => {
                promises.push(this._createCollectionEncryptionPromise(collection));
            });

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
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const promises = [];

            _.each(this.collections, (collection) => {
                promises.push(() => {
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