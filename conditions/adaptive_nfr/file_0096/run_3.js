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
     */
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
            var defReply = _.bind(Module.prototype.reply, this);
            this.vent = Radio.channel(this.Collection.prototype.storeName);

            _.bindAll(this, 'encryptModel', 'decryptModel', 'decryptModels');

            this.vent.reply(_.extend(defReply(), this.reply()), this);
            this.listenTo(this.vent, 'destroy:collection', this.onReset, this);
        },

        changeDatabase: function(options) {
            var profile = options && options.profile ? options.profile : this.defaultDB;
            var model = this.Collection.prototype.model.extend({ profileId: profile });
            var collection = this.Collection.extend({
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

        save: function(model, data) {
            var self = this;
            var setF = model.setEscape ? 'setEscape' : 'set';
            var errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            model[setF](data);

            return Q.when(this.encryptModel(model))
                .then(function(model) {
                    return Q.when(model.save(model.attributes, {validate: false}))
                        .thenResolve(model);
                });
        },

        saveModel: function(model, data) {
            var self = this;
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

        saveCollection: function(collection) {
            var self = this;
            collection = collection || this.collection;
            var promises = [];

            collection.each(function(model) {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });

            return Q.all(promises)
                .then(function() {
                    self.vent.trigger('saved:collection');
                    return collection;
                });
        },

        saveRaw: function(data, options) {
            var self = this;
            var model = new (this.changeDatabase(options)).prototype.model(data);

            return this.decryptModel(model)
                .then(function() {
                    var errors = model.validate(model.attributes);
                    if (errors) {
                        console.error('Validation failed:' + model.storeName, errors);
                        return;
                    }

                    return self.save(model, data)
                        .then(function(model) {
                            return self.decryptModel(model);
                        })
                        .then(function(model) {
                            self.vent.trigger('update:model', model);
                            self.vent.trigger('synced:' + model.id, model);
                            return model;
                        });
                });
        },

        saveAllRaw: function(arData, options) {
            var self = this;
            var promises = _.map(arData, function(data) {
                return function() {
                    return self.saveRaw(data, options);
                };
            });

            return _.reduce(promises, Q.when, new Q());
        },

        remove: function(model, options) {
            var self = this;
            var modelId = typeof model === 'string' ? model : model.id;
            var removeModel = new (this.changeDatabase(options)).prototype.model({id: modelId});

            removeModel.set({'trash': 2, updated: Date.now()});

            return this.save(removeModel, removeModel.attributes)
                .then(function() {
                    self.vent.trigger('destroy:model', removeModel);
                });
        },

        getModel: function(options) {
            var Model = (this.changeDatabase(options)).prototype.model;
            var idAttr = Model.prototype.idAttribute;
            var data = {};
            data[idAttr] = options[idAttr];
            var model = new Model(data);

            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return Q.when(model);
            }

            if (this._modelExistsInCollection(model, options[idAttr])) {
                return Q.when(this.collection.get(options[idAttr]));
            }

            var self = this;
            return Q.when(model.fetch())
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

        _modelExistsInCollection: function(model, modelId) {
            return this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(modelId);
        },

        getAll: function(options) {
            var self = this;
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                var cond = this.Collection.prototype.conditions[options.filter];
                options.conditions = typeof cond === 'function' ? cond(options) : cond;
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

        fetch: function(options) {
            var collection = new (this.changeDatabase(options))();
            var self = this;

            return Q.when(collection.fetch(options))
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

        _isEncryptEnabled: function(model) {
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            var configs = Radio.request('configs', 'get:object');
            var backup = {encrypt: configs.encryptBackup.encrypt || 0};
            model = model || this.Collection.prototype.model.prototype;

            return !_.isUndefined(model.encryptKeys) &&
                (Number(configs.encrypt) || Number(backup.encrypt)) === 1;
        },

        encryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return Q.when(model);
            }
            return Radio.request('encrypt', 'encrypt:model', model);
        },

        decryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return Q.when(model);
            }
            return Q.when(Radio.request('encrypt', 'decrypt:model', model));
        },

        decryptModels: function(collection) {
            collection = collection || this.collection;
            if (!this._isEncryptEnabled(collection.model.prototype)) {
                return Q.when(collection);
            }

            collection = collection.fullCollection || collection;
            return Radio.request('encrypt', 'decrypt:models', collection);
        }
    });

    return Module;
});
```