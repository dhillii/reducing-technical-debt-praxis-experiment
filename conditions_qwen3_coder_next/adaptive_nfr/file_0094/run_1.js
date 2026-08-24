},

        checkPasswords: function(data) {
            const self = this;
            const promises = [];

            this._adjustOldPasswordIfNecessary(data);
            this._addOldPasswordCheckPromise(data, promises);
            this._addNewPasswordCheckPromise(data, promises);

            return Q.all(promises)
                .then(results => this._handlePasswordCheckResults(results, self));
        },

        /**
         * Adjusts old password if encryption was previously enabled but no old password was provided.
         */
        _adjustOldPasswordIfNecessary: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Adds a promise to check the old password if provided.
         */
        _addOldPasswordCheckPromise: function(data, promises) {
            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }
        },

        /**
         * Adds a promise to check the new password if provided.
         */
        _addNewPasswordCheckPromise: function(data, promises) {
            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }
        },

        /**
         * Handles the results of password checks and triggers appropriate events.
         */
        _handlePasswordCheckResults: function(results, self) {
            if (!results.length || _.indexOf(results, false) > -1) {
                self.view.trigger('password:invalid', results);
                return;
            }

            self.passwords = self._clonePasswordData();
            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Clones password data to prevent external mutation.
         */
        _clonePasswordData: function() {
            return _.clone(this.passwords || {});
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            const profile = this._determineProfile();
            this._initializeRawData(profile);
            const promises = this._buildReencryptionPromises();

            return _.reduce(promises, Q.when, new Q())
                .then(this.resetBackup)
                .then(this.showBackup)
                .then(this.redirect)
                .fail(() => console.error('Error!', arguments));
        },

        /**
         * Determines the profile to use for encryption initialization.
         */
        _determineProfile: function() {
            return (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
        },

        /**
         * Initializes raw data structure for the given profile.
         */
        _initializeRawData: function(profile) {
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
        },

        /**
         * Builds an array of promises for re-encrypting each profile.
         */
        _buildReencryptionPromises: function() {
            const self = this;
            const promises = [];

            _.each(this.profiles, function(profile) {
                promises.push(function() {
                    self.vent.request('change:configs', self.backup);
                    return self.vent.request('save:secureKey', self.passwords.old)
                        .then(() => self.encryptProfile({profile}));
                });
            });

            return promises;
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            const self = this;
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            const promises = this._buildFetchCollectionPromises(options);

            return Q.all(promises)
                .spread(() => this._processFetchedCollections(options, self))
                .then(() => this.encrypt())
                .then(() => this.saveChanges());
        },

        /**
         * Builds promises to fetch all collections for the given profile.
         */
        _buildFetchCollectionPromises: function(options) {
            const promises = [];
            _.each(this.collectionNames, name => {
                promises.push(new Q(Radio.request(name, 'fetch', options)));
            });
            return promises;
        },

        /**
         * Processes fetched collections and prepares them for encryption.
         */
        _processFetchedCollections: function(options, self) {
            self.collections = _.filter(arguments, collection => {
                self.rawData[options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });
            self.view.trigger('encrypt:init', self.collections.length);
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this._disableEncryption();
                return;
            }

            this.vent.request('change:configs', this.configs);

            const promises = this._buildEncryptionPromises();

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(() => _.reduce(promises, Q.when, new Q()));
        },

        /**
         * Disables encryption by clearing encryptedData on all models.
         */
        _disableEncryption: function() {
            _.each(this.collections, collection => {
                collection.each(model => {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Builds promises to encrypt each collection.
         */
        _buildEncryptionPromises: function() {
            const self = this;
            const promises = [];

            _.each(this.collections, collection => {
                promises.push(function() {
                    return self.vent.request('encrypt:models', collection)
                        .then(() => self.checkEncryption(collection));
                });
            });

            return promises;
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
                .fail(e => {
                    console.error('Encryption error:', e);
                    throw new Error('Error with encryption');
                });
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const promises = this._buildSavePromises();

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Builds promises to save each collection.
         */
        _buildSavePromises: function() {
            const promises = [];
            _.each(this.collections, collection => {
                promises.push(function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                });
            });
            return promises;
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
                includeProfile: true,
                trigger: false
            });
            window.location.reload();
        }

    });

    return Controller;
});