define([
    'underscore',
    'backbone',
    'backbone.radio'
], function(_, Backbone, Radio) {
    'use strict';

    const PageableCollection = Backbone.Collection.extend({

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

            if (!_.isUndefined(options.pageSize)) {
                this.state.pageSize = Number(options.pageSize);
            }

            if (this.state.pageSize === 0) {
                return Backbone.Collection.prototype.fetch.call(this, options);
            }

            const success = options.success;
            const self    = this;

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

        registerEvents: function() {
            this.vent = Radio.channel(this.storeName);

            this.listenTo(this, 'change:isFavorite', this.sortItOut);
            this.listenTo(this, 'reset', this.sortItOut);

            this.listenTo(this.vent, 'update:model' , this._onAddItem, this);
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
            const comparator = this.comparator;
            const self = this;

            _.each(this.state.comparator, function(value, key) {
                self.comparator = function(model) {
                    return (value === 'desc' ? (-model.get(key)) : model.get(key));
                };
                self.sort();
            });

            this.comparator = comparator;
            return this.models;
        },

        getNextItem: function(id) {
            if (this.length === 0) {
                return false;
            }

            const model = this.get(id);
            const index = model ? this.indexOf(model) + 1 : 0;

            if (index >= this.models.length) {
                return this.trigger(
                    this.hasNextPage() ? 'page:next' : 'page:end'
                );
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
                return this.trigger(
                    this.hasPreviousPage() ? 'page:previous' : 'page:start'
                );
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        _navigateOnRemove: function(model) {
            model = this.get(model.id);
            if (!model) {
                return false;
            }

            const coll  = this.fullCollection || this;
            const index = this.indexOf(model);

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

        _onRestore: function(model) {
            if (this.conditionFilter !== 'trashed') {
                return this._onAddItem(model);
            }

            if (this.length > 1) {
                return this._onRemoveItem(model);
            }
        },

        _onAddItem: function(model) {
            if (this.profileId !== model.profileId) {
                return;
            }

            if (!model.matches(this.conditionCurrent || {trash: 0})) {
                return this._navigateOnRemove(model);
            }

            const coll     = this.fullCollection || this;
            const colModel = coll.get(model.id);

            if (colModel) {
                return colModel.set(model.toJSON());
            }

            coll.add(model, {at: 0});
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