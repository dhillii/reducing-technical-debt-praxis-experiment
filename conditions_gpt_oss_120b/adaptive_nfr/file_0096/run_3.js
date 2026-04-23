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
], (_, Q, Marionette, Radio) => {
    'use strict';

    /**
     * Helper: determine if encryption is enabled for a given model/collection.
     * @param {Object} modelOrProto
     * @returns {boolean}
     */
    const isEncryptionEnabled = (module, modelOrProto) => {
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
     * Collection object from which other collection objects extend.
     *
     * For default it
     *
     * replies to the following requests:
     * 1. save            - save model changes
     * 2. save:collection - save all collection changes
     * 3. save:raw        - saves several objects
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
         * @type object
         */
        changeDatabase(options) {
            const profile = options && options.profile ? options.profile : this.defaultDB;

            const Model = this.Collection.prototype.model.extend({
                profileId: profile
            });

            const Collection = this.Collection.extend({
                profileId: profile,
                model: Model
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
         * @type object Backbone model
         * @type object new values
         */
        save(model, data) {
            const setMethod = model.setEscape ? 'setEscape' : 'set';
            const errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            model[setMethod](data);

            return new Q(this.encryptModel(model))
                .then(encryptedModel => new Q(encryptedModel.save(encryptedModel.attributes, { validate: false }))
                    .thenResolve(encryptedModel));
        },

        /**
         * @type object Backbone model
         * @type object new values
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
         * @type object Backbone collection
         */
        saveCollection(collection) {
            const targetCollection = collection || this.collection;
            const promises = [];

            targetCollection.each(model => {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
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
        saveRaw(data, options) {
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
                    return this.save(model, data)
                        .then(this.decryptModel.bind(this))
                        .then(savedModel => {
                            this.vent.trigger('update:model', savedModel);
                            this.vent.trigger('synced:' + savedModel.id, savedModel);
                            return savedModel;
                        });
                });
        },

        /**
         * Saves all changes.
         * @type array
         */
        saveAllRaw(arData, options) {
            const tasks = arData.map(data => () => this.saveRaw(data, options));
            return _.reduce(tasks, Q.when, new Q());
        },

        /**
         * Remove a model.
         * @type object Backbone model or ID
         * @type object options
         */
        remove(model, options) {
            const id = typeof model === 'string' ? model : model.id;
            const ModelCtor = this.changeDatabase(options).prototype.model;
            const targetModel = new ModelCtor({ id });

            targetModel.set({ trash: 2, updated: Date.now() });

            return this.save(targetModel, targetModel.attributes)
                .then(() => {
                    this.vent.trigger('destroy:model', targetModel);
                });
        },

        /**
         * Find a model by id.
         * @type object options
         */
        getModel(options) {
            const ModelCtor = this.changeDatabase(options).prototype.model;
            const idAttr = ModelCtor.prototype.idAttribute;
            const data = { [idAttr]: options[idAttr] };
            const model = new ModelCtor(data);

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
         * @type object options
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
         * @type object options
         */
        fetch(options) {
            const CollectionCtor = this.changeDatabase(options);
            const collection = new CollectionCtor();
            return new Q(collection.fetch(options))
                .then(() => {
                    if (!options.encrypt) {
                        return this.decryptModels(collection.fullCollection || collection)
                            .then(() => {
                                collection.trigger('decrypted');
                            })
                            .thenResolve(collection);
                    }
                    return collection;
                });
        },

        /**
         * @return boolean
         */
        _isEncryptEnabled(model) {
            return isEncryptionEnabled(this, model);
        },

        /**
         * @type object Backbone model
         */
        encryptModel(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }
            return Radio.request('encrypt', 'encrypt:model', model);
        },

        /**
         * @type object Backbone model
         */
        decryptModel(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }
            return new Q(Radio.request('encrypt', 'decrypt:model', model));
        },

        /**
         * Decrypt every model in the collection
         * @type object Backbone collection
         */
        decryptModels(collection) {
            const target = collection || this.collection;
            if (!this._isEncryptEnabled(target.model.prototype)) {
                return new Q(target);
            }
            const source = target.fullCollection || target;
            return Radio.request('encrypt', 'decrypt:models', source);
        }
    });

    return Module;
});