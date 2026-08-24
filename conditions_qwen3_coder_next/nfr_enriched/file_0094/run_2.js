},

        checkPasswords: function(data) {
            const self = this;
            const promises = [];

            this._adjustOldPassword(data);
            this._addPasswordCheckPromises(data, promises);

            return Q.all(promises)
                .then(results => this._handlePasswordCheckResults(results, data));
        },

        _adjustOldPassword: function(data) {
            if (Number(this.backup.encrypt) && !data.old && data.password) {
                data.old = data.password;
            }
        },

        _addPasswordCheckPromises: function(data, promises) {
            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }

            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }
        },

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
            const profile = this._determineProfile();
            this._prepareRawData(profile);

            const promises = this._buildReencryptionPromises();

            return _.reduce(promises, Q.when, new Q())
                .then(this.resetBackup)
                .then(this.showBackup)
                .then(this.redirect)
                .fail(() => console.error('Error!', arguments));
        },

        _determineProfile: function() {
            return this.profiles.length === 1 ? this.profiles[0] : 'notes-db';
        },

        _prepareRawData: function(profile) {
            this.rawData = {};
            this.rawData[profile] = {
                configs: _.map(this.configs, (item, key) => {
                    if (key === 'encrypt') {
                        item = '0';
                    } else if (key === 'encryptBackup') {
                        item = {};
                    } else if (key === 'appProfiles') {
                        item = JSON.stringify(item);
                    }
                    return {name: key, value: item};
                })
            };
        },

        _buildReencryptionPromises: function() {
            const self = this;
            return _.map(this.profiles, profile => () =>
                this.vent.request('change:configs', this.backup)
                    .then(() => this.vent.request('save:secureKey', this.passwords.old))
                    .then(() => this.encryptProfile({profile}))
            );
        },

        /**
         * Start encryption process
         */
        encryptProfile: function(options) {
            const opts = _.defaults(options || {}, this.options);
            opts.pageSize = 0;

            this.rawData[opts.profile] = this.rawData[opts.profile] || {};

            const promises = this._buildFetchPromises(opts);

            return Q.all(promises)
                .spread(() => this._processFetchedCollections(opts))
                .then(() => this.encrypt())
                .then(() => this.saveChanges());
        },

        _buildFetchPromises: function(options) {
            return _.map(this.collectionNames, name =>
                new Q(Radio.request(name, 'fetch', options))
            );
        },

        _processFetchedCollections: function(options) {
            const self = this;
            const collections = _.filter(arguments, collection => {
                self.rawData[options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });

            self.collections = collections;
            self.view.trigger('encrypt:init', collections.length);
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

        _disableEncryption: function() {
            _.each(this.collections, collection => {
                collection.each(model => model.set('encryptedData', null));
            });
        },

        _buildEncryptionPromises: function() {
            const self = this;
            return _.map(this.collections, collection => () =>
                self.vent.request('encrypt:models', collection)
                    .then(() => self.checkEncryption(collection))
            );
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
            const promises = _.map(this.collections, collection => () =>
                new Q(Radio.request(collection.storeName, 'save:collection', collection))
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
                includeProfile: true,
                trigger: false
            });
            window.location.reload();
        }

    });

    return Controller;
});