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
     * Determines whether encryption is enabled for a given model or collection.
     * @param {Object} modelPrototype Model prototype or collection model prototype.
     * @returns {boolean}
     */
    function isEncryptionEnabled(modelPrototype) {
        // Don't use encryption on configs
        if (this.Collection.prototype.storeName === 'configs') {
            return false;
        }

        const configs = Radio.request('configs', 'get:object');
        const backup = { encrypt: configs.encryptBackup.encrypt || 0 };
        const prototype = modelPrototype || this.Collection.prototype.model.prototype;

        return (
            !_.isUndefined(prototype.encryptKeys) &&
            (Number(configs.encrypt) || Number(backup.encrypt)) === 1
        );
    }

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
         * @return {Object}
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
            const defReply = _.bind(Module.prototype.reply, this);
            this.vent = Radio.channel(this.Collection.prototype.storeName);

            _.bindAll(this, 'encryptModel', 'decryptModel', 'decryptModels');

            this.vent.reply(_.extend(defReply(), this.reply()), this);
            this.listenTo(this.vent, 'destroy:collection', this.onReset, this);
        },

        /**
         * Switch to another database (e.g. profile)
         * @param {Object} options
         * @return {Function} Collection constructor
         */
        changeDatabase: function(options) {
            const profile = options && options.profile ? options.profile : this.defaultDB;

            const Model = this.Collection.prototype.model.extend({
                profileId: profile
            });

            const Collection = this.Collection.extend({
                profileId: profile,
                model    : Model
            });

            return Collection;
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
         * @param {Object} model Backbone model
         * @param {Object} data New values
         * @return {Promise}
         */
        save: function(model, data) {
            const self = this;
            const setF = model.setEscape ? 'setEscape' : 'set';
            const errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            model[setF](data);

            return new Q(self.encryptModel(model))
                .then(function(encryptedModel) {
                    return new Q(encryptedModel.save(encryptedModel.attributes, { validate: false }))
                        .thenResolve(encryptedModel);
                });
        },

        /**
         * @param {Object} model Backbone model
         * @param {Object} data New values
         * @return {Promise}
         */
        saveModel: function(model, data) {
            const self = this;

            data.updated = Date.now();
            if (!model.attributes.created) {
                data.created = Date.now();
            }

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
         * Save all changes in the collection.
         * @param {Object} collection Backbone collection
         * @return {Promise}
         */
        saveCollection: function(collection) {
            const self = this;
            const coll = collection || this.collection;
            const promises = [];

            coll.each(function(model) {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });

            return Q.all(promises)
                .then(function() {
                    self.vent.trigger('saved:collection');
                    return coll;
                });
        },

        /**
         * Saves raw object to the database.
         * @param {Object} data JSON object
         * @param {Object} options
         * @return {Promise}
         */
        saveRaw: function(data, options) {
            const self = this;
            const ModelCtor = this.changeDatabase(options).prototype.model;
            const model = new ModelCtor(data);
            let errors;

            return this.decryptModel(model)
                .then(function() {
                    errors = model.validate(model.attributes);
                    if (errors) {
                        console.error('Validation failed:' + model.storeName, errors);
                        return;
                    }

                    return self.save(model, data)
                        .then(self.decryptModel)
                        .then(function(finalModel) {
                            self.vent.trigger('update:model', finalModel);
                            self.vent.trigger('synced:' + finalModel.id, finalModel);
                            return finalModel;
                        });
                });
        },

        /**
         * Saves all changes.
         * @param {Array} arData
         * @param {Object} options
         * @return {Promise}
         */
        saveAllRaw: function(arData, options) {
            const self = this;
            const tasks = [];

            _.each(arData, function(data) {
                tasks.push(function() {
                    return self.saveRaw(data, options);
                });
            });

            return _.reduce(tasks, Q.when, new Q());
        },

        /**
         * Remove a model.
         * @param {Object|string} model Backbone model or ID
         * @param {Object} options
         * @return {Promise}
         */
        remove: function(model, options) {
            const self = this;
            const id = typeof model === 'string' ? model : model.id;
            const ModelCtor = this.changeDatabase(options).prototype.model;
            const targetModel = new ModelCtor({ id: id });

            targetModel.set({ trash: 2, updated: Date.now() });

            return this.save(targetModel, targetModel.attributes)
                .then(function() {
                    self.vent.trigger('destroy:model', targetModel);
                });
        },

        /**
         * Find a model by id.
         * @param {Object} options
         * @return {Promise}
         */
        getModel: function(options) {
            const Model = this.changeDatabase(options).prototype.model;
            const idAttr = Model.prototype.idAttribute;
            const data = {};
            data[idAttr] = options[idAttr];
            const model = new Model(data);
            const self = this;

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
         * @param {Object} options
         * @return {Promise}
         */
        getAll: function(options) {
            const self = this;
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                let cond = this.Collection.prototype.conditions[options.filter];
                cond = (typeof cond === 'function' ? cond(options) : cond);
                options.conditions = cond;
            }

            return this.fetch(options || {})
                .then(function(collection) {
                    self.collection = collection;
                    self.collection.conditionFilter = options.filter;
                    self.collection.conditionCurrent = options.conditions;

                    if (self.collection.registerEvents) {
                        self.collection.registerEvents();
                    }

                    self.listenTo(self.collection, 'reset:all', self.onReset);
                    return self.collection;
                });
        },

        /**
         * Fetch data.
         * @param {Object} options
         * @return {Promise}
         */
        fetch: function(options) {
            const collection = new (this.changeDatabase(options))();
            const self = this;

            return new Q(collection.fetch(options))
                .then(function() {
                    if (!options.encrypt) {
                        return self.decryptModels(collection.fullCollection || collection)
                            .then(function() {
                                collection.trigger('decrypted');
                            })
                            .thenResolve(collection);
                    }
                    return collection;
                });
        },

        /**
         * @param {Object} [model] Optional model prototype
         * @return {boolean}
         */
        _isEncryptEnabled: function(model) {
            return isEncryptionEnabled.call(this, model);
        },

        /**
         * @param {Object} model
         * @return {Promise}
         */
        encryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }
            return Radio.request('encrypt', 'encrypt:model', model);
        },

        /**
         * @param {Object} model
         * @return {Promise}
         */
        decryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }
            return new Q(Radio.request('encrypt', 'decrypt:model', model));
        },

        /**
         * Decrypt every model in the collection
         * @param {Object} [collection]
         * @return {Promise}
         */
        decryptModels: function(collection) {
            const coll = collection || this.collection;
            if (!this._isEncryptEnabled(coll.model.prototype)) {
                return new Q(coll);
            }
            const target = coll.fullCollection || coll;
            return Radio.request('encrypt', 'decrypt:models', target);
        }
    });

    return Module;
});