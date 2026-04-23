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

    var PageableCollection = Backbone.Collection.extend({

        state: {
            pageSize     : 4,
            firstPage    : 0,
            currentPage  : 0,
            totalRecords : 0,
            comparator   : {'isFavorite' : 'desc', 'created' : 'desc'}
        },

        fetch: function(options) {
            options = options || {};
            options.options = options.options || {};

            this._setPageSize(options.pageSize);

            if (this.state.pageSize === 0) {
                return Backbone.Collection.prototype.fetch.call(this, options);
            }

            const success = options.success;
            const self = this;

            options.success = function(resp) {
                self._handleFetchSuccess(resp, options.page, success);
            };

            return Backbone.Collection.prototype.fetch.call(this, options)
                .then(function(resp) {
                    options.success(resp);
                    return resp;
                });
        },

        _setPageSize: function(pageSize) {
            if (!_.isUndefined(pageSize)) {
                this.state.pageSize = Number(pageSize);
            }
        },

        _handleFetchSuccess: function(resp, page, successCallback) {
            this.fullCollection = this.clone();
            this.fullCollection.sortItOut();
            this._updateTotalPages();
            this.getPage(page || this.state.firstPage);
            if (successCallback) {
                successCallback(this, resp);
            }
        },

        registerEvents: function() {
            this.vent = Radio.channel(this.storeName);

            this.listenTo(this, 'change:isFavorite', this.sortItOut);
            this.listenTo(this, 'reset', this.sortItOut);

            this.listenTo(this.vent, 'update:model', this._onAddItem, this);
            this.listenTo(this.vent, 'destroy:model', this._navigateOnRemove, this);
            this.listenTo(this.vent, 'restore:model', this._onRestore, this);

            return this;
        },

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

        sortFullCollection: function() {
            if (!this.fullCollection) {
                return;
            }

            this.fullCollection.sortItOut();
            this._updateTotalPages();
            this.getPage(this.state.currentPage);
            this.reset(this.models);
        },

        sortItOut: function() {
            const originalComparator = this.comparator;
            const self = this;

            _.each(this.state.comparator, function(value, key) {
                self.comparator = function(model) {
                    const val = model.get(key);
                    return value === 'desc' ? -val : val;
                };
                self.sort();
            });

            this.comparator = originalComparator;
            return this.models;
        },

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

        _navigateOnRemove: function(model) {
            const target = this.get(model.id);
            if (!target) {
                return false;
            }

            const collection = this.fullCollection || this;
            const index = this.indexOf(target);

            collection.remove(target);
            this.sortFullCollection();

            const nextIndex = this.at(index) ? index : index - 1;

            if (!this.at(nextIndex)) {
                return this.hasPreviousPage() ? this.trigger('page:previous') : null;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(nextIndex));
        },

        _onRestore: function(model) {
            if (this.conditionFilter !== 'trashed') {
                return this._onAddItem(model);
            }

            if (this.length > 1) {
                return this._navigateOnRemove(model);
            }
        },

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
                return existing.set(model.toJSON());
            }

            collection.add(model, {at: 0});
            this.sortFullCollection();
        },

        _onRemoveItem: function(model) {
            this.fullCollection.remove(model);
            this.sortFullCollection();
        },

        _updateTotalPages: function() {
            this.state.totalPages = Math.ceil(
                this.fullCollection.length / this.state.pageSize
            );
        }

    });

    return PageableCollection;
});