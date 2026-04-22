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
         * Overwrite `fetch` method.
         */
        fetch(options) {
            const opts = Object.assign({options: {}}, options);
            if (!_.isUndefined(opts.pageSize)) {
                this.state.pageSize = Number(opts.pageSize);
            }

            // Do not use pagination
            if (this.state.pageSize === 0) {
                return Backbone.Collection.prototype.fetch.call(this, opts);
            }

            const originalSuccess = opts.success;
            const self = this;

            opts.success = (resp) => {
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
                .then((resp) => {
                    opts.success(resp);
                    return resp;
                });
        },

        /**
         * Handles events.
         * It needs to be called after a collection was instantiated.
         */
        registerEvents() {
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
        removeEvents() {
            if (this.fullCollection) {
                this.fullCollection.reset();
                this.fullCollection = null;
            }

            this.stopListening();
            this.stopListening(this.vent);

            return this;
        },

        getNextPage() {
            const models = this.getPage(this.state.currentPage + 1);
            this.reset(models);
        },

        getPreviousPage() {
            const models = this.getPage(this.state.currentPage - 1);
            this.reset(models);
        },

        /**
         * Sets state.currentPage to the given number.
         * Then, it overwrites models of the current collection.
         */
        getPage(number) {
            const pageStart = this.getOffset(number);
            this.state.currentPage = number;
            this.models = this.fullCollection.models.slice(pageStart, pageStart + this.state.pageSize);
            return this.models;
        },

        getOffset(number) {
            return ((this.state.firstPage === 0 ? number : number - 1) * this.state.pageSize);
        },

        hasPreviousPage() {
            return this.state.currentPage !== this.state.firstPage;
        },

        hasNextPage() {
            return this.state.currentPage !== this.state.totalPages - 1;
        },

        /**
         * It is used to sort models in full collection.
         */
        sortFullCollection() {
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
        sortItOut() {
            const originalComparator = this.comparator;
            const self = this;

            _.each(this.state.comparator, (value, key) => {
                self.comparator = (model) => (value === 'desc' ? -model.get(key) : model.get(key));
                self.sort();
            });

            this.comparator = originalComparator;
            return this.models;
        },

        /**
         * Navigate to the next item or page.
         */
        getNextItem(id) {
            if (this._isEmpty()) {
                return false;
            }

            const model = this.get(id);
            const index = model ? this.indexOf(model) + 1 : 0;

            if (this._isLastOnPage(index)) {
                return this.trigger(this.hasNextPage() ? 'page:next' : 'page:end');
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Navigate to the previous item or page.
         */
        getPreviousItem(id) {
            if (this._isEmpty()) {
                return false;
            }

            const model = this.get(id);
            const index = model ? this.indexOf(model) - 1 : this.models.length - 1;

            if (this._isFirstOnPage(index)) {
                return this.trigger(this.hasPreviousPage() ? 'page:previous' : 'page:start');
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * When some model was removed, trigger `model:navigate` event
         * passing a model which has the same index as the removed model.
         * @type object Backbone model
         */
        _navigateOnRemove(model) {
            const target = this.get(model.id);
            if (!target) {
                return false;
            }

            const coll = this.fullCollection || this;
            const index = this.indexOf(target);

            coll.remove(target);
            this.sortFullCollection();

            const adjustedIndex = this.at(index) ? index : index - 1;
            if (!this.at(adjustedIndex)) {
                return this.hasPreviousPage() ? this.trigger('page:previous') : null;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(adjustedIndex));
        },

        /**
         * When a model was restored from trash.
         */
        _onRestore(model) {
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
        _onAddItem(model) {
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
         * Update pagination when a model is removed
         */
        _onRemoveItem(model) {
            this.fullCollection.remove(model);
            this.sortFullCollection();
        },

        /**
         * Updates the number of available pages
         */
        _updateTotalPages() {
            this.state.totalPages = Math.ceil(this.fullCollection.length / this.state.pageSize);
        },

        // ---------- Predicate helpers ----------
        /**
         * Returns true if the collection has no models.
         * @private
         */
        _isEmpty() {
            return this.length === 0;
        },

        /**
         * Returns true if the given index points beyond the current page models.
         * @private
         */
        _isLastOnPage(index) {
            return index >= this.models.length;
        },

        /**
         * Returns true if the given index is before the first model of the page.
         * @private
         */
        _isFirstOnPage(index) {
            return index < 0;
        }
    });

    return PageableCollection;
});