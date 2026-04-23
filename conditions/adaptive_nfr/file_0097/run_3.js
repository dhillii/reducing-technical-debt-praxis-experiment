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
         * Overrite `fetch` method.
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

            const success = options.success;
            const self    = this;

            options.success = function(resp) {

                // Keep full collection in memory
                self.fullCollection = self.clone();

                // Sort the collection
                self.fullCollection.sortItOut();

                // Pagination
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

        /**
         * Determines the event to trigger when reaching page boundary.
         * @param {boolean} hasNextPage - Whether next page exists
         * @returns {string} Event name to trigger
         */
        _getPageBoundaryEvent: function(hasNextPage) {
            return hasNextPage ? 'page:next' : 'page:end';
        },

        /**
         * Determines the event to trigger when reaching previous page boundary.
         * @param {boolean} hasPreviousPage - Whether previous page exists
         * @returns {string} Event name to trigger
         */
        _getPreviousPageBoundaryEvent: function(hasPreviousPage) {
            return hasPreviousPage ? 'page:previous' : 'page:start';
        },

        /**
         * Checks if collection is empty.
         * @returns {boolean} True if collection is empty
         */
        _isCollectionEmpty: function() {
            return this.length === 0;
        },

        /**
         * Gets the next model index, handling page boundaries.
         * @param {string} id - Model id
         * @returns {number|null} Next index or null if at boundary
         */
        _getNextModelIndex: function(id) {
            const model = this.get(id);
            const index = model ? this.indexOf(model) + 1 : 0;

            if (index >= this.models.length) {
                return null;
            }

            return index;
        },

        /**
         * Gets the previous model index, handling page boundaries.
         * @param {string} id - Model id
         * @returns {number|null} Previous index or null if at boundary
         */
        _getPreviousModelIndex: function(id) {
            const model = this.get(id);
            const index = model ? this.indexOf(model) - 1 : this.models.length - 1;

            if (index < 0) {
                return null;
            }

            return index;
        },

        getNextItem: function(id) {
            // The collection is empty
            if (this._isCollectionEmpty()) {
                return false;
            }

            const index = this._getNextModelIndex(id);

            // It is the last model on this page
            if (index === null) {
                const event = this._getPageBoundaryEvent(this.hasNextPage());
                return this.trigger(event);
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        getPreviousItem: function(id) {
            // The collection is empty
            if (this._isCollectionEmpty()) {
                return false;
            }

            const index = this._getPreviousModelIndex(id);

            // It is the first model on this page
            if (index === null) {
                const event = this._getPreviousPageBoundaryEvent(this.hasPreviousPage());
                return this.trigger(event);
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(index));
        },

        /**
         * Determines if model should be navigated after removal.
         * @param {number} index - Current index
         * @returns {boolean} True if navigation should occur
         */
        _shouldNavigateAfterRemoval: function(index) {
            return !!this.at(index);
        },

        /**
         * Handles navigation after model removal.
         * @param {number} index - Current index
         * @returns {*} Navigation result or trigger result
         */
        _handleNavigationAfterRemoval: function(index) {
            let currentIndex = index;

            if (!this._shouldNavigateAfterRemoval(currentIndex)) {
                currentIndex--;
            }

            if (!this._shouldNavigateAfterRemoval(currentIndex)) {
                return this.hasPreviousPage() ? this.trigger('page:previous') : null;
            }

            Radio.trigger(this.storeName, 'model:navigate', this.at(currentIndex));
        },

        /**
         * When some model was removed, trigger `model:navigate` event
         * passing a model which has the same index as the removed model.
         * @type object Backbone model
         */
        _navigateOnRemove: function(model) {
            const removedModel = this.get(model.id);
            if (!removedModel) {
                return false;
            }

            const coll = this.fullCollection || this;
            const index = this.indexOf(removedModel);

            coll.remove(removedModel);
            this.sortFullCollection();

            this._handleNavigationAfterRemoval(index);
        },

        /**
         * Determines if model should be restored to current view.
         * @returns {boolean} True if model should be restored
         */
        _shouldRestoreModel: function() {
            return this.conditionFilter !== 'trashed';
        },

        /**
         * When a model was restored from trash.
         */
        _onRestore: function(model) {
            if (this._shouldRestoreModel()) {
                return this._onAddItem(model);
            }

            if (this.length > 1) {
                return this._navigateOnRemove(model);
            }
        },

        /**
         * Checks if model matches current filter condition.
         * @param {object} model - Model to check
         * @returns {boolean} True if model matches filter
         */
        _modelMatchesFilter: function(model) {
            return model.matches(this.conditionCurrent || {trash: 0});
        },

        /**
         * Checks if model belongs to current profile.
         * @param {object} model - Model to check
         * @returns {boolean} True if model belongs to profile
         */
        _modelBelongsToProfile: function(model) {
            return this.profileId === model.profileId;
        },

        /**
         * Handles adding or updating a model in the collection.
         * @param {object} model - Model to add or update
         */
        _addOrUpdateModel: function(model) {
            const coll = this.fullCollection || this;
            const colModel = coll.get(model.id);

            if (colModel) {
                return colModel.set(model.toJSON());
            }

            // Or add it to fullCollection and sort the collection again
            coll.add(model, {at: 0});
            this.sortFullCollection();
        },

        /**
         * Update pagination when a model is added
         */
        _onAddItem: function(model) {

            // Don't add models from other profiles
            if (!this._modelBelongsToProfile(model)) {
                return;
            }

            /**
             * Remove a model from the collection if it doesn't meet
             * the current filter condition.
             */
            if (!this._modelMatchesFilter(model)) {
                return this._navigateOnRemove(model);
            }

            this._addOrUpdateModel(model);
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