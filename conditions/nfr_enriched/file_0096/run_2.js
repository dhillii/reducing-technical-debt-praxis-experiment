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
    const Module = Marionette.Object.extend({
        /**
         * @type object Backbone collection
         */
        Collection: null,

        /**
         * @type string default profile
         */
        defaultDB: 'notes-db',

        /**
         * Requests to which every collection module
         * replies for default.
         * @return object
         */
        reply: function() {
            return {
                'save'            : this.saveModel,
                'save:collection' : this.saveCollection,
                'save:raw'        : this.saveRaw,
                'save:all:raw'    : this.saveAllRaw,
                'fetch'           : this.fetch,
                'get:model'       : this.getModel,
                'get:all'         : this.getAll,
                'remove'          : this.remove,
            };
        },

        initialize: function() {
            // Default replies
            const defReply = _.bind(Module.prototype.reply, this);
            this.vent = Radio.channel(this.Collection.prototype.storeName);

            _.bindAll(this, 'encryptModel', 'decryptModel', 'decryptModels');

            // Register replies
            this.vent.reply(_.extend(defReply(), this.reply()), this);

            // Listen to events
            this.listenTo(this.vent, 'destroy:collection', this.onReset, this);
        },

        /**
         * Switch to another database (e.g. profile)
         * @type object
         */
        changeDatabase: function(options) {
            const profile = options && options.profile ? options.profile : this.defaultDB;

            const model = this.Collection.prototype.model.extend({
                profileId : profile
            });

            const collection = this.Collection.extend({
                profileId : profile,
                model     : model
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
         * Validate model data before saving.
         * @type object Backbone model
         * @type object new values
         * @return object|null validation errors or null
         */
        _validateModelData: function(model, data) {
            return model.validate(data);
        },

        /**
         * Apply data to model using appropriate setter method.
         * @type object Backbone model
         * @type object new values
         */
        _applyDataToModel: function(model, data) {
            const setMethod = model.setEscape ? 'setEscape' : 'set';
            model[setMethod](data);
        },

        /**
         * Save changes to a model.
         * @type object Backbone model
         * @type object new values
         */
        save: function(model, data) {
            const self = this;
            const errors = this._validateModelData(model, data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            // Set new values
            this._applyDataToModel(model, data);

            return new Q(self.encryptModel(model))
            .then(function(encryptedModel) {
                return new Q(encryptedModel.save(encryptedModel.attributes, {validate: false}))
                .thenResolve(encryptedModel);
            });
        },

        /**
         * Add timestamp metadata to model data.
         * @type object new values
         * @type object Backbone model
         */
        _addTimestamps: function(data, model) {
            data.updated = Date.now();
            if (!model.attributes.created) {
                data.created = Date.now();
            }
        },

        /**
         * @type object Backbone model
         * @type object new values
         */
        saveModel: function(model, data) {
            const self = this;

            this._addTimestamps(data, model);

            return this.save(model, data)
            .then(function(savedModel) {
                self.vent.trigger('sync:model', savedModel);
                return self.decryptModel(savedModel);
            })
            .then(function(decryptedModel) {
                self.vent.trigger('update:model', decryptedModel);
                return decryptedModel;
            });
        },

        /**
         * Save all models in collection with updated timestamp.
         * @type object Backbone collection
         */
        _saveCollectionModels: function(collection) {
            const promises = [];

            collection.each(function(model) {
                model.attributes.updated = Date.now();
                promises.push(
                    Q.invoke(model, 'save', model.attributes)
                );
            });

            return promises;
        },

        /**
         * Save all changes in the collection.
         * @type object Backbone collection
         */
        saveCollection: function(collection) {
            const self = this;
            collection = collection || this.collection;

            const promises = this._saveCollectionModels(collection);

            return Q.all(promises)
            .then(function() {
                self.vent.trigger('saved:collection');
                return collection;
            });
        },

        /**
         * Validate and save raw data.
         * @type object JSON object
         * @type object Backbone model
         * @return object Q promise
         */
        _validateAndSaveRawData: function(data, model, self) {
            const errors = model.validate(model.attributes);

            // Don't save data which can't be validated
            if (errors) {
                console.error('Validation failed:' + model.storeName, errors);
                return new Q(null);
            }

            return self.save(model, data)
            .then(self.decryptModel)
            .then(function(decryptedModel) {
                self.vent.trigger('update:model', decryptedModel);
                self.vent.trigger('synced:' + decryptedModel.id, decryptedModel);
                return decryptedModel;
            });
        },

        /**
         * Saves raw object to the database.
         * @type object JSON object
         * @type object options
         */
        saveRaw: function(data, options) {
            const self = this;
            const model = new (this.changeDatabase(options)).prototype.model(data);

            return this.decryptModel(model)
            .then(function() {
                return self._validateAndSaveRawData(data, model, self);
            });
        },

        /**
         * Saves all changes.
         * @type array
         */
        saveAllRaw: function(arData, options) {
            const promises = [];
            const self = this;

            _.each(arData, function(data) {
                promises.push(function() {
                    return self.saveRaw(data, options);
                });
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Remove a model.
         * @type object Backbone model or ID
         * @type object options
         */
        remove: function(model, options) {
            const self = this;

            // Change model's attributes to default values (empty values)
            const modelId = typeof model === 'string' ? model : model.id;
            const removeModel = new (this.changeDatabase(options)).prototype.model({id: modelId});

            removeModel.set({'trash': 2, updated: Date.now()});

            return this.save(removeModel, removeModel.attributes)
            .then(function() {
                self.vent.trigger('destroy:model', removeModel);
            });
        },

        /**
         * Get model from collection if available.
         * @type object options
         * @type object Model constructor
         * @return object|null model or null
         */
        _getModelFromCollection: function(options, Model) {
            if (this.collection &&
                this.collection.profileId === Model.prototype.profileId &&
                this.collection.get(options[Model.prototype.idAttribute])) {
                return this.collection.get(options[Model.prototype.idAttribute]);
            }
            return null;
        },

        /**
         * Fetch and decrypt a model.
         * @type object Backbone model
         * @return object Q promise
         */
        _fetchAndDecryptModel: function(model) {
            const self = this;

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
         * Find a model by id.
         * @type object options
         */
        getModel: function(options) {
            const Model = (this.changeDatabase(options)).prototype.model;
            const idAttr = Model.prototype.idAttribute;
            const data = {};

            data[idAttr] = options[idAttr];
            const model = new Model(data);

            // If id was not provided, return a model with default values
            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return new Q(model);
            }

            // In case if the collection isn't empty, get the model from there.
            const collectionModel = this._getModelFromCollection(options, Model);
            if (collectionModel) {
                return new Q(collectionModel);
            }

            return this._fetchAndDecryptModel(model);
        },

        /**
         * Apply filter conditions to options.
         * @type object options
         */
        _applyFilterConditions: function(options) {
            if (options.filter) {
                const cond = this.Collection.prototype.conditions[options.filter];
                options.conditions = (typeof cond === 'function' ? cond(options) : cond);
            }
        },

        /**
         * Register collection events and listeners.
         * @type object collection
         * @type object options
         */
        _registerCollectionListeners: function(collection, options) {
            collection.conditionFilter = options.filter;
            collection.conditionCurrent = options.conditions;

            // Register events
            if (collection.registerEvents) {
                collection.registerEvents();
            }

            // Events
            this.listenTo(collection, 'reset:all', this.onReset);
        },

        /**
         * Fetch data and create a new collection.
         * @type object options
         */
        getAll: function(options) {
            const self = this;
            this.vent.trigger('destroy:collection');

            // Add filter conditions
            this._applyFilterConditions(options);

            return this.fetch(options || {})
            .then(function(collection) {
                self.collection = collection;
                self._registerCollectionListeners(collection, options);

                return self.collection;
            });
        },

        /**
         * Decrypt collection if encryption is not requested.
         * @type object collection
         * @type object options
         * @return object Q promise
         */
        _decryptCollectionIfNeeded: function(collection, options) {
            const self = this;

            if (!options.encrypt) {
                return self.decryptModels(collection.fullCollection || collection)
                .then(function() {
                    collection.trigger('decrypted');
                    return;
                })
                .thenResolve(collection);
            }

            return new Q(collection);
        },

        /**
         * Fetch data.
         * @type object options
         */
        fetch: function(options) {
            const collection = new (this.changeDatabase(options))();
            const self = this;

            return new Q(collection.fetch(options))
            .then(function() {
                return self._decryptCollectionIfNeeded(collection, options);
            });
        },

        /**
         * Get encryption configuration.
         * @return object encryption config
         */
        _getEncryptionConfig: function() {
            const configs = Radio.request('configs', 'get:object');
            return {encrypt: configs.encryptBackup.encrypt || 0};
        },

        /**
         * Check if encryption is enabled for model.
         * @type object Backbone model
         * @return boolean
         */
        _isEncryptEnabled: function(model) {
            // Don't use encryption on configs
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            const configs = Radio.request('configs', 'get:object');
            const backup = this._getEncryptionConfig();
            const targetModel = model || this.Collection.prototype.model.prototype;

            return (
                !_.isUndefined(targetModel.encryptKeys) &&
                (Number(configs.encrypt) || Number(backup.encrypt)) === 1
            );
        },

        /**
         * @type object Backbone model
         */
        encryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }

            return Radio.request('encrypt', 'encrypt:model', model);
        },

        /**
         * @type object Backbone model
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
         * Decrypt every model in the collection
         * @type object Backbone collection
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