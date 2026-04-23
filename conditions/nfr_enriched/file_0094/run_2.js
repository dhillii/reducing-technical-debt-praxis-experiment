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
         * Handles old password fallback when encryption was previously enabled.
         */
        _handleOldPasswordFallback: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Builds promises for password validation against backup and new configs.
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
         * Validates password check results and triggers appropriate events.
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
            this._handleOldPasswordFallback(data);
            const promises = this._buildPasswordPromises(data);

            return Q.all(promises)
            .then((results) => this._validatePasswordResults(results, data));
        },

        /**
         * Transforms config object into array of name-value pairs for storage.
         */
        _transformConfigsToArray: function() {
            return _.map(this.configs, (item, key) => {
                let transformedItem = item;

                if (key === 'encrypt') {
                    transformedItem = '0';
                } else if (key === 'encryptBackup') {
                    transformedItem = {};
                } else if (key === 'appProfiles') {
                    transformedItem = JSON.stringify(item);
                }

                return {name: key, value: transformedItem};
            });
        },

        /**
         * Initializes raw data structure with configs for the primary profile.
         */
        _initializeRawData: function(profile) {
            this.rawData = {};
            this.rawData[profile] = {
                configs: this._transformConfigsToArray()
            };
        },

        /**
         * Creates a promise chain for re-encrypting a single profile.
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
            this._initializeRawData(profile);

            const promises = _.map(this.profiles, (prof) => 
                this._createProfileEncryptionPromise(prof)
            );

            return _.reduce(promises, Q.when, new Q())
            .then(() => this.resetBackup())
            .then(() => this.showBackup())
            .then(() => this.redirect())
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Fetches all collections for a given profile.
         */
        _fetchCollections: function(options) {
            const promises = [];

            _.each(this.collectionNames, (name) => {
                promises.push(new Q(Radio.request(name, 'fetch', options)));
            });

            return Q.all(promises);
        },

        /**
         * Filters and stores non-empty collections, initializing raw data storage.
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
         * Handles encryption when encryption is disabled.
         */
        _disableEncryption: function() {
            _.each(this.collections, (collection) => {
                collection.each((model) => {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Creates promise chain for encrypting each collection.
         */
        _createCollectionEncryptionPromises: function() {
            const promises = [];

            _.each(this.collections, (collection) => {
                promises.push(() => {
                    return this.vent.request('encrypt:models', collection)
                    .then(() => this.checkEncryption(collection));
                });
            });

            return promises;
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this._disableEncryption();
                return;
            }

            const promises = this._createCollectionEncryptionPromises();

            this.vent.request('change:configs', this.configs);

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
         * Creates promise chain for saving each collection.
         */
        _createCollectionSavePromises: function() {
            const promises = [];

            _.each(this.collections, (collection) => {
                promises.push(() => {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                });
            });

            return promises;
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const promises = this._createCollectionSavePromises();
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