},

        checkPasswords: function(data) {
            var self = this;
            var promises = [];

            this._preparePasswordData(data);
            this._addOldPasswordCheck(data, promises);
            this._addNewPasswordCheck(data, promises);

            return Q.all(promises)
            .then(function(results) {
                return self._handlePasswordCheckResults(results, data);
            });
        },

        /**
         * Prepare password data by falling back to new password if old is missing.
         */
        _preparePasswordData: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Add promise to check old password using backup configs.
         */
        _addOldPasswordCheck: function(data, promises) {
            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }
        },

        /**
         * Add promise to check new password using current configs.
         */
        _addNewPasswordCheck: function(data, promises) {
            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }
        },

        /**
         * Handle password check results and trigger appropriate events.
         */
        _handlePasswordCheckResults: function(results, data) {
            if (!results.length || _.indexOf(results, false) > -1) {
                this.view.trigger('password:invalid', results);
                return;
            }

            this.passwords = data;
            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            var profile = this._determineProfile();
            this._initializeRawData(profile);
            var promises = this._buildReencryptionPromises();

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
         */
        _determineProfile: function() {
            return (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
        },

        /**
         * Initialize rawData object with profile configuration data.
         */
        _initializeRawData: function(profile) {
            this.rawData = {};
            this.rawData[profile] = {configs: _.map(this.configs, function(item, key) {
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
            })};
        },

        /**
         * Build array of promises for re-encrypting each profile.
         */
        _buildReencryptionPromises: function() {
            var self = this;
            return _.map(this.profiles, function(profile) {
                return function() {
                    self.vent.request('change:configs', self.backup);
                    return self.vent.request('save:secureKey', self.passwords.old)
                    .then(function() {
                        return self.encryptProfile({
                            profile: profile
                        });
                    });
                };
            });
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            options = options || this.options;
            options.pageSize = 0;

            var profile = options.profile;
            this.rawData[profile] = this.rawData[profile] || {};

            var promises = this._buildFetchPromises(options);

            return Q.all(promises)
            .spread(function() {
                return this._processFetchedCollections(arguments, profile);
            }.bind(this))
            .then(this.encrypt)
            .then(this.saveChanges);
        },

        /**
         * Build array of promises to fetch all collections for a profile.
         */
        _buildFetchPromises: function(options) {
            return _.map(this.collectionNames, function(name) {
                return new Q(Radio.request(name, 'fetch', options));
            });
        },

        /**
         * Process fetched collections and prepare for encryption.
         */
        _processFetchedCollections: function(collections, profile) {
            this.collections = _.filter(collections, function(collection) {
                this.rawData[profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            }.bind(this));
            this.view.trigger('encrypt:init', this.collections.length);
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

            var promises = this._buildEncryptionPromises();

            return this.vent.request('save:secureKey', this.passwords.password)
            .then(function() {
                return _.reduce(promises, Q.when, new Q());
            });
        },

        /**
         * Disable encryption by clearing encryptedData on all models.
         */
        _disableEncryption: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
        },

        /**
         * Build array of promises to encrypt each collection.
         */
        _buildEncryptionPromises: function() {
            var self = this;
            return _.map(this.collections, function(collection) {
                return function() {
                    return self.vent.request('encrypt:models', collection)
                    .then(function() {
                        return self.checkEncryption(collection);
                    });
                };
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
            var promises = this._buildSavePromises();

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Build array of promises to save each collection.
         */
        _buildSavePromises: function() {
            var self = this;
            return _.map(this.collections, function(collection) {
                return function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                };
            });
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