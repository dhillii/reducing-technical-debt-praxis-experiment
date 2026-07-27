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
         * Build password validation promises for old and new passwords.
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
         * Handle password validation results.
         */
        _handlePasswordResults: function(results) {
            if (!results.length || _.indexOf(results, false) > -1) {
                this.view.trigger('password:invalid', results);
                return;
            }

            this.passwords = this.pendingPasswordData;
            Radio.trigger('Encryption', 'password:valid');
        },

        checkPasswords: function(data) {
            this._adjustOldPassword(data);
            this.pendingPasswordData = data;

            const promises = this._buildPasswordPromises(data);

            return Q.all(promises)
            .then(this._handlePasswordResults.bind(this));
        },

        /**
         * Build raw data structure for configs.
         */
        _buildRawConfigData: function(profile) {
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
         * Create encryption task for a single profile.
         */
        _createProfileEncryptionTask: function(profile) {
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

            this.rawData = {};
            this.rawData[profile] = {
                configs: this._buildRawConfigData(profile)
            };

            const promises = this.profiles.map(p => this._createProfileEncryptionTask(p));

            return _.reduce(promises, Q.when, new Q())
            .then(this.resetBackup.bind(this))
            .then(this.showBackup.bind(this))
            .then(this.redirect.bind(this))
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        /**
         * Fetch all collections for a profile.
         */
        _fetchCollections: function(options) {
            const promises = this.collectionNames.map(name =>
                new Q(Radio.request(name, 'fetch', options))
            );

            return Q.all(promises);
        },

        /**
         * Process fetched collections and prepare for encryption.
         */
        _processCollections: function(options) {
            return (collections) => {
                this.collections = _.filter(collections, (collection) => {
                    this.rawData[options.profile][collection.storeName] = collection.toJSON();
                    return collection.length > 0;
                });
                this.view.trigger('encrypt:init', this.collections.length);
            };
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            return this._fetchCollections(options)
            .then(this._processCollections(options))
            .then(this.encrypt.bind(this))
            .then(this.saveChanges.bind(this));
        },

        /**
         * Clear encryption from models when encryption is disabled.
         */
        _clearEncryption: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Create encryption task for a single collection.
         */
        _createCollectionEncryptionTask: function(collection) {
            return () => {
                return this.vent.request('encrypt:models', collection)
                .then(() => this.checkEncryption(collection));
            };
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this._clearEncryption();
                return;
            }

            const promises = this.collections.map(collection =>
                this._createCollectionEncryptionTask(collection)
            );

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
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const promises = this.collections.map(collection =>
                () => new Q(Radio.request(collection.storeName, 'save:collection', collection))
            );

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