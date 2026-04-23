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
    'backbone',
    'backbone.radio'
], function(_, Backbone, Radio) {
    'use strict';

    /**
     * Pagination support for Backbone collections.
     * Some code was borrowed from the plugin Backbone.paginator.
     *
     * Triggers:
     * ---------
     * Events to channel `notes`:
     * 1. `model:navigate` - when the next or previous model was requested
     *     or a model was removed.
     *
     * Events to itself (e.g. collection):
     * 1. `page:next` - when the next model was requested but a user
     *     has reached the last model on the page.
     * 2. `page:previous` - when the previous model was requested but a user
     *     has reached the first model on the page.
     */
    var PageableCollection = Backbone.Collection.extend({

        // Default pagination settings
        state: {
            pageSize     : 4,
            firstPage    : 0,
            currentPage  : 0,
            totalRecords : 0,
            comparator   : {'isFavorite' : 'desc', 'created' : 'desc'}
        },

        /**
         * Overwrite `fetch` method to handle pagination.
         */
        fetch: function(options) {
            options = options || {};
            options.options = options.options || {};

            if (!_.isUndefined(options.pageSize)) {
                this.state.pageSize = Number(options.pageSize);
            }

            // Do not use pagination
            if (this.state.pageSize === 0) {
                return Backbone.Collection.prototype.fetch.call(this, options);
            }

            var success = options.success,
                self    = this;

            options.success = function(resp) {
                self._handleFetchSuccess(resp);
                if (success) {
                    success(self, resp);
                }
            };

            return Backbone.Collection.prototype.fetch.call(this, options)
            .then(function(resp) {
                options.success(resp);
                return resp;
            });
        },

        /**
         * Handles events.
         * It needs to be called after a collection was instantiated.
         */
        registerEvents: function() {
            this.vent = Radio.channel(this.storeName);

            this._registerCollectionEvents();
            this._registerChannelEvents();

            return this;
        },

        /**
         * Register events for collection changes.
         */
        _registerCollectionEvents: function() {
            this.listenTo(this, 'change:isFavorite', this.sortItOut);
            this.listenTo(this, 'reset', this.sortItOut);
        },

        /**
         * Register events for channel communication.
         */
        _registerChannelEvents: function() {
            this.listenTo(this.vent, 'update:model' , this._onAddItem, this);
            this.listenTo(this.vent, 'destroy:model', this._navigateOnRemove, this);
            this.listenTo(this.vent, 'restore:model', this._onRestore, this);
        },

        /**
         * It makes some "garbage collection"
         * by destroying full collection and event listeners.
         * If a collection is no longer in use, this method should be called.
         */
        removeEvents: function() {
            this._destroyFullCollection();
            this._removeAllListeners();

            return this;
        },

        /**
         * Destroy the full collection if it exists.
         */
        _destroyFullCollection: function() {
            if (this.fullCollection) {
                this.fullCollection.reset();
                this.fullCollection = null;
            }
        },

        /**
         * Remove all event listeners.
         */
        _removeAllListeners: function() {
            this.stopListening();
            this.stopListening(this.vent);
        },

        /**
         * Get the next page of models.
         */
        getNextPage: function() {
            var models = this.getPage(this.state.currentPage + 1);
            this.reset(models);
        },

        /**
         * Get the previous page of models.
         */
        getPreviousPage: function() {
            var models = this.getPage(this.state.currentPage - 1);
            this.reset(models);
        },

        /**
         * Sets state.currentPage to the given number.
         * Then, it overwrites models of the current collection.
         */
        getPage: function(number) {
            var pageStart = this.getOffset(number);

            this.state.currentPage = number;
            this.models = this.fullCollection.models.slice(pageStart, pageStart + this.state.pageSize);

            return this.models;
        },

        /**
         * Calculate the offset for a given page number.
         */
        getOffset: function(number) {
            var isFirstPage = this.state.firstPage === 0;
            var adjustedNumber = isFirstPage ? number : number - 1;

            return adjustedNumber * this.state.pageSize;
        },

        /**
         * Check if there is a previous page available.
         */
        hasPreviousPage: function() {
            return this.state.currentPage !== this.state.firstPage;
        },

        /**
         * Check if there is a next page available.
         */
        hasNextPage: function() {
            return this.state.currentPage !== this.state.totalPages - 1;
        },

        /**
         * Sort the full collection by the defined comparator.
         */
        sortFullCollection: function() {
            if (!this.fullCollection) {
                return;
            }

            this.fullCollection.sortItOut();
            this._updateTotalPages();
            this.getPage(this.state.currentPage);
            this.reset(this.models);
        },

        /**
         * Sort the collection by multiple keys.
         */
        sortItOut: function() {
            var comparator = this.comparator,
                self = this;

            _.each(this.state.comparator, function(value, key) {
                self.comparator = self._createComparator(value, key);
                self.sort();
            });

            this.comparator = comparator;
            return this.models;
        },

        /**
         * Create a comparator function for a single key.
         */
        _createComparator: function(value, key) {
            return function(model) {
                return (value === 'desc' ? (-model.get(key)) : model.get(key));
            };
        },

        /**
         * Get the next item by ID and trigger navigation.
         */
        getNextItem: function(id) {
            if (this.length === 0) {
                return false;
            }

            var model  = this.get(id),
                index  = model ? this.indexOf(model) + 1 : 0;

            if (index >= this.models.length) {
                return this._triggerPageEnd();
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Get the previous item by ID and trigger navigation.
         */
        getPreviousItem: function(id) {
            if (this.length === 0) {
                return false;
            }

            var model = this.get(id),
                index = model ? this.indexOf(model) - 1 : this.models.length - 1;

            if (index < 0) {
                return this._triggerPageStart();
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Trigger page end event when at the last model.
         */
        _triggerPageEnd: function() {
            return this.trigger(
                this.hasNextPage() ? 'page:next' : 'page:end'
            );
        },

        /**
         * Trigger page start event when at the first model.
         */
        _triggerPageStart: function() {
            return this.trigger(
                this.hasPreviousPage() ? 'page:previous' : 'page:start'
            );
        },

        /**
         * Handle fetch success response.
         */
        _handleFetchSuccess: function(resp) {
            this.fullCollection = this.clone();
            this.fullCollection.sortItOut();
            this._updateTotalPages();
            this.getPage(this.state.firstPage);
        },

        /**
         * When some model was removed, trigger `model:navigate` event.
         * @type object Backbone model
         */
        _navigateOnRemove: function(model) {
            model = this.get(model.id);
            if (!model) {
                return false;
            }

            var coll = this.fullCollection || this,
                index = this.indexOf(model);

            coll.remove(model);
            this.sortFullCollection();

            if (!this.at(index)) {
                index--;
            }

            if (!this.at(index)) {
                return this.hasPreviousPage() ? this.trigger('page:previous') : null;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * When a model was restored from trash.
         */
        _onRestore: function(model) {
            if (this.conditionFilter !== 'trashed') {
                return this._onAddItem(model);
            }

            if (this.length > 1) {
                return this._navigateOnRemove(model);
            }
        },

        /**
         * Update pagination when a model is added.
         */
        _onAddItem: function(model) {
            if (this.profileId !== model.profileId) {
                return;
            }

            if (!model.matches(this.conditionCurrent || {trash: 0})) {
                return this._navigateOnRemove(model);
            }

            var coll = this.fullCollection || this,
                colModel = coll.get(model.id);

            if (colModel) {
                return colModel.set(model.toJSON());
            }

            coll.add(model, {at: 0});
            this.sortFullCollection();
        },

        /**
         * Update pagination when a model is removed.
         */
        _onRemoveItem: function(model) {
            this.fullCollection.remove(model);
            this.sortFullCollection();
        },

        /**
         * Update the number of available pages.
         */
        _updateTotalPages: function() {
            this.state.totalPages = Math.ceil(
                this.fullCollection.length / this.state.pageSize
            );
        }

    });

    return PageableCollection;
});
```