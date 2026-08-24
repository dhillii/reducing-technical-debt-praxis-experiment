},

        checkPasswords: function(data) {
            const self     = this,
                promises = [];

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
            const promises = [],
                profile  = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db'),
                self     = this;

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

            return _.reduce(promises, Q.when, new Q())
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
            const promises = [],
                self     = this;

            // Fetch options
            options          = options || this.options;
            options.pageSize = 0;

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
                return;
            }

            const promises = [],
                self     = this;

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
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const promises = [];

            _.each(this.collections, function(collection) {
                promises.push(function() {
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