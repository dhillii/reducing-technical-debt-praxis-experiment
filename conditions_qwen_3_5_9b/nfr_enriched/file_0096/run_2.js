```javascript
/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'underscore',
    'q',
    'marionette',
    'backbone.radio'
], function(_, Q, Marionette, Radio) {
    'use strict';

    /**
     * Collection object from which other collection objects extend.
     *
     * For default it
     *
     * replies to the following requests:
     * 1. save            - save model changes
     * 2. save:collection - save all collection changes
     * 3. save:all:raw    - saves several objects
     * 4. fetch           - fetches models from the database
     * 5. get:model       - returns a specific model
     * 6. get:all         - returns a collection
     * 7. remove          - removes a model
     *
     * and triggers the following events:
     * 1. model:update    - after a model is updated or created
     * 2. destroy:model   - after a model is removed
     */
    var Module = Marionette.Object.extend({
        /**
         * @type object Backbone collection
         */
        Collection: null,

        /**
         * @type string default profile
         */
        defaultDB: 'notes-db',

        /**
         * @type object default replies
         */
        defaultReplies: {
            'save': this.saveModel,
            'save:collection': this.saveCollection,
            'save:raw': this.saveRaw,
            'save:all:raw': this.saveAllRaw,
            'fetch': this.fetch,
            'get:model': this.getModel,
            'get:all': this.getAll,
            'remove': this.remove,
        },

        /**
         * Initialize the module.
         */
        initialize: function() {
            this._bindMethods();
            this._setupRadioChannel();
            this._registerReplies();
            this._setupEventListeners();
        },

        /**
         * Bind methods to instance.
         */
        _bindMethods: function() {
            _.bindAll(this, 'encryptModel', 'decryptModel', 'decryptModels');
        },

        /**
         * Setup Radio channel for communication.
         */
        _setupRadioChannel: function() {
            this.vent = Radio.channel(this.Collection.prototype.storeName);
        },

        /**
         * Register replies with the radio channel.
         */
        _registerReplies: function() {
            var defReply = _.bind(Module.prototype.reply, this);
            this.vent.reply(_.extend(defReply(), this.reply()), this);
        },

        /**
         * Setup event listeners.
         */
        _setupEventListeners: function() {
            this.listenTo(this.vent, 'destroy:collection', this.onReset, this);
        },

        /**
         * Get default replies.
         * @return object
         */
        reply: function() {
            return this.defaultReplies;
        },

        /**
         * Switch to another database (e.g. profile).
         * @param {object} options - options object
         * @return {object} collection
         */
        changeDatabase: function(options) {
            var profile = options && options.profile ? options.profile : this.defaultDB;
            var model = this.Collection.prototype.model.extend({
                profileId: profile,
            });
            var collection = this.Collection.extend({
                profileId: profile,
                model: model,
            });
            return collection;
        },

        /**
         * Stop listening to current collection's events.
         */
        onReset: function() {
            if (!this.collection) {
                return;
            }

            this.stopListening(this.collection);
            if (this.collection.removeEvents) {
                this.collection.removeEvents();
            }
            this.collection.reset([]);
            this.collection = null;
        },

        /**
         * Save changes to a model.
         * @param {object} model - Backbone model
         * @param {object} data - new values
         * @return {Promise}
         */
        save: function(model, data) {
            var setF = model.setEscape ? 'setEscape' : 'set';
            var errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            model[setF](data);

            return this._encryptAndSaveModel(model);
        },

        /**
         * Encrypt and save a model.
         * @param {object} model - Backbone model
         * @return {Promise}
         */
        _encryptAndSaveModel: function(model) {
            return new Q(this.encryptModel(model))
                .then(function(model) {
                    return new Q(model.save(model.attributes, {validate: false}))
                        .thenResolve(model);
                });
        },

        /**
         * Save changes to a model with additional processing.
         * @param {object} model - Backbone model
         * @param {object} data - new values
         * @return {Promise}
         */
        saveModel: function(model, data) {
            data.updated = Date.now();
            if (!model.attributes.created) {
                data.created = Date.now();
            }

            return this.save(model, data)
                .then(function(model) {
                    this.vent.trigger('sync:model', model);
                    return this.decryptModel(model);
                }.bind(this))
                .then(function(model) {
                    this.vent.trigger('update:model', model);
                    return model;
                }.bind(this));
        },

        /**
         * Save all changes in the collection.
         * @param {object} collection - Backbone collection
         * @return {Promise}
         */
        saveCollection: function(collection) {
            collection = collection || this.collection;
            var promises = [];

            collection.each(function(model) {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });

            return Q.all(promises)
                .then(function() {
                    this.vent.trigger('saved:collection');
                    return collection;
                }.bind(this));
        },

        /**
         * Saves raw object to the database.
         * @param {object} data - JSON object
         * @param {object} options - options
         * @return {Promise}
         */
        saveRaw: function(data, options) {
            var model = new (this.changeDatabase(options)).prototype.model(data);

            return this.decryptModel(model)
                .then(function() {
                    var errors = model.validate(model.attributes);

                    if (errors) {
                        console.error('Validation failed:' + model.storeName, errors);
                        return;
                    }

                    return this._saveRawModel(model, data);
                }.bind(this));
        },

        /**
         * Save a raw model with encryption and events.
         * @param {object} model - Backbone model
         * @param {object} data - JSON object
         * @return {Promise}
         */
        _saveRawModel: function(model, data) {
            return this.save(model, data)
                .then(this.decryptModel)
                .then(function(model) {
                    this.vent.trigger('update:model', model);
                    this.vent.trigger('synced:' + model.id, model);
                    return model;
                }.bind(this));
        },

        /**
         * Saves all changes.
         * @param {array} arData - array of data
         * @param {object} options - options
         * @return {Promise}
         */
        saveAllRaw: function(arData, options) {
            var promises = [];

            _.each(arData, function(data) {
                promises.push(function() {
                    return this.saveRaw(data, options);
                }.bind(this));
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Remove a model.
         * @param {object|string} model - Backbone model or ID
         * @param {object} options - options
         * @return {Promise}
         */
        remove: function(model, options) {
            var modelId = typeof model === 'string' ? model : model.id;
            var modelInstance = new (this.changeDatabase(options)).prototype.model({id: modelId});

            modelInstance.set({'trash': 2, updated: Date.now()});

            return this.save(modelInstance, modelInstance.attributes)
                .then(function() {
                    this.vent.trigger('destroy:model', modelInstance);
                }.bind(this));
        },

        /**
         * Find a model by id.
         * @param {object} options - options
         * @return {Promise}
         */
        getModel: function(options) {
            var Model = (this.changeDatabase(options)).prototype.model;
            var idAttr = Model.prototype.idAttribute;
            var data = {};
            var model;

            data[idAttr] = options[idAttr];
            model = new Model(data);

            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return new Q(model);
            }

            if (this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(options[idAttr])) {
                return new Q(this.collection.get(options[idAttr]));
            }

            return this._fetchModel(model);
        },

        /**
         * Fetch a model from the database.
         * @param {object} model - Backbone model
         * @return {Promise}
         */
        _fetchModel: function(model) {
            var self = this;

            return new Q(model.fetch())
                .then(function() {
                    return self.decryptModel(model)
                        .thenResolve(model);
                })
                .fail(function(e) {
                    if (typeof e === 'string' && e.search('not found') > -1) {
                        return null;
                    }
                    throw new Error(e);
                });
        },

        /**
         * Fetch data and create a new collection.
         * @param {object} options - options
         * @return {Promise}
         */
        getAll: function(options) {
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                var cond = this.Collection.prototype.conditions[options.filter];
                cond = (typeof cond === 'function' ? cond(options) : cond);
                options.conditions = cond;
            }

            return this.fetch(options || {})
                .then(function(collection) {
                    this.collection = collection;
                    this.collection.conditionFilter = options.filter;
                    this.collection.conditionCurrent = options.conditions;

                    if (this.collection.registerEvents) {
                        this.collection.registerEvents();
                    }

                    this.listenTo(this.collection, 'reset:all', this.onReset);

                    return this.collection;
                }.bind(this));
        },

        /**
         * Fetch data from the database.
         * @param {object} options - options
         * @return {Promise}
         */
        fetch: function(options) {
            var collection = new (this.changeDatabase(options))();

            return new Q(collection.fetch(options))
                .then(function() {
                    if (!options.encrypt) {
                        return this.decryptModels(collection.fullCollection || collection)
                            .then(function() {
                                collection.trigger('decrypted');
                                return;
                            })
                            .thenResolve(collection);
                    }

                    return collection;
                }.bind(this));
        },

        /**
         * Check if encryption is enabled for a model.
         * @param {object} model - Backbone model
         * @return {boolean}
         */
        _isEncryptEnabled: function(model) {
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            var configs = Radio.request('configs', 'get:object');
            var backup = {encrypt: configs.encryptBackup.encrypt || 0};
            model = model || this.Collection.prototype.model.prototype;

            return (
                !_.isUndefined(model.encryptKeys) &&
                (Number(configs.encrypt) || Number(backup.encrypt)) === 1
            );
        },

        /**
         * Encrypt a model.
         * @param {object} model - Backbone model
         * @return {Promise}
         */
        encryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }

            return Radio.request('encrypt', 'encrypt:model', model);
        },

        /**
         * Decrypt a model.
         * @param {object} model - Backbone model
         * @return {Promise}
         */
        decryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }

            return new Q(
                Radio.request('encrypt', 'decrypt:model', model)
            );
        },

        /**
         * Decrypt every model in the collection.
         * @param {object} collection - Backbone collection
         * @return {Promise}
         */
        decryptModels: function(collection) {
            collection = collection || this.collection;

            if (!this._isEncryptEnabled(collection.model.prototype)) {
                return new Q(collection);
            }

            collection = collection.fullCollection || collection;
            return Radio.request('encrypt', 'decrypt:models', collection);
        }
    });

    return Module;
});
```