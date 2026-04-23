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
            const opts = Object.assign({options: {}}, options);
            if (!_.isUndefined(opts.pageSize)) {
                this.state.pageSize = Number(opts.pageSize);
            }

            // No pagination required
            if (this.state.pageSize === 0) {
                return Backbone.Collection.prototype.fetch.call(this, opts);
            }

            const originalSuccess = opts.success;
            opts.success = (resp) => this._handleFetchSuccess(resp, originalSuccess, opts);

            return Backbone.Collection.prototype.fetch.call(this, opts)
                .then((resp) => {
                    opts.success(resp);
                    return resp;
                });
        },

        /**
         * Process successful fetch: store full collection, sort, paginate.
         */
        _handleFetchSuccess: function(resp, originalSuccess, opts) {
            this.fullCollection = this.clone();
            this.fullCollection.sortItOut();
            this._updateTotalPages();
            this.getPage(opts.page || this.state.firstPage);
            if (originalSuccess) {
                originalSuccess(this, resp);
            }
        },

        /**
         * Register collection events.
         */
        registerEvents: function() {
            this.vent = Radio.channel(this.storeName);
            this.listenTo(this, 'change:isFavorite', this.sortItOut);
            this.listenTo(this, 'reset', this.sortItOut);
            this.listenTo(this.vent, 'update:model', this._onAddItem, this);
            this.listenTo(this.vent, 'destroy:model', this._navigateOnRemove, this);
            this.listenTo(this.vent, 'restore:model', this._onRestore, this);
            return this;
        },

        /**
         * Clean up event listeners and temporary data.
         */
        removeEvents: function() {
            if (this.fullCollection) {
                this.fullCollection.reset();
                this.fullCollection = null;
            }
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
         * Retrieve a specific page of models.
         */
        getPage: function(number) {
            const pageStart = this._getOffset(number);
            this.state.currentPage = number;
            this.models = this.fullCollection.models.slice(pageStart, pageStart + this.state.pageSize);
            return this.models;
        },

        /**
         * Compute offset for a given page number.
         */
        _getOffset: function(number) {
            const zeroBased = this.state.firstPage === 0 ? number : number - 1;
            return zeroBased * this.state.pageSize;
        },

        hasPreviousPage: function() {
            return this.state.currentPage !== this.state.firstPage;
        },

        hasNextPage: function() {
            return this.state.currentPage !== this.state.totalPages - 1;
        },

        /**
         * Re-sort the full collection and refresh pagination.
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
            _.each(this.state.comparator, (direction, key) => {
                this.comparator = (model) => (direction === 'desc' ? -model.get(key) : model.get(key));
                this.sort();
            });
            this.comparator = originalComparator;
            return this.models;
        },

        /**
         * Navigate to the next item relative to the given model id.
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
            this._triggerModelNavigate(this.at(index));
        },

        /**
         * Navigate to the previous item relative to the given model id.
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
            this._triggerModelNavigate(this.at(index));
        },

        /**
         * Helper to trigger model navigation via Radio.
         */
        _triggerModelNavigate: function(model) {
            Radio.trigger(this.storeName, 'model:navigate', model);
        },

        /**
         * When a model is removed, navigate to an appropriate neighbor.
         */
        _navigateOnRemove: function(model) {
            const target = this.get(model.id);
            if (!target) {
                return false;
            }
            const collection = this.fullCollection || this;
            const index = this.indexOf(target);
            collection.remove(target);
            this.sortFullCollection();

            const nextModel = this.at(index) || this.at(index - 1);
            if (nextModel) {
                this._triggerModelNavigate(nextModel);
                return;
            }

            if (this.hasPreviousPage()) {
                this.trigger('page:previous');
            }
        },

        /**
         * Handle model restoration.
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
            if (this.profileId !== model.profileId) {
                return;
            }
            if (!model.matches(this.conditionCurrent || {trash: 0})) {
                return this._navigateOnRemove(model);
            }

            const collection = this.fullCollection || this;
            const existing = collection.get(model.id);
            if (existing) {
                existing.set(model.toJSON());
                return;
            }

            collection.add(model, {at: 0});
            this.sortFullCollection();
        },

        /**
         * Remove a model and refresh pagination.
         */
        _onRemoveItem: function(model) {
            if (this.fullCollection) {
                this.fullCollection.remove(model);
                this.sortFullCollection();
            }
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