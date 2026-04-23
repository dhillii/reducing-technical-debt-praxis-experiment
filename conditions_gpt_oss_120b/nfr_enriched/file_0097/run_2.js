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
         * Override `fetch` method to support pagination.
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
         * Register collection events.
         */
        registerEvents: function() {
            this.vent = Radio.channel(this.storeName);

            // Sort the collection again when favorite status is changed
            this.listenTo(this, 'change:isFavorite', this.sortItOut);
            this.listenTo(this, 'reset', this.sortItOut);

            // Listen to model related events
            this.listenTo(this.vent, 'update:model', this._onAddItem, this);
            this.listenTo(this.vent, 'destroy:model', this._navigateOnRemove, this);
            this.listenTo(this.vent, 'restore:model', this._onRestore, this);

            return this;
        },

        /**
         * Clean up collection resources.
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
         * Retrieves a specific page of models.
         */
        getPage: function(number) {
            const pageStart = this.getOffset(number);
            this.state.currentPage = number;
            this.models = this.fullCollection.models.slice(pageStart, pageStart + this.state.pageSize);
            return this.models;
        },

        getOffset: function(number) {
            return ((this.state.firstPage === 0 ? number : number - 1) * this.state.pageSize);
        },

        hasPreviousPage: function() {
            return this.state.currentPage !== this.state.firstPage;
        },

        hasNextPage: function() {
            return this.state.currentPage !== this.state.totalPages - 1;
        },

        /**
         * Re‑sort the full collection and refresh pagination.
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
         * Sort models by multiple keys defined in state.comparator.
         */
        sortItOut: function() {
            const originalComparator = this.comparator;
            const self = this;

            _.each(this.state.comparator, function(value, key) {
                self.comparator = function(model) {
                    return (value === 'desc' ? -model.get(key) : model.get(key));
                };
                self.sort();
            });

            this.comparator = originalComparator;
            return this.models;
        },

        /**
         * Navigate to the next item, handling page boundaries.
         */
        getNextItem: function(id) {
            if (this.length === 0) {
                return false;
            }

            const model = this.get(id);
            const index = model ? this.indexOf(model) + 1 : 0;

            if (index >= this.models.length) {
                return this.trigger(this.hasNextPage() ? 'page:next' : 'page:end');
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Navigate to the previous item, handling page boundaries.
         */
        getPreviousItem: function(id) {
            if (this.length === 0) {
                return false;
            }

            const model = this.get(id);
            const index = model ? this.indexOf(model) - 1 : this.models.length - 1;

            if (index < 0) {
                return this.trigger(this.hasPreviousPage() ? 'page:previous' : 'page:start');
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Handle model removal and navigate appropriately.
         */
        _navigateOnRemove: function(model) {
            const target = this.get(model.id);
            if (!target) {
                return false;
            }

            const collection = this.fullCollection || this;
            const removedIndex = this.indexOf(target);

            collection.remove(target);
            this.sortFullCollection();

            const newIndex = this.at(removedIndex) ? removedIndex : removedIndex - 1;

            if (newIndex < 0) {
                return this.hasPreviousPage() ? this.trigger('page:previous') : null;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(newIndex));
        },

        /**
         * Restore a model from trash, delegating to add or remove logic.
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
         * Add a model to the collection respecting filters and profile.
         */
        _onAddItem: function(model) {
            // Ignore models from other profiles
            if (this.profileId !== model.profileId) {
                return;
            }

            // Remove if it doesn't meet the current filter condition
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
         * Remove a model and refresh pagination.
         */
        _onRemoveItem: function(model) {
            this.fullCollection.remove(model);
            this.sortFullCollection();
        },

        /**
         * Update total page count based on collection size.
         */
        _updateTotalPages: function() {
            this.state.totalPages = Math.ceil(this.fullCollection.length / this.state.pageSize);
        }

    });

    return PageableCollection;
});