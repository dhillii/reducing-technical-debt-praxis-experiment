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
            this.listenTo(this.vent, 'destroy:collection', this.onReset, this);
        },

        /**
         * Switch to another database (e.g. profile)
         * @type object
         */
        changeDatabase: function(options) {
            const profile = this._extractProfile(options);
            const model = this._createProfileModel(profile);
            const collection = this._createProfileCollection(profile, model);

            return collection;
        },

        /**
         * Extract profile from options or use default
         * @type object options
         * @return string profile identifier
         */
        _extractProfile: function(options) {
            return (options && options.profile) ? options.profile : this.defaultDB;
        },

        /**
         * Create a model with profile context
         * @type string profile
         * @return object extended model
         */
        _createProfileModel: function(profile) {
            return this.Collection.prototype.model.extend({
                profileId : profile
            });
        },

        /**
         * Create a collection with profile context
         * @type string profile
         * @type object model
         * @return object extended collection
         */
        _createProfileCollection: function(profile, model) {
            return this.Collection.extend({
                profileId : profile,
                model     : model
            });
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
            const self = this;
            const setF = model.setEscape ? 'setEscape' : 'set';
            const errors = model.validate(data);

            if (errors) {
                model.trigger('invalid', model, errors);
                return Q.reject('Validation error:' + model.storeName, errors);
            }

            // Set new values
            model[setF](data);

            return new Q(self.encryptModel(model))
            .then(function(model) {
                return new Q(model.save(model.attributes, {validate: false}))
                .thenResolve(model);
            });
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
            .then(function(model) {
                self.vent.trigger('sync:model', model);
                return self.decryptModel(model);
            })
            .then(function(model) {
                self.vent.trigger('update:model', model);
                return model;
            });
        },

        /**
         * Save all changes in the collection.
         * @type object Backbone collection
         */
        saveCollection: function(collection) {
            const promises = [];
            const self = this;
            collection = collection || this.collection;

            collection.each(function(model) {
                model.attributes.updated = Date.now();

                promises.push(
                    Q.invoke(model, 'save', model.attributes)
                );
            });

            return Q.all(promises)
            .then(function() {
                self.vent.trigger('saved:collection');
                return collection;
            });
        },

        /**
         * Saves raw object to the database.
         * @type object JSON object
         * @type object options
         */
        saveRaw: function(data, options) {
            const self = this;
            const model = new (this.changeDatabase(options)).prototype.model(data);

            return this.decryptModel(model)
            .then(function() {
                return self._validateAndSaveRawModel(model, data);
            });
        },

        /**
         * Validate and save a raw model
         * @type object model
         * @type object data
         * @return object promise
         */
        _validateAndSaveRawModel: function(model, data) {
            const self = this;
            const errors = model.validate(model.attributes);

            // Don't save data which can't be validated
            if (errors) {
                console.error('Validation failed:' + model.storeName, errors);
                return;
            }

            return self.save(model, data)
            .then(self.decryptModel)
            .then(function(model) {
                self.vent.trigger('update:model', model);
                self.vent.trigger('synced:' + model.id, model);
                return model;
            });
        },

        /**
         * Saves all changes.
         * @type array
         */
        saveAllRaw: function(arData, options) {
            const promises = [];
            const self = this;

            _.each(arData, function(data) {
                promises.push(function() {
                    return self.saveRaw(data, options);
                });
            });

            return _.reduce(promises, Q.when, new Q());
        },

        /**
         * Remove a model.
         * @type object Backbone model or ID
         * @type object options
         */
        remove: function(model, options) {
            const self = this;

            // Change model's attributes to default values (empty values)
            const modelId = typeof model === 'string' ? model : model.id;
            const removeModel = new (this.changeDatabase(options)).prototype.model({id: modelId});

            removeModel.set({'trash': 2, updated: Date.now()});

            return this.save(removeModel, removeModel.attributes)
            .then(function() {
                self.vent.trigger('destroy:model', removeModel);
            });
        },

        /**
         * Find a model by id.
         * @type object options
         */
        getModel: function(options) {
            const Model = (this.changeDatabase(options)).prototype.model;
            const idAttr = Model.prototype.idAttribute;
            const data = {};

            data[idAttr] = options[idAttr];
            const model = new Model(data);

            // If id was not provided, return a model with default values
            if (!options[idAttr] || options[idAttr] === '0') {
                model.set(idAttr, undefined);
                return new Q(model);
            }

            // In case if the collection isn't empty, get the model from there.
            if (this._shouldGetModelFromCollection(model, options)) {
                return new Q(this.collection.get(options[idAttr]));
            }

            const self = this;

            return new Q(model.fetch())
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

        /**
         * Check if model should be retrieved from collection
         * @type object model
         * @type object options
         * @return boolean
         */
        _shouldGetModelFromCollection: function(model, options) {
            return this.collection &&
                this.collection.profileId === model.profileId &&
                this.collection.get(options[model.prototype.idAttribute || 'id']);
        },

        /**
         * Fetch data and create a new collection.
         * @type object options
         */
        getAll: function(options) {
            const self = this;
            this.vent.trigger('destroy:collection');

            // Add filter conditions
            if (options.filter) {
                const cond = this.Collection.prototype.conditions[options.filter];
                options.conditions = (typeof cond === 'function' ? cond(options) : cond);
            }

            return this.fetch(options || {})
            .then(function(collection) {
                return self._setupCollectionAndRegisterEvents(collection, options);
            });
        },

        /**
         * Setup collection properties and register event listeners
         * @type object collection
         * @type object options
         * @return object collection
         */
        _setupCollectionAndRegisterEvents: function(collection, options) {
            const self = this;
            self.collection = collection;
            self.collection.conditionFilter = options.filter;
            self.collection.conditionCurrent = options.conditions;

            // Register events
            if (self.collection.registerEvents) {
                self.collection.registerEvents();
            }

            // Events
            self.listenTo(self.collection, 'reset:all', self.onReset);

            return self.collection;
        },

        /**
         * Fetch data.
         * @type object options
         */
        fetch: function(options) {
            const collection = new (this.changeDatabase(options))();
            const self = this;

            return new Q(collection.fetch(options))
            .then(function() {
                return self._handleFetchedCollection(collection, options);
            });
        },

        /**
         * Handle decryption and return of fetched collection
         * @type object collection
         * @type object options
         * @return object promise resolving to collection
         */
        _handleFetchedCollection: function(collection, options) {
            const self = this;

            // Return in decrypted format
            if (!options.encrypt) {
                return self.decryptModels(collection.fullCollection || collection)
                .then(function() {
                    collection.trigger('decrypted');
                    return;
                })
                .thenResolve(collection);
            }

            return collection;
        },

        /**
         * @return boolean
         */
        _isEncryptEnabled: function(model) {
            // Don't use encryption on configs
            if (this.Collection.prototype.storeName === 'configs') {
                return false;
            }

            const configs = Radio.request('configs', 'get:object');
            const backup = {encrypt: configs.encryptBackup.encrypt || 0};
            const modelProto = model || this.Collection.prototype.model.prototype;

            return (
                !_.isUndefined(modelProto.encryptKeys) &&
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

            return new Q(
                Radio.request('encrypt', 'decrypt:model', model)
            );
        },

        /**
         * Decrypt every model in the collection
         * @type object Backbone collection
         */
        decryptModels: function(collection) {
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