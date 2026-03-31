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
            this.vent = Radio.channel(this.Collection.prototype.storeName);
            _.bindAll(this, 'encryptModel', 'decryptModel', 'decryptModels');

            var defaultReplies = _.bind(Module.prototype.reply, this)();
            var allReplies = _.extend(defaultReplies, this.reply());
            this.vent.reply(allReplies, this);

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
            data.updated = Date.now();
            if (!model.attributes.created) {
                data.created = Date.now();
            }

            return this.save(model, data)
                .then((model) => {
                    this.vent.trigger('sync:model', model);
                    return this.decryptModel(model);
                })
                .then((model) => {
                    this.vent.trigger('update:model', model);
                    return model;
                });
        },

        saveCollection: function(collection) {
            collection = collection || this.collection;
            var promises = [];

            collection.each(function(model) {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });

            return Q.all(promises)
                .then(() => {
                    this.vent.trigger('saved:collection');
                    return collection;
                });
        },

        saveRaw: function(data, options) {
            var ModelClass = this.changeDatabase(options).prototype.model;
            var model = new ModelClass(data);

            return this.decryptModel(model)
                .then(() => {
                    var errors = model.validate(model.attributes);
                    if (errors) {
                        console.error('Validation failed:' + model.storeName, errors);
                        return null;
                    }
                    return this.save(model, data);
                })
                .then((savedModel) => {
                    if (!savedModel) return null;
                    return this.decryptModel(savedModel);
                })
                .then((decryptedModel) => {
                    if (!decryptedModel) return null;
                    this.vent.trigger('update:model', decryptedModel);
                    this.vent.trigger('synced:' + decryptedModel.id, decryptedModel);
                    return decryptedModel;
                });
        },

        saveAllRaw: function(arData, options) {
            var promises = arData.map((data) => {
                return () => this.saveRaw(data, options);
            });

            return _.reduce(promises, Q.when, new Q());
        },

        remove: function(model, options) {
            var modelId = typeof model === 'string' ? model : model.id;
            var ModelClass = this.changeDatabase(options).prototype.model;
            var trashModel = new ModelClass({id: modelId});

            trashModel.set({'trash': 2, updated: Date.now()});

            return this.save(trashModel, trashModel.attributes)
                .then(() => {
                    this.vent.trigger('destroy:model', trashModel);
                });
        },

        getModel: function(options) {
            var ModelClass = this.changeDatabase(options).prototype.model;
            var idAttr = ModelClass.prototype.idAttribute;
            var modelData = {};
            modelData[idAttr] = options[idAttr];
            var model = new ModelClass(modelData);

            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return Q.when(model);
            }

            if (this._modelExistsInCollection(model, options[idAttr])) {
                return Q.when(this.collection.get(options[idAttr]));
            }

            return Q.when(model.fetch())
                .then(() => this.decryptModel(model).thenResolve(model))
                .fail((error) => {
                    if (typeof error === 'string' && error.search('not found') > -1) {
                        return null;
                    }
                    throw new Error(error);
                });
        },

        _modelExistsInCollection: function(model, modelId) {
            return this.collection &&
                   this.collection.profileId === model.profileId &&
                   this.collection.get(modelId);
        },

        getAll: function(options) {
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                var conditions = this.Collection.prototype.conditions[options.filter];
                options.conditions = typeof conditions === 'function' ? conditions(options) : conditions;
            }

            return this.fetch(options || {})
                .then((collection) => {
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

        fetch: function(options) {
            var CollectionClass = this.changeDatabase(options);
            var collection = new CollectionClass();

            return Q.when(collection.fetch(options))
                .then(() => {
                    if (!options.encrypt) {
                        var targetCollection = collection.fullCollection || collection;
                        return this.decryptModels(targetCollection)
                            .then(() => {
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