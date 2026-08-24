define([
    'underscore',
    'backbone',
    'backbone.radio'
], function(_, Backbone, Radio) {
    'use strict';

    /**
     * Pagination support for Backbone collections.
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
         * Overrite `fetch` method.
         */
        fetch: function(options) {
            options = _.defaults(options || {}, {
                options: {}
            });

            if ('pageSize' in options) {
                this.state.pageSize = Number(options.pageSize);
            }

            if (this.state.pageSize === 0) {
                return Backbone.Collection.prototype.fetch.call(this, options);
            }

            return this._fetchPaginated(options);
        },

        /**
         * Fetch with pagination support.
         */
        _fetchPaginated: function(options) {
            const self = this;
            const success = options.success;

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
         */
        registerEvents: function() {
            this.vent = Radio.channel(this.storeName);

            this.listenTo(this, 'change:isFavorite', this.sortItOut);
            this.listenTo(this, 'reset', this.sortItOut);
            this.listenTo(this.vent, 'update:model' , this._onAddItem, this);
            this.listenTo(this.vent, 'destroy:model', this._navigateOnRemove, this);
            this.listenTo(this.vent, 'restore:model', this._onRestore, this);

            return this;
        },

        /**
         * Clean up events and fullCollection.
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

        /**
         * Fetch next page.
         */
        getNextPage: function() {
            this.reset(this.getPage(this.state.currentPage + 1));
        },

        /**
         * Fetch previous page.
         */
        getPreviousPage: function() {
            this.reset(this.getPage(this.state.currentPage - 1));
        },

        /**
         * Get models for a given page number.
         */
        getPage: function(number) {
            const pageStart = this.getOffset(number);

            this.state.currentPage = number;
            this.models = this.fullCollection.models.slice(
                pageStart,
                pageStart + this.state.pageSize
            );

            return this.models;
        },

        /**
         * Calculate offset for a page number.
         */
        getOffset: function(number) {
            const offsetBase = this.state.firstPage === 0 ? number : number - 1;
            return offsetBase * this.state.pageSize;
        },

        /**
         * Check if previous page exists.
         */
        hasPreviousPage: function() {
            return this.state.currentPage !== this.state.firstPage;
        },

        /**
         * Check if next page exists.
         */
        hasNextPage: function() {
            return this.state.currentPage !== this.state.totalPages - 1;
        },

        /**
         * Sort full collection and update pagination state.
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
         * Sort collection using multi-key comparator from state.
         */
        sortItOut: function() {
            const comparator = this.comparator;
            const self = this;

            _.each(this.state.comparator, function(value, key) {
                self.comparator = function(model) {
                    return (value === 'desc' ? -model.get(key) : model.get(key));
                };
                self.sort();
            });

            this.comparator = comparator;
            return this.models;
        },

        /**
         * Get the next model index and trigger navigation.
         */
        _getNextIndex: function(currentModel) {
            const index = currentModel ? this.indexOf(currentModel) + 1 : 0;
            return index < this.models.length ? index : null;
        },

        /**
         * Get the previous model index and trigger navigation.
         */
        _getPreviousIndex: function(currentModel) {
            const index = currentModel ? this.indexOf(currentModel) - 1 : this.models.length - 1;
            return index >= 0 ? index : null;
        },

        /**
         * Navigate to next model.
         */
        getNextItem: function(id) {
            if (this.length === 0) {
                return false;
            }

            const currentModel = this.get(id);
            const index = this._getNextIndex(currentModel);

            if (index === null) {
                this.trigger(this.hasNextPage() ? 'page:next' : 'page:end');
                return;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Navigate to previous model.
         */
        getPreviousItem: function(id) {
            if (this.length === 0) {
                return false;
            }

            const currentModel = this.get(id);
            const index = this._getPreviousIndex(currentModel);

            if (index === null) {
                this.trigger(this.hasPreviousPage() ? 'page:previous' : 'page:start');
                return;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Handle model removal and navigate appropriately.
         */
        _navigateOnRemove: function(model) {
            model = this.get(model.id);
            if (!model) {
                return false;
            }

            const coll = this.fullCollection || this;
            const index = this.indexOf(model);

            coll.remove(model);
            this.sortFullCollection();

            if (!this.at(index)) {
                this._handleInvalidIndex(index);
            } else {
                Radio.trigger(this.storeName, 'model:navigate', this.at(index));
            }
        },

        /**
         * Handle navigation after invalid index.
         */
        _handleInvalidIndex: function(originalIndex) {
            const newIndex = originalIndex - 1;
            if (!this.at(newIndex)) {
                if (this.hasPreviousPage()) {
                    this.trigger('page:previous');
                }
                return;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(newIndex));
        },

        /**
         * Handle model restoration from trash.
         */
        _onRestore: function(model) {
            if (this.conditionFilter !== 'trashed') {
                return this._onAddItem(model);
            }

            if (this.length > 1) {
                this._navigateOnRemove(model);
            }
        },

        /**
         * Handle model addition/update in collection.
         */
        _onAddItem: function(model) {
            if (this.profileId !== model.profileId) {
                return;
            }

            if (!model.matches(this.conditionCurrent || {trash: 0})) {
                return this._navigateOnRemove(model);
            }

            const coll = this.fullCollection || this;
            const existingModel = coll.get(model.id);

            if (existingModel) {
                existingModel.set(model.toJSON());
                return;
            }

            coll.add(model, {at: 0});
            this.sortFullCollection();
        },

        /**
         * Remove model from fullCollection.
         */
        _onRemoveItem: function(model) {
            this.fullCollection.remove(model);
            this.sortFullCollection();
        },

        /**
         * Update totalPages based on fullCollection length.
         */
        _updateTotalPages: function() {
            this.state.totalPages = Math.ceil(
                this.fullCollection.length / this.state.pageSize
            );
        }

    });

    return PageableCollection;
});