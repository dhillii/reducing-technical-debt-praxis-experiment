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
         * Overwrite `fetch` method.
         */
        fetch: function(options) {
            options = options || {};
            options.options = options.options || {};

            setPageSize(this, options);

            if (this.state.pageSize === 0) {
                return Backbone.Collection.prototype.fetch.call(this, options);
            }

            const success = options.success;
            const self = this;

            options.success = function(resp) {
                self.fullCollection = self.clone();
                self.fullCollection.sortItOut();
                self._updateTotalPages();
                self.getPage(options.page || self.state.firstPage);
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

            // Sort the collection again when favorite status is changed
            this.listenTo(this, 'change:isFavorite', this.sortItOut);
            this.listenTo(this, 'reset', this.sortItOut);

            // Listen to events
            this.listenTo(this.vent, 'update:model' , this._onAddItem, this);
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
            const pageStart = this.getOffset(number);
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
            const originalComparator = this.comparator;
            const self = this;

            _.each(this.state.comparator, function(value, key) {
                self.comparator = function(model) {
                    return value === 'desc' ? -model.get(key) : model.get(key);
                };
                self.sort();
            });

            this.comparator = originalComparator;
            return this.models;
        },

        getNextItem: function(id) {
            return this._navigateItem(id, 'next');
        },

        getPreviousItem: function(id) {
            return this._navigateItem(id, 'previous');
        },

        /**
         * When some model was removed, trigger `model:navigate` event
         * passing a model which has the same index as the removed model.
         * @type object Backbone model
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

            const newIndex = this._getValidIndex(index);
            if (newIndex === null) {
                if (this.hasPreviousPage()) {
                    this.trigger('page:previous');
                }
                return null;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(newIndex));
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
        },

        /**
         * Helper: returns a valid index after removal or null if none.
         */
        _getValidIndex: function(index) {
            if (this.at(index)) {
                return index;
            }
            if (this.at(index - 1)) {
                return index - 1;
            }
            return null;
        },

        /**
         * Helper: navigate to next or previous item.
         */
        _navigateItem: function(id, direction) {
            if (this.length === 0) {
                return false;
            }

            const model = this.get(id);
            const step = direction === 'next' ? 1 : -1;
            const startIndex = model ? this.indexOf(model) : (direction === 'next' ? 0 : this.models.length - 1);
            const index = startIndex + step;

            if (direction === 'next') {
                if (index >= this.models.length) {
                    return this.trigger(this.hasNextPage() ? 'page:next' : 'page:end');
                }
            } else {
                if (index < 0) {
                    return this.trigger(this.hasPreviousPage() ? 'page:previous' : 'page:start');
                }
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        }
    });

    /**
     * Sets the page size for a collection based on options.
     */
    function setPageSize(collection, options) {
        if (!_.isUndefined(options.pageSize)) {
            collection.state.pageSize = Number(options.pageSize);
        }
    }

    return PageableCollection;
});