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
         * @return string profile identifier
         */
        _extractProfile: function(options) {
            return (options && options.profile) ? options.profile : this.defaultDB;
        },

        /**
         * Create a model with the specified profile ID.
         * @type string profile
         * @return object extended model
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
         * @return object extended collection
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
         * Save changes to a model.
         * @type object Backbone model
         * @type object new values
         */
        save: function(model, data) {
            const setMethod = model.setEscape ? 'setEscape' : 'set';
            const errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            // Set new values
            model[setMethod](data);

            return new Q(this.encryptModel(model))
            .then((encryptedModel) => {
                return new Q(encryptedModel.save(encryptedModel.attributes, {validate: false}))
                .thenResolve(encryptedModel);
            });
        },

        /**
         * @type object Backbone model
         * @type object new values
         */
        saveModel: function(model, data) {
            const timestamp = Date.now();
            data.updated = timestamp;
            if (!model.attributes.created) {
                data.created = timestamp;
            }

            return this.save(model, data)
            .then((savedModel) => {
                this.vent.trigger('sync:model', savedModel);
                return this.decryptModel(savedModel);
            })
            .then((decryptedModel) => {
                this.vent.trigger('update:model', decryptedModel);
                return decryptedModel;
            });
        },

        /**
         * Save all changes in the collection.
         * @type object Backbone collection
         */
        saveCollection: function(collection) {
            const promises = [];
            const targetCollection = collection || this.collection;

            targetCollection.each((model) => {
                model.attributes.updated = Date.now();
                promises.push(
                    Q.invoke(model, 'save', model.attributes)
                );
            });

            return Q.all(promises)
            .then(() => {
                this.vent.trigger('saved:collection');
                return targetCollection;
            });
        },

        /**
         * Saves raw object to the database.
         * @type object JSON object
         * @type object options
         */
        saveRaw: function(data, options) {
            const model = new (this.changeDatabase(options)).prototype.model(data);

            return this.decryptModel(model)
            .then(() => {
                return this._validateAndSaveRawModel(model, data);
            });
        },

        /**
         * Validate and save a raw model, triggering appropriate events.
         * @type object model
         * @type object data
         * @return object promise
         */
        _validateAndSaveRawModel: function(model, data) {
            const errors = model.validate(model.attributes);

            // Don't save data which can't be validated
            if (errors) {
                console.error('Validation failed:' + model.storeName, errors);
                return;
            }

            return this.save(model, data)
            .then(() => this.decryptModel(model))
            .then((decryptedModel) => {
                this.vent.trigger('update:model', decryptedModel);
                this.vent.trigger('synced:' + decryptedModel.id, decryptedModel);
                return decryptedModel;
            });
        },

        /**
         * Saves all changes.
         * @type array
         */
        saveAllRaw: function(arData, options) {
            const promises = [];

            _.each(arData, (data) => {
                promises.push(() => {
                    return this.saveRaw(data, options);
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
            const modelId = typeof model === 'string' ? model : model.id;
            const targetModel = new (this.changeDatabase(options)).prototype.model({id: modelId});

            targetModel.set({'trash': 2, updated: Date.now()});

            return this.save(targetModel, targetModel.attributes)
            .then(() => {
                this.vent.trigger('destroy:model', targetModel);
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
            if (this._isModelInCollection(model, options[idAttr])) {
                return new Q(this.collection.get(options[idAttr]));
            }

            return new Q(model.fetch())
            .then(() => {
                return this.decryptModel(model)
                .thenResolve(model);
            })
            .fail((error) => {
                return this._handleModelFetchError(error);
            });
        },

        /**
         * Check if model exists in current collection.
         * @type object model
         * @type string modelId
         * @return boolean
         */
        _isModelInCollection: function(model, modelId) {
            return this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(modelId);
        },

        /**
         * Handle errors from model fetch operation.
         * @type error
         * @return object promise or null
         */
        _handleModelFetchError: function(error) {
            if (typeof error === 'string' && error.search('not found') > -1) {
                return null;
            }
            throw new Error(error);
        },

        /**
         * Fetch data and create a new collection.
         * @type object options
         */
        getAll: function(options) {
            this.vent.trigger('destroy:collection');

            const fetchOptions = this._prepareFetchOptions(options);

            return this.fetch(fetchOptions)
            .then((collection) => {
                return this._setupCollection(collection, options);
            });
        },

        /**
         * Prepare fetch options with filter conditions if specified.
         * @type object options
         * @return object prepared options
         */
        _prepareFetchOptions: function(options) {
            const fetchOptions = options || {};

            if (options && options.filter) {
                const condition = this.Collection.prototype.conditions[options.filter];
                fetchOptions.conditions = (typeof condition === 'function' ? condition(options) : condition);
            }

            return fetchOptions;
        },

        /**
         * Setup collection with event listeners and metadata.
         * @type object collection
         * @type object options
         * @return object collection
         */
        _setupCollection: function(collection, options) {
            this.collection = collection;
            this.collection.conditionFilter = options.filter;
            this.collection.conditionCurrent = options.conditions;

            // Register events
            if (this.collection.registerEvents) {
                this.collection.registerEvents();
            }

            // Events
            this.listenTo(this.collection, 'reset:all', this.onReset);

            return this.collection;
        },

        /**
         * Fetch data.
         * @type object options
         */
        fetch: function(options) {
            const collection = new (this.changeDatabase(options))();

            return new Q(collection.fetch(options))
            .then(() => {
                return this._processFetchedCollection(collection, options);
            });
        },

        /**
         * Process fetched collection, decrypting if needed.
         * @type object collection
         * @type object options
         * @return object promise resolving to collection
         */
        _processFetchedCollection: function(collection, options) {
            // Return in decrypted format
            if (!options.encrypt) {
                const targetCollection = collection.fullCollection || collection;
                return this.decryptModels(targetCollection)
                .then(() => {
                    collection.trigger('decrypted');
                    return;
                })
                .thenResolve(collection);
            }

            return collection;
        },

        /**
         * @return boolean
         */
        _isEncryptEnabled: function(model) {
            // Don't use encryption on configs
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            const configs = Radio.request('configs', 'get:object');
            const backup = {encrypt: configs.encryptBackup.encrypt || 0};
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
            const targetCollection = collection || this.collection;
            if (!this._isEncryptEnabled(targetCollection.model.prototype)) {
                return new Q(targetCollection);
            }

            const fullCollection = targetCollection.fullCollection || targetCollection;
            return Radio.request('encrypt', 'decrypt:models', fullCollection);
        }
    });

    return Module;
});
```