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
         * Determine the appropriate setter method for a model.
         * @param {object} model - Backbone model
         * @return {string} setter method name
         */
        _getSetterMethod: function(model) {
            return model.setEscape ? 'setEscape' : 'set';
        },

        /**
         * Save changes to a model.
         * @type object Backbone model
         * @type object new values
         */
        save: function(model, data) {
            const self = this;
            const setF = this._getSetterMethod(model);
            const errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            // Set new values
            model[setF](data);

            return new Q(self.encryptModel(model))
            .then(function(model) {
                return new Q(model.save(model.attributes, {validate: false}))
                .thenResolve(model);
            });
        },

        /**
         * @type object Backbone model
         * @type object new values
         */
        saveModel: function(model, data) {
            const self = this;

            data.updated = Date.now();
            if (!model.attributes.created) {
                data.created = Date.now();
            }

            return this.save(model, data)
            .then(function(model) {
                self.vent.trigger('sync:model', model);
                return self.decryptModel(model);
            })
            .then(function(model) {
                self.vent.trigger('update:model', model);
                return model;
            });
        },

        /**
         * Save all changes in the collection.
         * @type object Backbone collection
         */
        saveCollection: function(collection) {
            const promises = [];
            const self = this;
            collection = collection || this.collection;

            collection.each(function(model) {
                model.attributes.updated = Date.now();

                promises.push(
                    Q.invoke(model, 'save', model.attributes)
                );
            });

            return Q.all(promises)
            .then(function() {
                self.vent.trigger('saved:collection');
                return collection;
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
                const errors = model.validate(model.attributes);

                // Don't save data which can't be validated
                if (errors) {
                    console.error('Validation failed:' + model.storeName, errors);
                    return;
                }

                return self.save(model, data)
                .then(self.decryptModel)
                .then(function(model) {
                    self.vent.trigger('update:model', model);
                    self.vent.trigger('synced:' + model.id, model);
                    return model;
                });
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
         * Normalize model identifier to model ID.
         * @param {object|string} model - Backbone model or ID string
         * @return {string} model ID
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
            const modelInstance = new (this.changeDatabase(options)).prototype.model({id: modelId});

            modelInstance.set({'trash': 2, updated: Date.now()});

            return this.save(modelInstance, modelInstance.attributes)
            .then(function() {
                self.vent.trigger('destroy:model', modelInstance);
            });
        },

        /**
         * Check if model should be fetched from database.
         * @param {object} options - fetch options
         * @param {string} idAttr - ID attribute name
         * @return {boolean} true if fetch is needed
         */
        _shouldFetchModel: function(options, idAttr) {
            return options[idAttr] && options[idAttr] !== '0';
        },

        /**
         * Check if model exists in current collection.
         * @param {object} model - model instance
         * @param {string} modelId - model ID
         * @return {boolean} true if model exists in collection
         */
        _modelExistsInCollection: function(model, modelId) {
            return this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(modelId);
        },

        /**
         * Handle model fetch error.
         * @param {*} error - error object or message
         * @return {null|Promise} null if not found, otherwise throws error
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
            if (!this._shouldFetchModel(options, idAttr)) {
                model.set(idAttr, undefined);
                return new Q(model);
            }

            // In case if the collection isn't empty, get the model from there.
            if (this._modelExistsInCollection(model, options[idAttr])) {
                return new Q(this.collection.get(options[idAttr]));
            }

            const self = this;

            return new Q(model.fetch())
            .then(function() {
                return self.decryptModel(model)
                .thenResolve(model);
            })
            .fail((error) => this._handleModelFetchError(error));
        },

        /**
         * Apply filter conditions to options.
         * @param {object} options - fetch options
         */
        _applyFilterConditions: function(options) {
            if (!options.filter) {
                return;
            }

            const cond = this.Collection.prototype.conditions[options.filter];
            options.conditions = (typeof cond === 'function' ? cond(options) : cond);
        },

        /**
         * Register collection events and listeners.
         * @param {object} collection - Backbone collection
         */
        _registerCollectionListeners: function(collection) {
            if (collection.registerEvents) {
                collection.registerEvents();
            }

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
                self.collection.conditionFilter  = options.filter;
                self.collection.conditionCurrent = options.conditions;

                // Register events
                self._registerCollectionListeners(self.collection);

                return self.collection;
            });
        },

        /**
         * Check if decryption is needed for collection.
         * @param {object} options - fetch options
         * @return {boolean} true if decryption should be skipped
         */
        _shouldSkipDecryption: function(options) {
            return options.encrypt;
        },

        /**
         * Decrypt and finalize collection fetch.
         * @param {object} collection - Backbone collection
         * @param {object} options - fetch options
         * @return {Promise}
         */
        _decryptAndFinalizeFetch: function(collection, options) {
            const self = this;

            if (this._shouldSkipDecryption(options)) {
                return new Q(collection);
            }

            return self.decryptModels(collection.fullCollection || collection)
            .then(function() {
                collection.trigger('decrypted');
                return;
            })
            .thenResolve(collection);
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
                return self._decryptAndFinalizeFetch(collection, options);
            });
        },

        /**
         * Check if encryption is disabled for this collection.
         * @param {object} model - model prototype
         * @return {boolean} true if encryption is disabled
         */
        _isEncryptionDisabledForStore: function() {
            return this.Collection.prototype.storeName === 'configs';
        },

        /**
         * Get encryption configuration.
         * @return {object} encryption config
         */
        _getEncryptionConfig: function() {
            const configs = Radio.request('configs', 'get:object');
            return {
                encrypt: configs.encrypt,
                backupEncrypt: configs.encryptBackup.encrypt || 0
            };
        },

        /**
         * Check if model has encryption keys defined.
         * @param {object} model - model prototype
         * @return {boolean} true if encryption keys exist
         */
        _hasEncryptionKeys: function(model) {
            return !_.isUndefined(model.encryptKeys);
        },

        /**
         * @return boolean
         */
        _isEncryptEnabled: function(model) {
            // Don't use encryption on configs
            if (this._isEncryptionDisabledForStore()) {
                return false;
            }

            const config = this._getEncryptionConfig();
            model = model || this.Collection.prototype.model.prototype;

            return (
                this._hasEncryptionKeys(model) &&
                (Number(config.encrypt) || Number(config.backupEncrypt)) === 1
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
```