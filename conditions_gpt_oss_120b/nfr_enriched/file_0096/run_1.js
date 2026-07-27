/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/.
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
        changeDatabase: function(options) {
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
                .then(savedModel => {
                    self.vent.trigger('sync:model', savedModel);
                    return self.decryptModel(savedModel);
                })
                .then(decryptedModel => {
                    self.vent.trigger('update:model', decryptedModel);
                    return decryptedModel;
                });
        },

        /**
         * Save all changes in the collection.
         * @type object Backbone collection
         */
        saveCollection: function(collection) {
            const self = this;
            const target = collection || this.collection;
            const promises = [];

            target.each(model => {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });

            return Q.all(promises)
                .then(() => {
                    self.vent.trigger('saved:collection');
                    return target;
                });
        },

        /**
         * Saves raw object to the database.
         * @type object JSON object
         * @type object options
         */
        saveRaw: function(data, options) {
            const self = this;
            const ModelCtor = this.changeDatabase(options).prototype.model;
            const model = new ModelCtor(data);

            return this.decryptModel(model)
                .then(() => {
                    const errors = model.validate(model.attributes);
                    if (errors) {
                        console.error('Validation failed:' + model.storeName, errors);
                        return;
                    }
                    return self._saveAndDecrypt(model, data);
                });
        },

        /**
         * Helper to save a model and decrypt the result.
         */
        _saveAndDecrypt: function(model, data) {
            const self = this;
            return self.save(model, data)
                .then(self.decryptModel)
                .then(savedModel => {
                    self.vent.trigger('update:model', savedModel);
                    self.vent.trigger('synced:' + savedModel.id, savedModel);
                    return savedModel;
                });
        },

        /**
         * Saves all changes.
         * @type array
         */
        saveAllRaw: function(arData, options) {
            const self = this;
            const tasks = [];

            _.each(arData, data => {
                tasks.push(() => self.saveRaw(data, options));
            });

            return _.reduce(tasks, Q.when, new Q());
        },

        /**
         * Remove a model.
         * @type object Backbone model or ID
         * @type object options
         */
        remove: function(model, options) {
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
         * @type object options
         */
        getModel: function(options) {
            const Model = this.changeDatabase(options).prototype.model;
            const idAttr = Model.prototype.idAttribute;
            const idValue = options[idAttr];

            if (!idValue || idValue === '0') {
                const emptyModel = new Model({});
                emptyModel.set(idAttr, undefined);
                return new Q(emptyModel);
            }

            if (this.collection &&
                this.collection.profileId === Model.prototype.profileId &&
                this.collection.get(idValue)) {
                return new Q(this.collection.get(idValue));
            }

            return this._fetchAndDecryptModel(Model, idAttr, idValue);
        },

        /**
         * Helper to fetch a model from storage and decrypt it.
         */
        _fetchAndDecryptModel: function(Model, idAttr, idValue) {
            const model = new Model({ [idAttr]: idValue });
            const self = this;

            return new Q(model.fetch())
                .then(() => self.decryptModel(model).thenResolve(model))
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
        getAll: function(options) {
            const self = this;
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                this._applyFilter(options);
            }

            return this.fetch(options || {})
                .then(collection => {
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
         * Apply filter conditions to options.
         */
        _applyFilter: function(options) {
            let cond = this.Collection.prototype.conditions[options.filter];
            cond = (typeof cond === 'function' ? cond(options) : cond);
            options.conditions = cond;
        },

        /**
         * Fetch data.
         * @type object options
         */
        fetch: function(options) {
            const CollectionCtor = this.changeDatabase(options);
            const collection = new CollectionCtor();
            const self = this;

            return new Q(collection.fetch(options))
                .then(() => this._maybeDecryptCollection(collection, options));
        },

        /**
         * Decrypt collection if encryption is not requested.
         */
        _maybeDecryptCollection: function(collection, options) {
            if (!options.encrypt) {
                return this.decryptModels(collection.fullCollection || collection)
                    .then(() => {
                        collection.trigger('decrypted');
                        return collection;
                    });
            }
            return collection;
        },

        /**
         * @return boolean
         */
        _isEncryptEnabled: function(model) {
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
            return new Q(Radio.request('encrypt', 'decrypt:model', model));
        },

        /**
         * Decrypt every model in the collection
         * @type object Backbone collection
         */
        decryptModels: function(collection) {
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