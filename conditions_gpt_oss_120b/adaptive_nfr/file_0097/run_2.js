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
    const PageableCollection = Backbone.Collection.extend({

        // Default pagination settings
        state: {
            pageSize     : 4,
            firstPage    : 0,
            currentPage  : 0,
            totalRecords : 0,
            comparator   : {'isFavorite' : 'desc', 'created' : 'desc'}
        },

        /**
         * Overwrite `fetch` method.
         */
        fetch: function(options) {
            const opts = options || {};
            opts.options = opts.options || {};

            if (!_.isUndefined(opts.pageSize)) {
                this.state.pageSize = Number(opts.pageSize);
            }

            // Do not use pagination
            if (this.state.pageSize === 0) {
                return Backbone.Collection.prototype.fetch.call(this, opts);
            }

            const originalSuccess = opts.success;
            const self = this;

            opts.success = function(resp) {
                // Keep full collection in memory
                self.fullCollection = self.clone();

                // Sort the collection
                self.fullCollection.sortItOut();

                // Pagination
                self._updateTotalPages();
                self.getPage(opts.page || self.state.firstPage);

                if (originalSuccess) {
                    originalSuccess(self, resp);
                }
            };

            return Backbone.Collection.prototype.fetch.call(this, opts)
                .then(function(resp) {
                    opts.success(resp);
                    return resp;
                });
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
            const models = this.getPage(this.state.currentPage + 1);
            this.reset(models);
        },

        getPreviousPage: function() {
            const models = this.getPage(this.state.currentPage - 1);
            this.reset(models);
        },

        /**
         * Sets state.currentPage to the given number.
         * Then, it overwrites models of the current collection.
         */
        getPage: function(number) {
            // Calculate page number
            const pageStart = this.getOffset(number);

            // Save where we currently are
            this.state.currentPage = number;

            // Slice an array of models
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

            // Sort the full collection again
            this.fullCollection.sortItOut();

            // Update pagination state
            this._updateTotalPages();
            this.getPage(this.state.currentPage);

            // Reset the collection so the view could re-render itself
            this.reset(this.models);
        },

        /**
         * Useful when sorting models in a collection by multiple keys.
         */
        sortItOut: function() {
            const originalComparator = this.comparator;
            const self = this;

            _.each(this.state.comparator, function(value, key) {
                self.comparator = function(model) {
                    return (value === 'desc' ? (-model.get(key)) : model.get(key));
                };
                self.sort();
            });

            this.comparator = originalComparator;
            return this.models;
        },

        /**
         * Retrieves the next item relative to the given model id.
         * @param {string|number} id Model identifier.
         * @returns {boolean|undefined}
         */
        getNextItem: function(id) {
            if (this._isEmpty()) {
                return false;
            }

            const model = this.get(id);
            const index = model ? this.indexOf(model) + 1 : 0;

            if (index >= this.models.length) {
                return this._triggerPageBoundary(true);
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Retrieves the previous item relative to the given model id.
         * @param {string|number} id Model identifier.
         * @returns {boolean|undefined}
         */
        getPreviousItem: function(id) {
            if (this._isEmpty()) {
                return false;
            }

            const model = this.get(id);
            const index = model ? this.indexOf(model) - 1 : this.models.length - 1;

            if (index < 0) {
                return this._triggerPageBoundary(false);
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * When some model was removed, trigger `model:navigate` event
         * passing a model which has the same index as the removed model.
         * @param {Backbone.Model} model Model to navigate from.
         */
        _navigateOnRemove: function(model) {
            const target = this.get(model.id);
            if (!target) {
                return false;
            }

            const collection = this.fullCollection || this;
            const originalIndex = this.indexOf(target);

            collection.remove(target);
            this.sortFullCollection();

            const adjustedIndex = this._findValidIndexAfterRemoval(originalIndex);
            if (adjustedIndex === null) {
                return this.hasPreviousPage() ? this.trigger('page:previous') : null;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(adjustedIndex));
        },

        /**
         * When a model was restored from trash.
         * @param {Backbone.Model} model Restored model.
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
         * @param {Backbone.Model} model Model to add.
         */
        _onAddItem: function(model) {
            // Don't add models from other profiles
            if (this.profileId !== model.profileId) {
                return;
            }

            // Remove a model from the collection if it doesn't meet the current filter condition.
            if (!model.matches(this.conditionCurrent || {trash: 0})) {
                return this._navigateOnRemove(model);
            }

            const collection = this.fullCollection || this;
            const existing = collection.get(model.id);

            if (existing) {
                return existing.set(model.toJSON());
            }

            collection.add(model, {at: 0});
            this.sortFullCollection();
        },

        /**
         * Update pagination when a model is removed.
         * @param {Backbone.Model} model Model to remove.
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
        },

        /**
         * Determines whether the collection is empty.
         * @private
         * @returns {boolean}
         */
        _isEmpty: function() {
            return this.length === 0;
        },

        /**
         * Triggers the appropriate page boundary event.
         * @private
         * @param {boolean} isNext True for next page, false for previous.
         * @returns {boolean|undefined}
         */
        _triggerPageBoundary: function(isNext) {
            return this.trigger(
                isNext
                    ? (this.hasNextPage() ? 'page:next' : 'page:end')
                    : (this.hasPreviousPage() ? 'page:previous' : 'page:start')
            );
        },

        /**
         * Finds a valid index after a removal operation.
         * Returns null if no valid index exists.
         * @private
         * @param {number} originalIndex Index of the removed model before removal.
         * @returns {number|null}
         */
        _findValidIndexAfterRemoval: function(originalIndex) {
            if (this.at(originalIndex)) {
                return originalIndex;
            }

            const previousIndex = originalIndex - 1;
            if (this.at(previousIndex)) {
                return previousIndex;
            }

            return null;
        }

    });

    return PageableCollection;
});