/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
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
    var Controller = Marionette.Object.extend({

        // Collections to encrypt
        collectionNames : ['notes', 'tags', 'notebooks'],
        collections     : {},

        initialize: function(options) {
            this.options = options;
            this.vent    = Radio.channel('encrypt');

            this.initConfigs();
            this.initEvents();
            this.initView();
        },

        initConfigs: function() {
            this.configs = Radio.request('configs', 'get:object');
            this.backup  = _.extend({}, this.configs, this.configs.encryptBackup);

            this.vent.request('delete:secureKey');

            Radio.request('configs', 'get:profiles')
            .then(this.show)
            .fail(function(e) {
                console.error('Error:', e);
            });
        },

        initEvents: function() {
            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
        },

        initView: function() {
            this.view = new View({
                collections : this.collectionNames,
                configs     : this.configs
            });
            Radio.request('global', 'region:show', 'brand', this.view);

            this.listenTo(this.view, 'check:passwords', this.checkPasswords);
        },

        onDestroy: function() {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        show: function(profiles) {
            this.profiles = profiles;
        },

        checkPasswords: function(data) {
            this.normalizePasswords(data);
            this.validateOldPassword(data);
            this.validateNewPassword(data);
            this.handleValidationResults();
        },

        normalizePasswords: function(data) {
            if (Number(this.backup.encrypt) && (!data.old && data.password)) {
                data.old = data.password;
            }
        },

        validateOldPassword: function(data) {
            if (data.old) {
                this.vent.request('change:configs', this.backup);
                this.vent.request('check:password', data.old);
            }
        },

        validateNewPassword: function(data) {
            if (data.password) {
                this.vent.request('change:configs', this.configs);
                this.vent.request('check:password', data.password);
            }
        },

        handleValidationResults: function() {
            var self = this;
            var promises = [];

            if (Number(this.backup.encrypt) && (!this.passwords.old && this.passwords.password)) {
                promises.push(this.vent.request('check:password', this.passwords.password));
            } else if (this.passwords.old) {
                promises.push(this.vent.request('check:password', this.passwords.old));
            } else if (this.passwords.password) {
                promises.push(this.vent.request('check:password', this.passwords.password));
            }

            if (promises.length === 0) {
                return;
            }

            Q.all(promises)
            .then(function(results) {
                if (!results.length || _.indexOf(results, false) > -1) {
                    self.view.trigger('password:invalid', results);
                } else {
                    self.passwords = data;
                    Radio.trigger('Encryption', 'password:valid');
                }
            });
        },

        initEncrypt: function() {
            var profile = this.selectProfile();
            this.rawData = {};
            this.rawData[profile] = this.prepareRawData(profile);

            var promises = [];
            _.each(this.profiles, function(profile) {
                promises.push(this.reencryptProfile(profile));
            }.bind(this));

            return this.executeEncryptionFlow(promises);
        },

        selectProfile: function() {
            return (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
        },

        prepareRawData: function(profile) {
            var configs = _.map(this.configs, function(item, key) {
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
            return {configs: configs};
        },

        reencryptProfile: function(profile) {
            var self = this;
            return this.vent.request('change:configs', this.backup)
            .then(function() {
                return self.vent.request('save:secureKey', self.passwords.old);
            })
            .then(function() {
                return self.encryptProfile({
                    profile: profile
                });
            });
        },

        executeEncryptionFlow: function(promises) {
            return Q.all(promises)
            .then(this.resetBackup)
            .then(this.showBackup)
            .then(this.redirect)
            .fail(function() {
                console.error('Error!', arguments);
            });
        },

        encryptProfile: function(options) {
            options = options || this.options;
            options.pageSize = 0;

            this.rawData[options.profile] = this.rawData[options.profile] || {};

            var promises = [];
            _.each(this.collectionNames, function(name) {
                promises.push(
                    new Q(Radio.request(name, 'fetch', options))
                );
            });

            return Q.all(promises)
            .spread(this.fetchCollectionsAndInitEncrypt)
            .then(this.encrypt)
            .then(this.saveChanges);
        },

        fetchCollectionsAndInitEncrypt: function() {
            var self = this;
            var collections = _.filter(arguments, function(collection) {
                self.rawData[self.options.profile][collection.storeName] = collection.toJSON();
                return collection.length > 0;
            });
            self.collections = collections;
            self.view.trigger('encrypt:init', self.collections.length);
        },

        encrypt: function() {
            if (Number(this.configs.encrypt) === 0) {
                this.disableEncryption();
                return;
            }

            this.vent.request('change:configs', this.configs);

            var promises = [];
            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return this.vent.request(
                        'encrypt:models', collection
                    ).then(this.checkEncryption.bind(this, collection));
                }.bind(this));
            }.bind(this));

            return this.vent.request('save:secureKey', this.passwords.password)
            .then(function() {
                return Q.all(promises);
            });
        },

        disableEncryption: function() {
            _.each(this.collections, function(collection) {
                collection.each(function(model) {
                    model.set('encryptedData', null);
                });
            });
        },

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

        saveChanges: function() {
            var promises = [];

            _.each(this.collections, function(collection) {
                promises.push(function() {
                    return new Q(Radio.request(collection.storeName, 'save:collection', collection));
                });
            });

            return Q.all(promises);
        },

        resetBackup: function() {
            return new Q(Radio.request('configs', 'reset:encrypt'));
        },

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