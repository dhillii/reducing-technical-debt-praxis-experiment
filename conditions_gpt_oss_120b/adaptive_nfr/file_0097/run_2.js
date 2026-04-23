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
     * Predicate: collection is empty.
     * @param {Backbone.Collection} collection
     * @returns {boolean}
     */
    const isEmpty = collection => collection.length === 0;

    /**
     * Predicate: index points beyond the current page models.
     * @param {Backbone.Collection} collection
     * @param {number} index
     * @returns {boolean}
     */
    const isLastOnPage = (collection, index) => index >= collection.models.length;

    /**
     * Predicate: index points before the first model on the page.
     * @param {number} index
     * @returns {boolean}
     */
    const isBeforeFirst = index => index < 0;

    /**
     * Pageable collection with pagination support.
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
            options = options || {};
            options.options = options.options || {};

            if (!_.isUndefined(options.pageSize)) {
                this.state.pageSize = Number(options.pageSize);
            }

            // Do not use pagination
            if (this.state.pageSize === 0) {
                return Backbone.Collection.prototype.fetch.call(this, options);
            }

            const originalSuccess = options.success;
            const self = this;

            options.success = function(resp) {
                // Keep full collection in memory
                self.fullCollection = self.clone();

                // Sort the collection
                self.fullCollection.sortItOut();

                // Pagination
                self._updateTotalPages();
                self.getPage(options.page || self.state.firstPage);

                if (originalSuccess) {
                    originalSuccess(self, resp);
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
         * Destroys full collection and removes event listeners.
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
         * Sets state.currentPage to the given number and overwrites models.
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
         * Sorts the full collection and updates pagination.
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
         * Sorts models in the collection by multiple keys.
         */
        sortItOut: function() {
            const originalComparator = this.comparator;
            const self = this;

            _.each(this.state.comparator, (value, key) => {
                self.comparator = model => (value === 'desc' ? -model.get(key) : model.get(key));
                self.sort();
            });

            this.comparator = originalComparator;
            return this.models;
        },

        getNextItem: function(id) {
            if (isEmpty(this)) {
                return false;
            }

            const model = this.get(id);
            const index = model ? this.indexOf(model) + 1 : 0;

            if (isLastOnPage(this, index)) {
                const event = this.hasNextPage() ? 'page:next' : 'page:end';
                return this.trigger(event);
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        getPreviousItem: function(id) {
            if (isEmpty(this)) {
                return false;
            }

            const model = this.get(id);
            const index = model ? this.indexOf(model) - 1 : this.models.length - 1;

            if (isBeforeFirst(index)) {
                const event = this.hasPreviousPage() ? 'page:previous' : 'page:start';
                return this.trigger(event);
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Handles navigation after a model removal.
         */
        _navigateOnRemove: function(model) {
            const target = this.get(model.id);
            if (!target) {
                return false;
            }

            const coll = this.fullCollection || this;
            const removedIndex = this.indexOf(target);

            coll.remove(target);
            this.sortFullCollection();

            const nextModel = this.at(removedIndex) || this.at(removedIndex - 1);
            if (!nextModel) {
                return this.hasPreviousPage() ? this.trigger('page:previous') : null;
            }

            Radio.trigger(this.storeName, 'model:navigate', nextModel);
        },

        /**
         * Restores a model based on current filter condition.
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
         * Updates pagination when a model is added.
         */
        _onAddItem: function(model) {
            if (this.profileId !== model.profileId) {
                return;
            }

            if (!model.matches(this.conditionCurrent || {trash: 0})) {
                return this._navigateOnRemove(model);
            }

            const coll = this.fullCollection || this;
            const existing = coll.get(model.id);

            if (existing) {
                return existing.set(model.toJSON());
            }

            coll.add(model, {at: 0});
            this.sortFullCollection();
        },

        /**
         * Updates pagination when a model is removed.
         */
        _onRemoveItem: function(model) {
            this.fullCollection.remove(model);
            this.sortFullCollection();
        },

        /**
         * Updates the number of available pages.
         */
        _updateTotalPages: function() {
            this.state.totalPages = Math.ceil(this.fullCollection.length / this.state.pageSize);
        }

    });

    return PageableCollection;
});