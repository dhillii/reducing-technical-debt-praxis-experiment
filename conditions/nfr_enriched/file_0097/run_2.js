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
         * Override `fetch` method.
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

            var success = options.success;
            var self = this;

            options.success = function(resp) {
                self._onFetchSuccess(resp, success);
            };

            return Backbone.Collection.prototype.fetch.call(this, options)
                .then(function(resp) {
                    options.success(resp);
                    return resp;
                });
        },

        /**
         * Handle successful fetch completion
         */
        _onFetchSuccess: function(resp, callback) {
            // Keep full collection in memory
            this.fullCollection = this.clone();

            // Sort the collection
            this.fullCollection.sortItOut();

            // Pagination
            this._updateTotalPages();
            this.getPage(this.state.firstPage);

            if (callback) {
                callback(this, resp);
            }
        },

        /**
         * Handles events.
         * It needs to be called after a collection was instantiated.
         */
        registerEvents: function() {
            this.vent = Radio.channel(this.storeName);

            // Sort the collection again when favorite status is changed
            this.listenTo(this, 'change:isFavorite', this.sortItOut);
            this.listenTo(this, 'reset', this.sortItOut);

            // Listen to events
            this.listenTo(this.vent, 'update:model', this._onAddItem, this);
            this.listenTo(this.vent, 'destroy:model', this._navigateOnRemove, this);
            this.listenTo(this.vent, 'restore:model', this._onRestore, this);

            return this;
        },

        /**
         * It makes some "garbage collection"
         * by destroying full collection and event listeners.
         * If a collection is no longer in use, this method should be called.
         */
        removeEvents: function() {
            // Destroy a full collection
            if (this.fullCollection) {
                this.fullCollection.reset();
                this.fullCollection = null;
            }

            // Remove all the event listeners
            this.stopListening();
            this.stopListening(this.vent);

            return this;
        },

        getNextPage: function() {
            this._changePage(this.state.currentPage + 1);
        },

        getPreviousPage: function() {
            this._changePage(this.state.currentPage - 1);
        },

        /**
         * Change to a specific page and reset the collection
         */
        _changePage: function(pageNumber) {
            var models = this.getPage(pageNumber);
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

        getOffset: function(number) {
            return (
                (this.state.firstPage === 0 ? number : number - 1) *
                this.state.pageSize
            );
        },

        hasPreviousPage: function() {
            return this.state.currentPage !== this.state.firstPage;
        },

        hasNextPage: function() {
            return this.state.currentPage !== this.state.totalPages - 1;
        },

        /**
         * It is used to sort models in full collection.
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
         * Useful when sorting models in a collection by multiple keys.
         */
        sortItOut: function() {
            var comparator = this.comparator;
            var self = this;

            _.each(this.state.comparator, function(value, key) {
                self.comparator = function(model) {
                    var val = model.get(key);
                    return value === 'desc' ? -val : val;
                };
                self.sort();
            });

            this.comparator = comparator;
            return this.models;
        },

        getNextItem: function(id) {
            this._navigateItem(id, 1, 'next', 'end');
        },

        getPreviousItem: function(id) {
            this._navigateItem(id, -1, 'previous', 'start');
        },

        /**
         * Navigate to next or previous item
         */
        _navigateItem: function(id, direction, pageEvent, boundaryEvent) {
            if (this.length === 0) {
                return false;
            }

            var model = this.get(id);
            var index = model ? this.indexOf(model) + direction : (direction > 0 ? 0 : this.models.length - 1);

            if (this._isOutOfBounds(index, direction)) {
                var event = direction > 0 ? this.hasNextPage() : this.hasPreviousPage();
                return this.trigger(event ? ('page:' + pageEvent) : ('page:' + boundaryEvent));
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Check if index is out of bounds
         */
        _isOutOfBounds: function(index, direction) {
            return direction > 0 ? index >= this.models.length : index < 0;
        },

        /**
         * When some model was removed, trigger `model:navigate` event
         * passing a model which has the same index as the removed model.
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

            this._navigateAfterRemoval(index);
        },

        /**
         * Navigate after a model removal
         */
        _navigateAfterRemoval: function(index) {
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
         * Update pagination when a model is added
         */
        _onAddItem: function(model) {
            // Don't add models from other profiles
            if (this.profileId !== model.profileId) {
                return;
            }

            // Remove a model from the collection if it doesn't meet the current filter condition
            if (!model.matches(this.conditionCurrent || {trash: 0})) {
                return this._navigateOnRemove(model);
            }

            var coll = this.fullCollection || this;
            var colModel = coll.get(model.id);

            if (colModel) {
                return colModel.set(model.toJSON());
            }

            // Add it to fullCollection and sort the collection again
            coll.add(model, {at: 0});
            this.sortFullCollection();
        },

        /**
         * Update pagination when a model is removed
         */
        _onRemoveItem: function(model) {
            this.fullCollection.remove(model);
            this.sortFullCollection();
        },

        /**
         * Updates the number of available pages
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