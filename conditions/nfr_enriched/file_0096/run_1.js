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
            var model = BaseModel.extend({ profileId: profile });

            return this.Collection.extend({
                profileId: profile,
                model: model
            });
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
                .then(this._triggerAndDecrypt.bind(this, 'sync:model', model))
                .then(this._triggerModelUpdate.bind(this));
        },

        _triggerAndDecrypt: function(eventName, model) {
            this.vent.trigger(eventName, model);
            return this.decryptModel(model);
        },

        _triggerModelUpdate: function(model) {
            this.vent.trigger('update:model', model);
            return model;
        },

        saveCollection: function(collection) {
            collection = collection || this.collection;
            var promises = [];

            collection.each(function(model) {
                model.attributes.updated = Date.now();
                promises.push(Q.invoke(model, 'save', model.attributes));
            });

            return Q.all(promises)
                .then(function() {
                    this.vent.trigger('saved:collection');
                    return collection;
                }.bind(this));
        },

        saveRaw: function(data, options) {
            var ModelClass = this.changeDatabase(options).prototype.model;
            var model = new ModelClass(data);

            return this.decryptModel(model)
                .then(this._validateAndSaveRaw.bind(this, model, data));
        },

        _validateAndSaveRaw: function(model, data) {
            var errors = model.validate(model.attributes);

            if (errors) {
                console.error('Validation failed:' + model.storeName, errors);
                return;
            }

            return this.save(model, data)
                .then(this.decryptModel.bind(this))
                .then(this._triggerRawModelUpdate.bind(this));
        },

        _triggerRawModelUpdate: function(model) {
            this.vent.trigger('update:model', model);
            this.vent.trigger('synced:' + model.id, model);
            return model;
        },

        saveAllRaw: function(arData, options) {
            var promises = arData.map(function(data) {
                return this.saveRaw.bind(this, data, options);
            }, this);

            return _.reduce(promises, Q.when, new Q());
        },

        remove: function(model, options) {
            var modelId = typeof model === 'string' ? model : model.id;
            var ModelClass = this.changeDatabase(options).prototype.model;
            var removeModel = new ModelClass({id: modelId});

            removeModel.set({'trash': 2, updated: Date.now()});

            return this.save(removeModel, removeModel.attributes)
                .then(function() {
                    this.vent.trigger('destroy:model', removeModel);
                }.bind(this));
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
                .then(this._fetchAndDecryptModel.bind(this, model))
                .fail(this._handleFetchError.bind(this));
        },

        _modelExistsInCollection: function(model, modelId) {
            return this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(modelId);
        },

        _fetchAndDecryptModel: function(model) {
            return this.decryptModel(model).thenResolve(model);
        },

        _handleFetchError: function(error) {
            if (typeof error === 'string' && error.search('not found') > -1) {
                return null;
            }
            throw new Error(error);
        },

        getAll: function(options) {
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                var conditions = this.Collection.prototype.conditions[options.filter];
                options.conditions = typeof conditions === 'function' ? conditions(options) : conditions;
            }

            return this.fetch(options || {})
                .then(this._setupCollection.bind(this, options));
        },

        _setupCollection: function(options, collection) {
            this.collection = collection;
            this.collection.conditionFilter = options.filter;
            this.collection.conditionCurrent = options.conditions;

            if (this.collection.registerEvents) {
                this.collection.registerEvents();
            }

            this.listenTo(this.collection, 'reset:all', this.onReset);
            return this.collection;
        },

        fetch: function(options) {
            var collection = new (this.changeDatabase(options))();

            return Q.when(collection.fetch(options))
                .then(this._decryptFetchedCollection.bind(this, collection, options));
        },

        _decryptFetchedCollection: function(collection, options) {
            if (options.encrypt) {
                return collection;
            }

            var targetCollection = collection.fullCollection || collection;
            return this.decryptModels(targetCollection)
                .then(function() {
                    collection.trigger('decrypted');
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