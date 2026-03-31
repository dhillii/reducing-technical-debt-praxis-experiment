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
            var profile = (options && options.profile) || this.defaultDB;
            var BaseModel = this.Collection.prototype.model;
            var BaseCollection = this.Collection;

            var model = BaseModel.extend({ profileId: profile });
            var collection = BaseCollection.extend({
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
            var setMethod = model.setEscape ? 'setEscape' : 'set';
            var errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            model[setMethod](data);

            return Q.when(this.encryptModel(model))
                .then(function(encryptedModel) {
                    return Q.when(encryptedModel.save(encryptedModel.attributes, {validate: false}))
                        .thenResolve(encryptedModel);
                });
        },

        saveModel: function(model, data) {
            var self = this;
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
            var ModelClass = this.changeDatabase(options).prototype.model;
            var model = new ModelClass(data);

            return this.decryptModel(model)
                .then(function() {
                    var errors = model.validate(model.attributes);

                    if (errors) {
                        console.error('Validation failed:' + model.storeName, errors);
                        return null;
                    }

                    return self.save(model, data)
                        .then(function(savedModel) {
                            return self.decryptModel(savedModel);
                        })
                        .then(function(decryptedModel) {
                            self.vent.trigger('update:model', decryptedModel);
                            self.vent.trigger('synced:' + decryptedModel.id, decryptedModel);
                            return decryptedModel;
                        });
                });
        },

        saveAllRaw: function(arData, options) {
            var self = this;
            var promises = arData.map(function(data) {
                return function() {
                    return self.saveRaw(data, options);
                };
            });

            return _.reduce(promises, Q.when, new Q());
        },

        remove: function(model, options) {
            var self = this;
            var modelId = typeof model === 'string' ? model : model.id;
            var ModelClass = this.changeDatabase(options).prototype.model;
            var removeModel = new ModelClass({id: modelId});

            removeModel.set({'trash': 2, updated: Date.now()});

            return this.save(removeModel, removeModel.attributes)
                .then(function() {
                    self.vent.trigger('destroy:model', removeModel);
                });
        },

        getModel: function(options) {
            var ModelClass = this.changeDatabase(options).prototype.model;
            var idAttr = ModelClass.prototype.idAttribute;
            var data = {};
            data[idAttr] = options[idAttr];
            var model = new ModelClass(data);

            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return Q.when(model);
            }

            if (this._isModelInCollection(model, options[idAttr])) {
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

        _isModelInCollection: function(model, modelId) {
            return this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(modelId);
        },

        getAll: function(options) {
            var self = this;
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                var conditions = this.Collection.prototype.conditions[options.filter];
                options.conditions = typeof conditions === 'function' ? conditions(options) : conditions;
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
            var CollectionClass = this.changeDatabase(options);
            var collection = new CollectionClass();
            var self = this;

            return Q.when(collection.fetch(options))
                .then(function() {
                    if (options.encrypt) {
                        return collection;
                    }

                    var targetCollection = collection.fullCollection || collection;
                    return self.decryptModels(targetCollection)
                        .then(function() {
                            collection.trigger('decrypted');
                            return collection;
                        });
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

            var targetCollection = collection.fullCollection || collection;
            return Radio.request('encrypt', 'decrypt:models', targetCollection);
        }
    });

    return Module;
});
```