_navigateOnRemove: function(model) {
            model = this.get(model.id);
            if (!model) {
                return false;
            }

            var coll = this.fullCollection || this,
                index = coll.indexOf(model);

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

        /**
         * Handles restoration logic based on current filter state.
         * @returns {void}
         */
        _onRestore: function(model) {
            if (!this.conditionFilter || this.conditionFilter !== 'trashed') {
                return this._onAddItem(model);
            }

            if (this.length > 1) {
                return this._navigateOnRemove(model);
            }
        },

        /**
         * Handles adding an item to the collection with filter and duplication checks.
         * @returns {void}
         */
        _onAddItem: function(model) {
            if (this.profileId !== model.profileId) {
                return;
            }

            if (!model.matches(this.conditionCurrent || {trash: 0})) {
                return this._navigateOnRemove(model);
            }

            const coll = this.fullCollection || this;
            const colModel = coll.get(model.id);

            if (colModel) {
                return colModel.set(model.toJSON());
            }

            coll.add(model, {at: 0});
            this.sortFullCollection();
        },

        /**
         * Removes model from fullCollection and re-applies sorting/pagination.
         * @param {Backbone.Model} model - Model to remove
         * @returns {void}
         */
        _onRemoveItem: function(model) {
            this.fullCollection.remove(model);
            this.sortFullCollection();
        },