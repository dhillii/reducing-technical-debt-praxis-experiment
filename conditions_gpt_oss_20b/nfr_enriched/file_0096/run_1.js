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

    var Module = Marionette.Object.extend({
        Collection: null,
        defaultDB: 'notes-db',

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

        changeDatabase: function(options) {
            const profile = options && options.profile ? options.profile : this.defaultDB;
            const model = this.Collection.prototype.model.extend({
                profileId: profile
            });

            const collection = this.Collection.extend({
                profileId: profile,
                model: model
            });

            return collection;
        },

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

        _validateAndSet: function(model, data) {
            const errors = model.validate(data);
            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }
            const setMethod = model.setEscape ? 'setEscape' : 'set';
            model[setMethod](data);
            return Q.resolve();
        },

        _encryptIfNeeded: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return Q.resolve(model);
            }
            return Radio.request('encrypt', 'encrypt:model', model);
        },

        _saveModelInternal: function(model) {
            return this._encryptIfNeeded(model)
                .then(function(encryptedModel) {
                    return Q(encryptedModel.save(encryptedModel.attributes, {validate: false}))
                        .thenResolve(encryptedModel);
                });
        },

        save: function(model, data) {
            return this._validateAndSet(model, data)
                .then(() => this._saveModelInternal(model));
        },

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

        _collectSavePromises: function(collection) {
            const promises = [];
            collection.each(function(model) {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });
            return promises;
        },

        saveCollection: function(collection) {
            const self = this;
            collection = collection || this.collection;
            const promises = this._collectSavePromises(collection);

            return Q.all(promises)
                .then(function() {
                    self.vent.trigger('saved:collection');
                    return collection;
                });
        },

        _validateModel: function(model) {
            const errors = model.validate(model.attributes);
            if (errors) {
                console.error('Validation failed:' + model.storeName, errors);
                return Q.resolve();
            }
            return Q.resolve(errors);
        },

        saveRaw: function(data, options) {
            const self = this;
            const model = new (this.changeDatabase(options)).prototype.model(data);

            return this.decryptModel(model)
                .then(function() {
                    return self._validateModel(model);
                })
                .then(function() {
                    return self.save(model, data)
                        .then(self.decryptModel)
                        .then(function(decryptedModel) {
                            self.vent.trigger('update:model', decryptedModel);
                            self.vent.trigger('synced:' + decryptedModel.id, decryptedModel);
                            return decryptedModel;
                        });
                });
        },

        saveAllRaw: function(arData, options) {
            const self = this;
            const tasks = _.map(arData, function(data) {
                return function() {
                    return self.saveRaw(data, options);
                };
            });

            return _.reduce(tasks, Q.when, new Q());
        },

        remove: function(model, options) {
            const self = this;
            const id = typeof model === 'string' ? model : model.id;
            const modelInstance = new (this.changeDatabase(options)).prototype.model({id: id});

            modelInstance.set({'trash': 2, updated: Date.now()});

            return this.save(modelInstance, modelInstance.attributes)
                .then(function() {
                    self.vent.trigger('destroy:model', modelInstance);
                });
        },

        getModel: function(options) {
            const Model = (this.changeDatabase(options)).prototype.model;
            const idAttr = Model.prototype.idAttribute;
            const data = {};
            data[idAttr] = options[idAttr];
            const model = new Model(data);

            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return Q.resolve(model);
            }

            if (this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(options[idAttr])) {
                return Q.resolve(this.collection.get(options[idAttr]));
            }

            const self = this;
            return Q(model.fetch())
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

        _applyFilter: function(options) {
            if (options.filter) {
                let cond = this.Collection.prototype.conditions[options.filter];
                cond = typeof cond === 'function' ? cond(options) : cond;
                options.conditions = cond;
            }
            return options;
        },

        getAll: function(options) {
            const self = this;
            this.vent.trigger('destroy:collection');

            const opts = this._applyFilter(options || {});

            return this.fetch(opts)
                .then(function(collection) {
                    self.collection = collection;
                    self.collection.conditionFilter = opts.filter;
                    self.collection.conditionCurrent = opts.conditions;

                    if (self.collection.registerEvents) {
                        self.collection.registerEvents();
                    }

                    self.listenTo(self.collection, 'reset:all', self.onReset);

                    return self.collection;
                });
        },

        fetch: function(options) {
            const collection = new (this.changeDatabase(options))();
            const self = this;

            return Q(collection.fetch(options))
                .then(function() {
                    if (!options.encrypt) {
                        return self.decryptModels(collection.fullCollection || collection)
                            .then(function() {
                                collection.trigger('decrypted');
                                return collection;
                            });
                    }
                    return collection;
                });
        },

        _isEncryptEnabled: function(model) {
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            const configs = Radio.request('configs', 'get:object');
            const backup = {encrypt: configs.encryptBackup.encrypt || 0};
            const targetModel = model || this.Collection.prototype.model.prototype;

            return !_.isUndefined(targetModel.encryptKeys) &&
                (Number(configs.encrypt) || Number(backup.encrypt)) === 1;
        },

        encryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return Q.resolve(model);
            }
            return Radio.request('encrypt', 'encrypt:model', model);
        },

        decryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return Q.resolve(model);
            }
            return Q(Radio.request('encrypt', 'decrypt:model', model));
        },

        decryptModels: function(collection) {
            collection = collection || this.collection;
            if (!this._isEncryptEnabled(collection.model.prototype)) {
                return Q.resolve(collection);
            }
            collection = collection.fullCollection || collection;
            return Radio.request('encrypt', 'decrypt:models', collection);
        }
    });

    return Module;
});