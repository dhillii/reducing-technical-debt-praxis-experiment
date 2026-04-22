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
     * Helper: determine if encryption is enabled for a given model/collection.
     * @param {Object} modelOrProto
     * @returns {boolean}
     */
    const isEncryptionEnabled = (module, modelOrProto) => {
        // Don't use encryption on configs
        if (module.Collection.prototype.storeName === 'configs') {
            return false;
        }
        const configs = Radio.request('configs', 'get:object');
        const backup = { encrypt: configs.encryptBackup.encrypt || 0 };
        const proto = modelOrProto || module.Collection.prototype.model.prototype;
        return (
            !_.isUndefined(proto.encryptKeys) &&
            (Number(configs.encrypt) || Number(backup.encrypt)) === 1
        );
    };

    /**
     * Helper: check if a model identifier is valid.
     * @param {Object} options
     * @param {string} idAttr
     * @returns {boolean}
     */
    const isValidId = (options, idAttr) => {
        const id = options[idAttr];
        return id && id !== '0';
    };

    /**
     * Helper: retrieve model from collection if present.
     * @param {Object} module
     * @param {Object} model
     * @param {Object} options
     * @param {string} idAttr
     * @returns {Object|null}
     */
    const getModelFromCollection = (module, model, options, idAttr) => {
        if (
            module.collection &&
            module.collection.profileId === model.profileId &&
            module.collection.get(options[idAttr])
        ) {
            return module.collection.get(options[idAttr]);
        }
        return null;
    };

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
        reply() {
            return {
                save: this.saveModel,
                'save:collection': this.saveCollection,
                save: this.saveRaw,
                'save:all:raw': this.saveAllRaw,
                fetch: this.fetch,
                'get:model': this.getModel,
                'get:all': this.getAll,
                remove: this.remove,
            };
        },

        initialize() {
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
        changeDatabase(options) {
            const profile = options && options.profile ? options.profile : this.defaultDB;

            const Model = this.Collection.prototype.model.extend({
                profileId: profile,
            });

            const Collection = this.Collection.extend({
                profileId: profile,
                model: Model,
            });

            return Collection;
        },

        /**
         * Stop listening to current collection's events.
         */
        onReset() {
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
         * @param {Object} data new values
         * @return {Promise}
         */
        save(model, data) {
            const setF = model.setEscape ? 'setEscape' : 'set';
            const errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            model[setF](data);

            return new Q(this.encryptModel(model))
                .then(encryptedModel => new Q(encryptedModel.save(encryptedModel.attributes, { validate: false }))
                    .thenResolve(encryptedModel));
        },

        /**
         * @param {Object} model Backbone model
         * @param {Object} data new values
         * @return {Promise}
         */
        saveModel(model, data) {
            data.updated = Date.now();
            if (!model.attributes.created) {
                data.created = Date.now();
            }

            return this.save(model, data)
                .then(savedModel => {
                    this.vent.trigger('sync:model', savedModel);
                    return this.decryptModel(savedModel);
                })
                .then(decryptedModel => {
                    this.vent.trigger('update:model', decryptedModel);
                    return decryptedModel;
                });
        },

        /**
         * Save all changes in the collection.
         * @param {Object} collection Backbone collection
         * @return {Promise}
         */
        saveCollection(collection) {
            const promises = [];
            const self = this;
            collection = collection || this.collection;

            collection.each(model => {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });

            return Q.all(promises)
                .then(() => {
                    self.vent.trigger('saved:collection');
                    return collection;
                });
        },

        /**
         * Saves raw object to the database.
         * @param {Object} data JSON object
         * @param {Object} options
         * @return {Promise}
         */
        saveRaw(data, options) {
            const self = this;
            const ModelCtor = this.changeDatabase(options).prototype.model;
            const model = new ModelCtor(data);
            let errors;

            return this.decryptModel(model)
                .then(() => {
                    errors = model.validate(model.attributes);
                    if (errors) {
                        console.error('Validation failed:' + model.storeName, errors);
                        return;
                    }
                    return self.save(model, data);
                })
                .then(self.decryptModel.bind(self))
                .then(savedModel => {
                    self.vent.trigger('update:model', savedModel);
                    self.vent.trigger('synced:' + savedModel.id, savedModel);
                    return savedModel;
                });
        },

        /**
         * Saves all changes.
         * @param {Array} arData
         * @param {Object} options
         * @return {Promise}
         */
        saveAllRaw(arData, options) {
            const self = this;
            const tasks = arData.map(data => () => self.saveRaw(data, options));
            return _.reduce(tasks, Q.when, new Q());
        },

        /**
         * Remove a model.
         * @param {Object|string} model Backbone model or ID
         * @param {Object} options
         * @return {Promise}
         */
        remove(model, options) {
            const self = this;
            const id = typeof model === 'string' ? model : model.id;
            const ModelCtor = this.changeDatabase(options).prototype.model;
            const target = new ModelCtor({ id });

            target.set({ trash: 2, updated: Date.now() });

            return this.save(target, target.attributes)
                .then(() => {
                    self.vent.trigger('destroy:model', target);
                });
        },

        /**
         * Find a model by id.
         * @param {Object} options
         * @return {Promise}
         */
        getModel(options) {
            const Model = this.changeDatabase(options).prototype.model;
            const idAttr = Model.prototype.idAttribute;
            const data = { [idAttr]: options[idAttr] };
            const model = new Model(data);

            if (!isValidId(options, idAttr)) {
                model.set(idAttr, undefined);
                return new Q(model);
            }

            const cached = getModelFromCollection(this, model, options, idAttr);
            if (cached) {
                return new Q(cached);
            }

            return new Q(model.fetch())
                .then(() => this.decryptModel(model).thenResolve(model))
                .fail(e => {
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
        getAll(options) {
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                let cond = this.Collection.prototype.conditions[options.filter];
                cond = typeof cond === 'function' ? cond(options) : cond;
                options.conditions = cond;
            }

            return this.fetch(options || {})
                .then(collection => {
                    this.collection = collection;
                    this.collection.conditionFilter = options.filter;
                    this.collection.conditionCurrent = options.conditions;

                    if (this.collection.registerEvents) {
                        this.collection.registerEvents();
                    }

                    this.listenTo(this.collection, 'reset:all', this.onReset);
                    return this.collection;
                });
        },

        /**
         * Fetch data.
         * @param {Object} options
         * @return {Promise}
         */
        fetch(options) {
            const collection = new (this.changeDatabase(options))();
            const self = this;

            return new Q(collection.fetch(options))
                .then(() => {
                    if (!options.encrypt) {
                        return self.decryptModels(collection.fullCollection || collection)
                            .then(() => {
                                collection.trigger('decrypted');
                            })
                            .thenResolve(collection);
                    }
                    return collection;
                });
        },

        /**
         * @private
         * @param {Object} model
         * @return {boolean}
         */
        _isEncryptEnabled(model) {
            return isEncryptionEnabled(this, model);
        },

        /**
         * @param {Object} model
         * @return {Promise}
         */
        encryptModel(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }
            return Radio.request('encrypt', 'encrypt:model', model);
        },

        /**
         * @param {Object} model
         * @return {Promise}
         */
        decryptModel(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }
            return new Q(Radio.request('encrypt', 'decrypt:model', model));
        },

        /**
         * Decrypt every model in the collection
         * @param {Object} collection
         * @return {Promise}
         */
        decryptModels(collection) {
            collection = collection || this.collection;
            if (!this._isEncryptEnabled(collection.model.prototype)) {
                return new Q(collection);
            }
            const target = collection.fullCollection || collection;
            return Radio.request('encrypt', 'decrypt:models', target);
        },
    });

    return Module;
});