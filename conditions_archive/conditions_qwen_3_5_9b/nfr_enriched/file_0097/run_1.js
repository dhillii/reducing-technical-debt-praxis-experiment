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

            var self = this;

            var success = options.success;

            options.success = function(resp) {
                self._handleFetchSuccess(resp, success);
            };

            return Backbone.Collection.prototype.fetch.call(this, options)
            .then(function(resp) {
                options.success(resp);
                return resp;
            });
        },

        /**
         * Handles successful fetch response.
         * @param {Object} resp - Response object
         * @param {Function} success - Original success callback
         */
        _handleFetchSuccess: function(resp, success) {
            this.fullCollection = this.clone();
            this.fullCollection.sortItOut();
            this._updateTotalPages();
            this.getPage(this.state.firstPage);

            if (success) {
                success(this, resp);
            }
        },

        /**
         * Handles events.
         * It needs to be called after a collection was instantiated.
         */
        registerEvents: function() {
            this.vent = Radio.channel(this.storeName);

            this._bindCollectionEvents();
            this._bindChannelEvents();

            return this;
        },

        /**
         * Binds events to the collection itself.
         */
        _bindCollectionEvents: function() {
            this.listenTo(this, 'change:isFavorite', this.sortItOut);
            this.listenTo(this, 'reset', this.sortItOut);
        },

        /**
         * Binds events to the Radio channel.
         */
        _bindChannelEvents: function() {
            this.listenTo(this.vent, 'update:model', this._onAddItem, this);
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
            this._unbindAllListeners();

            return this;
        },

        /**
         * Destroys the full collection.
         */
        _destroyFullCollection: function() {
            if (this.fullCollection) {
                this.fullCollection.reset();
                this.fullCollection = null;
            }
        },

        /**
         * Removes all event listeners.
         */
        _unbindAllListeners: function() {
            this.stopListening();
            this.stopListening(this.vent);
        },

        /**
         * Gets the next page of models.
         */
        getNextPage: function() {
            var models = this.getPage(this.state.currentPage + 1);
            this.reset(models);
        },

        /**
         * Gets the previous page of models.
         */
        getPreviousPage: function() {
            var models = this.getPage(this.state.currentPage - 1);
            this.reset(models);
        },

        /**
         * Sets state.currentPage to the given number.
         * Then, it overwrites models of the current collection.
         * @param {number} number - Page number
         * @returns {Array} - Array of models for the page
         */
        getPage: function(number) {
            var pageStart = this.getOffset(number);

            this.state.currentPage = number;

            this.models = this.fullCollection.models.slice(pageStart, pageStart + this.state.pageSize);

            return this.models;
        },

        /**
         * Calculates the offset for a given page number.
         * @param {number} number - Page number
         * @returns {number} - Offset index
         */
        getOffset: function(number) {
            var isFirstPage = this.state.firstPage === 0;
            var adjustedNumber = isFirstPage ? number : number - 1;

            return adjustedNumber * this.state.pageSize;
        },

        /**
         * Checks if there is a previous page available.
         * @returns {boolean} - True if previous page exists
         */
        hasPreviousPage: function() {
            return this.state.currentPage !== this.state.firstPage;
        },

        /**
         * Checks if there is a next page available.
         * @returns {boolean} - True if next page exists
         */
        hasNextPage: function() {
            return this.state.currentPage !== this.state.totalPages - 1;
        },

        /**
         * Sorts the full collection by the comparator.
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
         * Sorts the collection using the comparator.
         * @returns {Array} - Sorted models
         */
        sortItOut: function() {
            var comparator = this.comparator;
            var self = this;

            this._applyComparator();
            this.sort();

            this.comparator = comparator;
            return this.models;
        },

        /**
         * Applies the comparator function for sorting.
         */
        _applyComparator: function() {
            var comparator = this.state.comparator;

            _.each(comparator, function(value, key) {
                this.comparator = this._createComparator(key, value);
            }, this);
        },

        /**
         * Creates a comparator function for a specific key and direction.
         * @param {string} key - Model key to sort by
         * @param {string} value - Sort direction ('asc' or 'desc')
         * @returns {Function} - Comparator function
         */
        _createComparator: function(key, value) {
            return function(model) {
                return (value === 'desc' ? (-model.get(key)) : model.get(key));
            };
        },

        /**
         * Gets the next model in the collection.
         * @param {string} id - Model ID
         * @returns {Object|boolean} - Next model or false
         */
        getNextItem: function(id) {
            if (this.length === 0) {
                return false;
            }

            var model = this.get(id);
            var index = model ? this.indexOf(model) + 1 : 0;

            if (index >= this.models.length) {
                return this._triggerPageEnd();
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Gets the previous model in the collection.
         * @param {string} id - Model ID
         * @returns {Object|boolean} - Previous model or false
         */
        getPreviousItem: function(id) {
            if (this.length === 0) {
                return false;
            }

            var model = this.get(id);
            var index = model ? this.indexOf(model) - 1 : this.models.length - 1;

            if (index < 0) {
                return this._triggerPageStart();
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Triggers page:next or page:end event.
         * @returns {Object|boolean} - Triggered event result
         */
        _triggerPageEnd: function() {
            return this.trigger(
                this.hasNextPage() ? 'page:next' : 'page:end'
            );
        },

        /**
         * Triggers page:previous or page:start event.
         * @returns {Object|boolean} - Triggered event result
         */
        _triggerPageStart: function() {
            return this.trigger(
                this.hasPreviousPage() ? 'page:previous' : 'page:start'
            );
        },

        /**
         * Handles model removal and navigation.
         * @param {Object} model - Removed model
         */
        _navigateOnRemove: function(model) {
            model = this.get(model.id);

            if (!model) {
                return false;
            }

            var coll = this.fullCollection || this;
            var index = this.indexOf(model);

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
         * Handles model restoration from trash.
         * @param {Object} model - Restored model
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
         * Handles adding a new model to the collection.
         * @param {Object} model - Model to add
         */
        _onAddItem: function(model) {
            if (this.profileId !== model.profileId) {
                return;
            }

            if (!model.matches(this.conditionCurrent || {trash: 0})) {
                return this._navigateOnRemove(model);
            }

            var coll = this.fullCollection || this;
            var colModel = coll.get(model.id);

            if (colModel) {
                return colModel.set(model.toJSON());
            }

            coll.add(model, {at: 0});
            this.sortFullCollection();
        },

        /**
         * Handles removing a model from the collection.
         * @param {Object} model - Model to remove
         */
        _onRemoveItem: function(model) {
            this.fullCollection.remove(model);
            this.sortFullCollection();
        },

        /**
         * Updates the number of available pages.
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