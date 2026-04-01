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
            const profile = this._extractProfile(options);
            const model = this._createProfileModel(profile);
            const collection = this._createProfileCollection(profile, model);

            return collection;
        },

        /**
         * Extract profile from options or use default.
         * @type object options
         * @return string
         */
        _extractProfile: function(options) {
            return (options && options.profile) ? options.profile : this.defaultDB;
        },

        /**
         * Create a model with the specified profile ID.
         * @type string profile
         * @return object
         */
        _createProfileModel: function(profile) {
            return this.Collection.prototype.model.extend({
                profileId : profile
            });
        },

        /**
         * Create a collection with the specified profile ID and model.
         * @type string profile
         * @type object model
         * @return object
         */
        _createProfileCollection: function(profile, model) {
            return this.Collection.extend({
                profileId : profile,
                model     : model
            });
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
         * Validate model data and trigger invalid event if validation fails.
         * @type object model
         * @type object data
         * @return object|null
         */
        _validateModelData: function(model, data) {
            const errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return errors;
            }

            return null;
        },

        /**
         * Determine the appropriate setter method for the model.
         * @type object model
         * @return string
         */
        _getModelSetterMethod: function(model) {
            return model.setEscape ? 'setEscape' : 'set';
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
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            // Set new values
            const setF = this._getModelSetterMethod(model);
            model[setF](data);

            return new Q(self.encryptModel(model))
            .then(function(encryptedModel) {
                return new Q(encryptedModel.save(encryptedModel.attributes, {validate: false}))
                .thenResolve(encryptedModel);
            });
        },

        /**
         * Add timestamp metadata to model data.
         * @type object model
         * @type object data
         */
        _addTimestamps: function(model, data) {
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

            this._addTimestamps(model, data);

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
         * Update model timestamps in collection.
         * @type object collection
         */
        _updateCollectionTimestamps: function(collection) {
            collection.each(function(model) {
                model.attributes.updated = Date.now();
            });
        },

        /**
         * Save all changes in the collection.
         * @type object Backbone collection
         */
        saveCollection: function(collection) {
            const promises = [];
            const self = this;
            const targetCollection = collection || this.collection;

            this._updateCollectionTimestamps(targetCollection);

            targetCollection.each(function(model) {
                promises.push(
                    Q.invoke(model, 'save', model.attributes)
                );
            });

            return Q.all(promises)
            .then(function() {
                self.vent.trigger('saved:collection');
                return targetCollection;
            });
        },

        /**
         * Validate raw data before saving.
         * @type object model
         * @return object|null
         */
        _validateRawData: function(model) {
            const errors = model.validate(model.attributes);

            if (errors) {
                console.error('Validation failed:' + model.storeName, errors);
                return errors;
            }

            return null;
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
                const errors = self._validateRawData(model);

                // Don't save data which can't be validated
                if (errors) {
                    return;
                }

                return self.save(model, data)
                .then(function(savedModel) {
                    return self.decryptModel(savedModel);
                })
                .then(function(decryptedModel) {
                    self.vent.trigger('update:model', decryptedModel);
                    self.vent.trigger('synced:' + decryptedModel.id, decryptedModel);
                    return decryptedModel;
                });
            });
        },

        /**
         * Create a promise wrapper for saving raw data.
         * @type object data
         * @type object options
         * @return function
         */
        _createSaveRawPromise: function(data, options) {
            const self = this;
            return function() {
                return self.saveRaw(data, options);
            };
        },

        /**
         * Saves all changes.
         * @type array
         */
        saveAllRaw: function(arData, options) {
            const promises = [];
            const self = this;

            _.each(arData, function(data) {
                promises.push(self._createSaveRawPromise(data, options));
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Normalize model identifier to ID string.
         * @type object|string model
         * @return string
         */
        _normalizeModelId: function(model) {
            return typeof model === 'string' ? model : model.id;
        },

        /**
         * Remove a model.
         * @type object Backbone model or ID
         * @type object options
         */
        remove: function(model, options) {
            const self = this;

            // Change model's attributes to default values (empty values)
            const modelId = this._normalizeModelId(model);
            const targetModel = new (this.changeDatabase(options)).prototype.model({id: modelId});

            targetModel.set({'trash': 2, updated: Date.now()});

            return this.save(targetModel, targetModel.attributes)
            .then(function() {
                self.vent.trigger('destroy:model', targetModel);
            });
        },

        /**
         * Check if model exists in current collection.
         * @type object model
         * @type string modelId
         * @return object|null
         */
        _getModelFromCollection: function(model, modelId) {
            if (this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(modelId)) {
                return this.collection.get(modelId);
            }

            return null;
        },

        /**
         * Handle model fetch failure.
         * @type object error
         * @return null|throws
         */
        _handleModelFetchError: function(error) {
            if (typeof error === 'string' && error.search('not found') > -1) {
                return null;
            }
            throw new Error(error);
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
            const collectionModel = this._getModelFromCollection(model, options[idAttr]);
            if (collectionModel) {
                return new Q(collectionModel);
            }

            const self = this;

            return new Q(model.fetch())
            .then(function() {
                return self.decryptModel(model)
                .thenResolve(model);
            })
            .fail(function(error) {
                return self._handleModelFetchError(error);
            });
        },

        /**
         * Apply filter conditions to options.
         * @type object options
         */
        _applyFilterConditions: function(options) {
            if (!options.filter) {
                return;
            }

            let cond = this.Collection.prototype.conditions[options.filter];
            cond = (typeof cond === 'function' ? cond(options) : cond);
            options.conditions = cond;
        },

        /**
         * Register collection events and listeners.
         * @type object collection
         * @type object options
         */
        _registerCollectionEvents: function(collection, options) {
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
                self._registerCollectionEvents(collection, options);

                return self.collection;
            });
        },

        /**
         * Decrypt collection if encryption is not enabled.
         * @type object collection
         * @type object options
         * @return object
         */
        _decryptCollectionIfNeeded: function(collection, options) {
            const self = this;

            // Return in decrypted format
            if (!options.encrypt) {
                return self.decryptModels(collection.fullCollection || collection)
                .then(function() {
                    collection.trigger('decrypted');
                    return;
                })
                .thenResolve(collection);
            }

            return collection;
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
         * @return object
         */
        _getEncryptionConfig: function() {
            const configs = Radio.request('configs', 'get:object');
            return {
                encrypt: configs.encrypt,
                backupEncrypt: configs.encryptBackup.encrypt || 0
            };
        },

        /**
         * Check if encryption is enabled for the collection.
         * @return boolean
         */
        _isCollectionEncryptionEnabled: function() {
            // Don't use encryption on configs
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            return true;
        },

        /**
         * Check if model has encryption keys defined.
         * @type object model
         * @return boolean
         */
        _modelHasEncryptionKeys: function(model) {
            return !_.isUndefined(model.encryptKeys);
        },

        /**
         * @return boolean
         */
        _isEncryptEnabled: function(model) {
            if (!this._isCollectionEncryptionEnabled()) {
                return false;
            }

            const config = this._getEncryptionConfig();
            const targetModel = model || this.Collection.prototype.model.prototype;

            return (
                this._modelHasEncryptionKeys(targetModel) &&