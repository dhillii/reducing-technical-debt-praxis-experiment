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
     * 3. save:all:raw    - saves several objects
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
            // Default replies
            const defReply = _.bind(Module.prototype.reply, this);
            this.vent = Radio.channel(this.Collection.prototype.storeName);

            _.bindAll(this, 'encryptModel', 'decryptModel', 'decryptModels');

            // Register replies
            this.vent.reply(_.extend(defReply(), this.reply()), this);

            // Listen to events
            this.listenTo(this.vent, 'destroy:collection', this.onReset);
        },

        /**
         * Switch to another database (e.g. profile)
         * @type object
         */
        changeDatabase: function(options) {
            const profile  = options && options.profile ? options.profile : this.defaultDB;
            const model    = this.Collection.prototype.model.extend({
                profileId : profile
            });
            const collection = this.Collection.extend({
                profileId : profile,
                model     : model
            });

            return collection;
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
            const setF   = model.setEscape ? 'setEscape' : 'set';
            const errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            // Set new values
            model[setF](data);

            return new Q(this.encryptModel(model))
            .then(model => model.save(model.attributes, {validate: false}))
            .thenResolve(model);
        },

        /**
         * @type object Backbone model
         * @type object new values
         */
        saveModel: function(model, data) {
            data.updated = Date.now();
            if (!model.attributes.created) {
                data.created = Date.now();
            }

            return this.save(model, data)
            .then(model => {
                this.vent.trigger('sync:model', model);
                return this.decryptModel(model);
            })
            .then(model => {
                this.vent.trigger('update:model', model);
                return model;
            });
        },

        /**
         * Save all changes in the collection.
         * @type object Backbone collection
         */
        saveCollection: function(collection) {
            collection = collection || this.collection;
            const promises = collection.map(model => {
                model.attributes.updated = Date.now();
                return Q.invoke(model, 'save', model.attributes);
            });

            return Q.all(promises)
            .then(() => {
                this.vent.trigger('saved:collection');
                return collection;
            });
        },

        /**
         * Saves raw object to the database.
         * @type object JSON object
         * @type object options
         */
        saveRaw: function(data, options) {
            const model  = new (this.changeDatabase(options)).prototype.model(data);
            const errors = model.validate(model.attributes);

            if (errors) {
                console.error('Validation failed:' + model.storeName, errors);
                return;
            }

            return this.decryptModel(model)
            .then(() => this.save(model, data))
            .then(model => this.decryptModel(model))
            .then(model => {
                this.vent.trigger('update:model', model);
                this.vent.trigger('synced:' + model.id, model);
                return model;
            });
        },

        /**
         * Saves all changes.
         * @type array
         */
        saveAllRaw: function(arData, options) {
            const promises = arData.map(data => this.saveRaw(data, options));
            return Q.all(promises);
        },

        /**
         * Remove a model.
         * @type object Backbone model or ID
         * @type object options
         */
        remove: function(model, options) {
            model = typeof model === 'string' ? model : model.id;
            model = new (this.changeDatabase(options)).prototype.model({id: model});

            model.set({'trash': 2, updated: Date.now()});

            return this.save(model, model.attributes)
            .then(() => this.vent.trigger('destroy:model', model));
        },

        /**
         * Find a model by id.
         * @type object options
         */
        getModel: function(options) {
            const Model  = (this.changeDatabase(options)).prototype.model;
            const idAttr = Model.prototype.idAttribute;
            const data   = {};
            const model  = new Model(data);

            data[idAttr] = options[idAttr];

            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return Q(model);
            }

            if (this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(options[idAttr])) {
                return Q(this.collection.get(options[idAttr]));
            }

            return model.fetch()
            .then(() => this.decryptModel(model))
            .then(model => model)
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
            this.vent.trigger('destroy:collection');

            if (options.filter) {
                const cond = this.Collection.prototype.conditions[options.filter];
                options.conditions = typeof cond === 'function' ? cond(options) : cond;
            }

            return this.fetch(options || {})
            .then(collection => {
                this.collection = collection;
                this.collection.conditionFilter  = options.filter;
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
        fetch: function(options) {
            const collection = new (this.changeDatabase(options))();
            return collection.fetch(options)
            .then(() => {
                if (!options.encrypt) {
                    return this.decryptModels(collection.fullCollection || collection)
                    .then(() => {
                        collection.trigger('decrypted');
                        return collection;
                    });
                }

                return collection;
            });
        },

        /**
         * @return boolean
         */
        _isEncryptEnabled: function(model) {
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            const configs = Radio.request('configs', 'get:object');
            const backup  = {encrypt: configs.encryptBackup.encrypt || 0};
            model         = model || this.Collection.prototype.model.prototype;

            return (
                !_.isUndefined(model.encryptKeys) &&
                (Number(configs.encrypt) || Number(backup.encrypt)) === 1
            );
        },

        /**
         * @type object Backbone model
         */
        encryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return Q(model);
            }

            return Radio.request('encrypt', 'encrypt:model', model);
        },

        /**
         * @type object Backbone model
         */
        decryptModel: function(model) {
            if (!this._isEncryptEnabled(model)) {
                return Q(model);
            }

            return Q(Radio.request('encrypt', 'decrypt:model', model));
        },

        /**
         * Decrypt every model in the collection
         * @type object Backbone collection
         */
        decryptModels: function(collection) {
            collection = collection || this.collection;
            if (!this._isEncryptEnabled(collection.model.prototype)) {
                return Q(collection);
            }

            collection = collection.fullCollection || collection;
            return Radio.request('encrypt', 'decrypt:models', collection);
        }
    });

    return Module;
});
```