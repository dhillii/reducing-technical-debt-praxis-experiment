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

    const Module = Marionette.Object.extend({
        Collection: null,
        defaultDB: 'notes-db',

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

            this.vent.reply(_.extend(defReply(), this.reply()), this);
            this.listenTo(this.vent, 'destroy:collection', this.onReset, this);
        },

        changeDatabase(options) {
            const profile = options && options.profile ? options.profile : this.defaultDB;
            let model, collection;

            model = this.Collection.prototype.model.extend({
                profileId: profile
            });

            collection = this.Collection.extend({
                profileId: profile,
                model: model
            });

            return collection;
        },

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

        save(model, data) {
            const setF = model.setEscape ? 'setEscape' : 'set';
            const errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            model[setF](data);

            return new Q(this.encryptModel(model))
                .then((encryptedModel) => {
                    return new Q(encryptedModel.save(encryptedModel.attributes, { validate: false }))
                        .thenResolve(encryptedModel);
                });
        },

        saveModel(model, data) {
            const self = this;

            data.updated = Date.now();
            if (!model.attributes.created) {
                data.created = Date.now();
            }

            return this.save(model, data)
                .then((savedModel) => {
                    self.vent.trigger('sync:model', savedModel);
                    return self.decryptModel(savedModel);
                })
                .then((decryptedModel) => {
                    self.vent.trigger('update:model', decryptedModel);
                    return decryptedModel;
                });
        },

        saveCollection(collection) {
            const promises = [];
            const self = this;
            collection = collection || this.collection;

            collection.each((model) => {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });

            return Q.all(promises)
                .then(() => {
                    self.vent.trigger('saved:collection');
                    return collection;
                });
        },

        saveRaw(data, options) {
            const self = this;
            const model = new (this.changeDatabase(options)).prototype.model(data);
            let errors;

            return this.decryptModel(model)
                .then(() => {
                    errors = model.validate(model.attributes);

                    if (errors) {
                        console.error('Validation failed:' + model.storeName, errors);
                        return;
                    }

                    return self.save(model, data)
                        .then(self.decryptModel)
                        .then((decryptedModel) => {
                            self.vent.trigger('update:model', decryptedModel);
                            self.vent.trigger('synced:' + decryptedModel.id, decryptedModel);
                            return decryptedModel;
                        });
                });
        },

        saveAllRaw(arData, options) {
            const promises = [];
            const self = this;

            _.each(arData, (data) => {
                promises.push(() => self.saveRaw(data, options));
            });

            return _.reduce(promises, Q.when, new Q());
        },

        remove(model, options) {
            const self = this;

            model = typeof model === 'string' ? model : model.id;
            model = new (this.changeDatabase(options)).prototype.model({ id: model });

            model.set({ trash: 2, updated: Date.now() });

            return this.save(model, model.attributes)
                .then(() => {
                    self.vent.trigger('destroy:model', model);
                });
        },

        getModel(options) {
            const Model = (this.changeDatabase(options)).prototype.model;
            const idAttr = Model.prototype.idAttribute;
            const data = {};
            let model;

            data[idAttr] = options[idAttr];
            model = new Model(data);

            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return new Q(model);
            }

            if (this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(options[idAttr])) {
                return new Q(this.collection.get(options[idAttr]));
            }

            const self = this;

            return new Q(model.fetch())
                .then(() => self.decryptModel(model).thenResolve(model))
                .fail((e) => {
                    if (typeof e === 'string' && e.search('not found') > -1) {
                        return null;
                    }
                    throw new Error(e);
                });
        },

        getAll(options) {
            const self = this;
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                const cond = this.Collection.prototype.conditions[options.filter];
                const newCond = typeof cond === 'function' ? cond(options) : cond;
                options.conditions = newCond;
            }

            return this.fetch(options || {})
                .then((collection) => {
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

        fetch(options) {
            const collection = new (this.changeDatabase(options))();
            const self = this;

            return new Q(collection.fetch(options))
                .then(() => {
                    if (!options.encrypt) {
                        return self.decryptModels(collection.fullCollection || collection)
                            .then(() => {
                                collection.trigger('decrypted');
                                return;
                            })
                            .thenResolve(collection);
                    }
                    return collection;
                });
        },

        _isEncryptEnabled(model) {
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            const configs = Radio.request('configs', 'get:object');
            const backup = { encrypt: configs.encryptBackup.encrypt || 0 };
            model = model || this.Collection.prototype.model.prototype;

            return (
                !_.isUndefined(model.encryptKeys) &&
                (Number(configs.encrypt) || Number(backup.encrypt)) === 1
            );
        },

        encryptModel(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }

            return Radio.request('encrypt', 'encrypt:model', model);
        },

        decryptModel(model) {
            if (!this._isEncryptEnabled(model)) {
                return new Q(model);
            }

            return new Q(Radio.request('encrypt', 'decrypt:model', model));
        },

        decryptModels(collection) {
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