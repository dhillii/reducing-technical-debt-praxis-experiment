},

        checkPasswords: function(data) {
            const self = this;

            this.normalizeOldPassword(data);
            const promises = this.buildPasswordCheckPromises(data);

            return Q.all(promises)
                .then(results => this.handlePasswordCheckResults(results, self));
        },

        /**
         * If encryption was enabled in old configs but the old password
         * was not provided by the user, try to use the new password instead.
         */
        normalizeOldPassword: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        /**
         * Build promises to check passwords (old and new) using appropriate configs.
         */
        buildPasswordCheckPromises: function(data) {
            const promises = [];
            const self     = this;

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
         * Handle result of password checks: trigger invalid if failed,
         * otherwise proceed with encryption initialization.
         */
        handlePasswordCheckResults: function(results, self) {
            if (!results.length || _.indexOf(results, false) > -1) {
                return self.view.trigger('password:invalid', results);
            }

            self.passwords = _.extend({}, self.passwords, {
                old: null,
                password: null
            }, {
                old: results.length > 0 && results[0] !== false ? self.passwords.old : undefined,
                password: results.length > 1 && results[1] !== false ? self.passwords.password : undefined
            });

            Radio.trigger('Encryption', 'password:valid');
        },

        /**
         * Initialize encryption.
         */
        initEncrypt: function() {
            const self     = this;
            const profile  = this.selectProfile();

            this.rawData = {};
            this.rawData[profile] = this.prepareRawData(profile);

            const promises = this.buildEncryptProfilePromises(profile);
            return this.runSequentialPromises(promises)
                .then(() => this.resetBackup())
                .then(() => this.showBackup())
                .then(() => this.redirect())
                .fail(e => console.error('Error!', e));
        },

        /**
         * Select profile to use for encryption initialization.
         */
        selectProfile: function() {
            return this.profiles.length === 1 ? this.profiles[0] : 'notes-db';
        },

        /**
         * Prepare raw data payload with config serialization.
         */
        prepareRawData: function(profile) {
            return {
                configs: _.map(this.configs, (item, key) => {
                    switch (key) {
                        case 'encrypt':
                            return {name: key, value: '0'};
                        case 'encryptBackup':
                            return {name: key, value: {}};
                        case 'appProfiles':
                            return {name: key, value: JSON.stringify(item)};
                        default:
                            return {name: key, value: item};
                    }
                })
            };
        },

        /**
         * Build array of functions to encrypt each profile.
         */
        buildEncryptProfilePromises: function(protocolProfile) {
            const self = this;

            return _.map(this.profiles, profile => function() {
                self.vent.request('change:configs', self.backup);
                return self.vent.request('save:secureKey', self.passwords.old)
                    .then(() => self.encryptProfile({profile}));
            });
        },

        /**
         * Run a list of functions sequentially using Q.when.
         */
        runSequentialPromises: function(promises) {
            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Start encryption process.
         */
        encryptProfile: function(options) {
            const self = this;
            const opts = _.extend({
                pageSize: 0
            }, options || this.options);

            self.rawData[opts.profile] = self.rawData[opts.profile] || {};

            return this.fetchCollections(opts)
                .then(() => self.patchCollectionsData(opts.profile))
                .then(collectionCount => self.view.trigger('encrypt:init', collectionCount))
                .then(() => self.encrypt())
                .then(() => self.saveChanges());
        },

        /**
         * Fetch all collections for the given options.
         */
        fetchCollections: function(options) {
            const promises = _.map(this.collectionNames, name =>
                new Q(Radio.request(name, 'fetch', options))
            );
            return Q.all(promises);
        },

        /**
         * Store fetched collection data and prepare collections array.
         */
        patchCollectionsData: function(profile) {
            const self   = this;
            const args   = Array.prototype.slice.call(arguments, 1);
            const collections = [];

            _.each(this.collectionNames, (name, i) => {
                const collection = args[i];
                self.rawData[profile][collection.storeName] = collection.toJSON();
                if (collection.length > 0) {
                    collections.push(collection);
                }
            });

            self.collections = collections;
            return collections.length;
        },

        /**
         * Encrypt every collection with new encryption configs.
         */
        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this.disableEncryption();
                return;
            }

            const self = this;
            this.vent.request('change:configs', this.configs);

            const promises = _.map(this.collections, collection =>
                function() {
                    return self.vent.request('encrypt:models', collection)
                        .then(() => self.checkEncryption(collection));
                }
            );

            return this.vent.request('save:secureKey', this.passwords.password)
                .then(() => _.reduce(promises, Q.when, new Q()));
        },

        /**
         * Disable encryption by clearing encryptedData on all models.
         */
        disableEncryption: function() {
            _.each(this.collections, collection => {
                collection.each(model => model.set('encryptedData', null));
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

            return this.vent.request('decrypt:model', collection.at(0))
                .fail(e => {
                    console.error('Encryption error:', e);
                    throw new Error('Error with encryption');
                });
        },

        /**
         * Save all changes in every collection.
         */
        saveChanges: function() {
            const self = this;
            const promises = _.map(this.collections, collection =>
                function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                }
            );
            return _.reduce(promises, Q.when, new Q());
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