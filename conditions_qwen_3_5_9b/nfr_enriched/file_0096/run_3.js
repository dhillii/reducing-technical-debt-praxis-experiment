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
         * @type object
         */
        reply: function() {
            return {
                'save': this.saveModel,
                'save:collection': this.saveCollection,
                'save:raw': this.saveRaw,
                'save:all:raw': this.saveAllRaw,
                'fetch': this.fetch,
                'get:model': this.getModel,
                'get:all': this.getAll,
                'remove': this.remove,
            };
        },

        initialize: function() {
            this.vent = Radio.channel(this.Collection.prototype.storeName);
            this._bindMethods();
            this._registerReplies();
            this._registerEvents();
        },

        /**
         * Binds methods to the instance.
         */
        _bindMethods: function() {
            _.bindAll(this, 'encryptModel', 'decryptModel', 'decryptModels');
        },

        /**
         * Registers reply handlers with the radio channel.
         */
        _registerReplies: function() {
            var defReply = _.bind(Module.prototype.reply, this);
            this.vent.reply(_.extend(defReply(), this.reply()), this);
        },

        /**
         * Registers event listeners.
         */
        _registerEvents: function() {
            this.listenTo(this.vent, 'destroy:collection', this.onReset, this);
        },

        /**
         * Switch to another database (e.g. profile).
         * @param {object} options - Options object with profile property.
         * @returns {object} Collection instance.
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
         * Stops listening to current collection's events.
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
         * Saves a model with encryption and validation.
         * @param {object} model - Backbone model instance.
         * @param {object} data - New values to set.
         * @returns {Promise} Resolves with the saved model.
         */
        save: function(model, data) {
            var setF = model.setEscape ? 'setEscape' : 'set';
            var errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            model[setF](data);
            return new Q(this.encryptModel(model))
                .then(function(model) {
                    return new Q(model.save(model.attributes, {validate: false}))
                        .thenResolve(model);
                });
        },

        /**
         * Saves a model with timestamps and triggers.
         * @param {object} model - Backbone model instance.
         * @param {object} data - New values to set.
         * @returns {Promise} Resolves with the decrypted model.
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
         * Saves all changes in the collection.
         * @param {object} collection - Backbone collection instance.
         * @returns {Promise} Resolves with the collection.
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
         * Saves a raw object to the database.
         * @param {object} data - JSON object to save.
         * @param {object} options - Options object.
         * @returns {Promise} Resolves with the saved model.
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

                    return this.save(model, data)
                        .then(this.decryptModel)
                        .then(function(model) {
                            this.vent.trigger('update:model', model);
                            this.vent.trigger('synced:' + model.id, model);
                            return model;
                        }.bind(this));
                }.bind(this));
        },

        /**
         * Saves all changes in an array of raw data.
         * @param {array} arData - Array of data objects.
         * @param {object} options - Options object.
         * @returns {Promise} Resolves when all saves complete.
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
         * Removes a model by ID.
         * @param {string|object} model - Model instance or ID string.
         * @param {object} options - Options object.
         * @returns {Promise} Resolves when removal is complete.
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
         * Finds a model by ID.
         * @param {object} options - Options object with ID attribute.
         * @returns {Promise} Resolves with the model or null.
         */
        getModel: function(options) {
            var Model = (this.changeDatabase(options)).prototype.model;
            var idAttr = Model.prototype.idAttribute;
            var data = {};
            data[idAttr] = options[idAttr];
            var model = new Model(data);

            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return new Q(model);
            }

            if (this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(options[idAttr])) {
                return new Q(this.collection.get(options[idAttr]));
            }

            return new Q(model.fetch())
                .then(function() {
                    return this.decryptModel(model)
                        .thenResolve(model);
                }.bind(this))
                .fail(function(e) {
                    if (typeof e === 'string' && e.search('not found') > -1) {
                        return null;
                    }
                    throw new Error(e);
                });
        },

        /**
         * Fetches data and creates a new collection.
         * @param {object} options - Options object.
         * @returns {Promise} Resolves with the collection.
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
         * Fetches data from the database.
         * @param {object} options - Options object.
         * @returns {Promise} Resolves with the collection.
         */
        fetch: function(options) {
            var collection = new (this.changeDatabase(options))();

            return new Q(collection.fetch(options))
                .then(function() {
                    if (!options.encrypt) {
                        return this.decryptModels(collection.fullCollection || collection)
                            .then(function() {
                                collection.trigger('decrypted');
                            })
                            .thenResolve(collection);
                    }

                    return collection;
                }.bind(this));
        },

        /**
         * Checks if encryption is enabled for a model.
         * @param {object} model - Model instance or prototype.
         * @returns {boolean} True if encryption is enabled.
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
         * Encrypts a model if encryption is enabled.
         * @param {object} model - Model instance.
         * @returns {Promise} Resolves with the model.
         */
        encryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }

            return Radio.request('encrypt', 'encrypt:model', model);
        },

        /**
         * Decrypts a model if encryption is enabled.
         * @param {object} model - Model instance.
         * @returns {Promise} Resolves with the decrypted model.
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
         * Decrypts every model in the collection.
         * @param {object} collection - Backbone collection instance.
         * @returns {Promise} Resolves when decryption is complete.
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