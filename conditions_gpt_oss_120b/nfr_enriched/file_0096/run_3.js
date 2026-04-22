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
     * 3. save:raw        - saves several objects
     * 4. save:all:raw    - saves several objects
     * 5. fetch           - fetches models from the database
     * 6. get:model       - returns a specific model
     * 7. get:all         - returns a collection
     * 8. remove          - removes a model
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
         * Requests to which every collection module replies for default.
         * @return {Object}
         */
        reply() {
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

        initialize() {
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
         * @param {Object} options
         * @return {Backbone.Collection}
         */
        changeDatabase(options) {
            const profile = (options && options.profile) ? options.profile : this.defaultDB;

            const Model = this.Collection.prototype.model.extend({
                profileId: profile
            });

            return this.Collection.extend({
                profileId: profile,
                model    : Model
            });
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
         * @param {Backbone.Model} model
         * @param {Object} data
         * @return {Promise}
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
         * Save a single model with timestamps and trigger events.
         * @param {Backbone.Model} model
         * @param {Object} data
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
         * @param {Backbone.Collection} [collection]
         * @return {Promise}
         */
        saveCollection(collection) {
            const target = collection || this.collection;
            const promises = [];

            target.each(model => {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });

            return Q.all(promises)
                .then(() => {
                    this.vent.trigger('saved:collection');
                    return target;
                });
        },

        /**
         * Validate and save a raw object.
         * @param {Object} data
         * @param {Object} options
         * @return {Promise}
         */
        saveRaw(data, options) {
            const ModelClass = this.changeDatabase(options).prototype.model;
            const model = new ModelClass(data);
            let validationErrors;

            return this.decryptModel(model)
                .then(() => {
                    validationErrors = model.validate(model.attributes);
                    if (validationErrors) {
                        console.error('Validation failed:' + model.storeName, validationErrors);
                        return;
                    }
                    return this.save(model, data);
                })
                .then(savedModel => this.decryptModel(savedModel))
                .then(finalModel => {
                    this.vent.trigger('update:model', finalModel);
                    this.vent.trigger('synced:' + finalModel.id, finalModel);
                    return finalModel;
                });
        },

        /**
         * Save an array of raw objects sequentially.
         * @param {Array<Object>} arData
         * @param {Object} options
         * @return {Promise}
         */
        saveAllRaw(arData, options) {
            const tasks = arData.map(data => () => this.saveRaw(data, options));
            return _.reduce(tasks, Q.when, new Q());
        },

        /**
         * Remove a model (soft delete).
         * @param {Backbone.Model|string} model
         * @param {Object} options
         * @return {Promise}
         */
        remove(model, options) {
            const id = typeof model === 'string' ? model : model.id;
            const ModelClass = this.changeDatabase(options).prototype.model;
            const target = new ModelClass({ id });

            target.set({ trash: 2, updated: Date.now() });

            return this.save(target, target.attributes)
                .then(() => {
                    this.vent.trigger('destroy:model', target);
                });
        },

        /**
         * Retrieve a model by id, using cache when possible.
         * @param {Object} options
         * @return {Promise}
         */
        getModel(options) {
            const ModelClass = this.changeDatabase(options).prototype.model;
            const idAttr = ModelClass.prototype.idAttribute;
            const data = {};

            data[idAttr] = options[idAttr];
            const model = new ModelClass(data);

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
         * @param {Object} options
         * @return {Promise}
         */
        getAll(options) {
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                let cond = this.Collection.prototype.conditions[options.filter];
                cond = (typeof cond === 'function' ? cond(options) : cond);
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
         * Fetch data for a collection.
         * @param {Object} options
         * @return {Promise}
         */
        fetch(options) {
            const CollectionClass = this.changeDatabase(options);
            const collection = new CollectionClass();
            const encrypt = options.encrypt;

            return new Q(collection.fetch(options))
                .then(() => {
                    if (!encrypt) {
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
         * Determine if encryption is enabled for a model/collection.
         * @param {Backbone.Model|Backbone.Collection} [model]
         * @return {boolean}
         */
        _isEncryptEnabled(model) {
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            const configs = Radio.request('configs', 'get:object');
            const backup = { encrypt: configs.encryptBackup.encrypt || 0 };
            const targetModel = model || this.Collection.prototype.model.prototype;

            return (
                !_.isUndefined(targetModel.encryptKeys) &&
                (Number(configs.encrypt) || Number(backup.encrypt)) === 1
            );
        },

        /**
         * Encrypt a model if encryption is enabled.
         * @param {Backbone.Model} model
         * @return {Promise}
         */
        encryptModel(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }
            return Radio.request('encrypt', 'encrypt:model', model);
        },

        /**
         * Decrypt a model if encryption is enabled.
         * @param {Backbone.Model} model
         * @return {Promise}
         */
        decryptModel(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }
            return new Q(Radio.request('encrypt', 'decrypt:model', model));
        },

        /**
         * Decrypt all models in a collection if encryption is enabled.
         * @param {Backbone.Collection} [collection]
         * @return {Promise}
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
```