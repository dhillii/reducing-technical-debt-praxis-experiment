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
     * Build raw data structure for a given profile.
     * @private
     * @param {Object} controller
     * @param {String} profile
     * @returns {Object}
     */
    function buildRawData(controller, profile) {
        const raw = {};
        raw[profile] = {
            configs: _.map(controller.configs, function(item, key) {
                if (key === 'encrypt') {
                    return { name: key, value: '0' };
                }
                if (key === 'encryptBackup') {
                    return { name: key, value: {} };
                }
                if (key === 'appProfiles') {
                    return { name: key, value: JSON.stringify(item) };
                }
                return { name: key, value: item };
            })
        };
        return raw;
    }

    /**
     * Fetch all collections for a profile.
     * @private
     * @param {Object} controller
     * @param {String} profile
     * @param {Object} options
     * @returns {Promise}
     */
    function fetchCollections(controller, profile, options) {
        const promises = [];
        const opts = _.extend({}, options, { pageSize: 0, profile });
        controller.collectionNames.forEach(name => {
            promises.push(Q(Radio.request(name, 'fetch', opts)));
        });
        return Q.all(promises).spread(function(...collections) {
            controller.collections = _.filter(collections, col => {
                controller.rawData[profile][col.storeName] = col.toJSON();
                return col.length > 0;
            });
            controller.view.trigger('encrypt:init', controller.collections.length);
        });
    }

    /**
     * Encrypt all collections in controller.collections.
     * @private
     * @param {Object} controller
     * @returns {Promise}
     */
    function encryptCollections(controller) {
        if (Number(controller.configs.encrypt) === 0) {
            controller.collections.forEach(col => {
                col.each(model => model.set('encryptedData', null));
            });
            return Q();
        }

        const promises = controller.collections.map(col => {
            return controller.vent.request('encrypt:models', col)
                .then(() => controller.checkEncryption(col));
        });

        return controller.vent.request('save:secureKey', controller.passwords.password)
            .then(() => Q.all(promises));
    }

    /**
     * Save all collections.
     * @private
     * @param {Object} controller
     * @returns {Promise}
     */
    function saveCollectionChanges(controller) {
        const promises = controller.collections.map(col => {
            return Q(Radio.request(col.storeName, 'save:collection', col));
        });
        return Q.all(promises);
    }

    /**
     * Reset backup configuration.
     * @private
     * @param {Object} controller
     * @returns {Promise}
     */
    function resetBackupConfigs(controller) {
        return Q(Radio.request('configs', 'reset:encrypt'));
    }

    /**
     * Show backup view and return a promise that resolves when the user
     * proceeds to the next step.
     * @private
     * @param {Object} controller
     * @returns {Promise}
     */
    function showBackupView(controller) {
        const defer = Q.defer();
        controller.view = new BackupView({ data: controller.rawData });
        controller.view.once('confirm:download', () => controller.downloadBackup(), controller);
        controller.view.once('next:step', defer.resolve, defer);
        Radio.request('global', 'region:show', 'brand', controller.view);
        return defer.promise;
    }

    /**
     * Download backup data.
     * @private
     * @param {Object} controller
     */
    function downloadBackupData(controller) {
        Radio.request('importExport', 'export', controller.rawData);
    }

    /**
     * Redirect to notes after encryption.
     * @private
     * @param {Object} controller
     */
    function redirectToNotes(controller) {
        controller.vent.request('delete:secureKey');
        Radio.request('uri', 'navigate', '/notes', {
            includeProfile: true,
            trigger: false
        });
        window.location.reload();
    }

    var Controller = Marionette.Object.extend({

        collectionNames: ['notes', 'tags', 'notebooks'],
        collections: {},

        initialize(options) {
            _.bindAll(this, 'saveChanges', 'encrypt', 'redirect', 'show', 'encryptProfile', 'showBackup');

            this.options = options;
            this.vent = Radio.channel('encrypt');

            this.configs = Radio.request('configs', 'get:object');
            this.backup = _.extend({}, this.configs, this.configs.encryptBackup);

            this.vent.request('delete:secureKey');

            Radio.request('configs', 'get:profiles')
                .then(this.show)
                .fail(e => console.error('Error:', e));

            this.listenTo(Radio.channel('Encryption'), 'password:valid', this.initEncrypt);
        },

        onDestroy() {
            this.stopListening();
            Radio.request('global', 'region:empty', 'brand');
        },

        show(profiles) {
            this.profiles = profiles;
            this.view = new View({
                collections: this.collectionNames,
                configs: this.configs
            });
            Radio.request('global', 'region:show', 'brand', this.view);
            this.listenTo(this.view, 'check:passwords', this.checkPasswords);
        },

        checkPasswords(data) {
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
                .then(results => {
                    if (!results.length || _.indexOf(results, false) > -1) {
                        return this.view.trigger('password:invalid', results);
                    }
                    this.passwords = data;
                    Radio.trigger('Encryption', 'password:valid');
                });
        },

        initEncrypt() {
            const profile = (this.profiles.length === 1 ? this.profiles[0] : 'notes-db');
            this.rawData = buildRawData(this, profile);

            const reencryptPromises = this.profiles.map(profile => {
                return () => {
                    this.vent.request('change:configs', this.backup);
                    return this.vent.request('save:secureKey', this.passwords.old)
                        .then(() => this.encryptProfile({ profile }));
                };
            });

            return _.reduce(reencryptPromises, Q.when, Q())
                .then(() => resetBackupConfigs(this))
                .then(() => showBackupView(this))
                .then(() => redirectToNotes(this))
                .fail(() => console.error('Error!', arguments));
        },

        encryptProfile(options = this.options) {
            options.pageSize = 0;
            this.rawData[options.profile] = this.rawData[options.profile] || {};

            return fetchCollections(this, options.profile, options)
                .then(() => encryptCollections(this))
                .then(() => saveCollectionChanges(this));
        },

        encrypt() {
            return encryptCollections(this);
        },

        checkEncryption(collection) {
            if (!collection.length) {
                return Q();
            }
            const model = collection.at(0);
            return this.vent.request('decrypt:model', model)
                .fail(e => {
                    console.error('Encryption error:', e);
                    throw new Error('Error with encryption');
                });
        },

        saveChanges() {
            return saveCollectionChanges(this);
        },

        resetBackup() {
            return resetBackupConfigs(this);
        },

        showBackup() {
            return showBackupView(this);
        },

        downloadBackup() {
            downloadBackupData(this);
        },

        redirect() {
            redirectToNotes(this);
        }

    });

    return Controller;
});