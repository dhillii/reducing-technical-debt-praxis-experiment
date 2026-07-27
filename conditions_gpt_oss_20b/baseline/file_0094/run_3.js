define([
    'q',
    'underscore',
    'marionette',
    'backbone.radio',
    'apps/encryption/encrypt/view',
    'apps/encryption/encrypt/backupView'
], function(Q, _, Marionette, Radio, View, BackupView) {
    'use strict';

    const Controller = Marionette.Object.extend({

        collectionNames : ['notes', 'tags', 'notebooks'],
        collections     : {},

        initialize: function(options) {
            _.bindAll(this, 'saveChanges', 'encrypt', 'redirect', 'show', 'encryptProfile', 'showBackup');

            this.options = options;
            this.vent    = Radio.channel('encrypt');

            this.configs = Radio.request('configs', 'get:object');
            this.backup  = _.extend({}, this.configs, this.configs.encryptBackup);

            this.vent.request('delete:secureKey');

            Radio.request('configs', 'get:profiles')
            .then(this.show)
            .fail(function(e) {
                console.error('Error:', e);
            });

            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
        },

        onDestroy: function() {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        show: function(profiles) {
            this.profiles = profiles;

            this.view = new View({
                collections : this.collectionNames,
                configs     : this.configs
            });
            Radio.request('global', 'region:show', 'brand', this.view);

            this.listenTo(this.view, 'check:passwords', this.checkPasswords);
        },

        checkPasswords: function(data) {
            const self     = this;
            const promises = [];

            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }

            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }
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

        initEncrypt: function() {
            const promises = [];
            const profile  = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
            const self     = this;

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

            _.each(this.profiles, function(profile) {
                promises.push(function() {
                    self.vent.request('change:configs', self.backup);

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

        encryptProfile: function(options) {
            const promises = [];
            const self     = this;

            options          = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            _.each(this.collectionNames, function(name) {
                promises.push(
                    new Q(Radio.request(name, 'fetch', options))
                );
            });

            return Q.all(promises)
            .spread(function() {
                self.collections = _.filter(arguments, function(collection) {
                    self.rawData[options.profile][collection.storeName] = collection.toJSON();
                    return collection.length > 0;
                });
                self.view.trigger('encrypt:init', self.collections.length);
            })
            .then(this.encrypt)
            .then(this.saveChanges);
        },

        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                _.each(this.collections, function(collection) {
                    collection.each(function(model) {
                        model.set('encryptedData', null);
                    });
                });
                return;
            }

            const promises = [];
            const self     = this;

            this.vent.request('change:configs', this.configs);

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

        saveChanges: function() {
            const promises = [];

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                });
            });

            return _.reduce(promises, Q.when, new Q());
        },

        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

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