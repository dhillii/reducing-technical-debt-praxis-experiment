/**
         * Synchronize a collection.
         *
         * @param {Object} params - Parameters for syncAll
         * @param {Array}  params.localData  - Local data array
         * @param {Array}  params.remoteData - Remote data array
         * @param {String} params.module     - Module name (notes, notebooks, tags)
         * @returns {Promise}
         */
        syncAll: function(params) {
            var localData = (params.localData.fullCollection || params.localData).toJSON();
            var promises = this.checkRemoteChanges({
                localData: localData,
                remoteData: params.remoteData,
                module: params.module
            });

            promises.push.apply(
                promises,
                this.checkLocalChanges({
                    localData: localData,
                    remoteData: params.remoteData,
                    module: params.module,
                    encryptKeys: params.localData.model.prototype.encryptKeys
                })
            );

            return _.reduce(promises, Q.when, new Q())
            .then(function() {
                return Radio.request(params.module, 'fetch', {encrypt: true});
            });
        },

        /**
         * Save only models which don't exist locally or which were updated
         * remotely.
         *
         * @param {Object} params - Parameters for checkRemoteChanges
         * @param {Array}  params.localData  - Local data array
         * @param {Array}  params.remoteData - Remote data array
         * @param {String} params.module     - Module name
         * @returns {Array} - Array of promise-returning functions
         */
        checkRemoteChanges: function(params) {
            var promises = [],
                newData = _.filter(params.remoteData, function(rModel) {
                    var model = _.findWhere(params.localData, {id: rModel.id});
                    return !model || model.updated < rModel.updated;
                });

            if (newData.length) {
                console.log('Dropbox changes:', newData);
                this.configs.statRemote = true;

                promises.push(function() {
                    return Radio.request(params.module, 'save:all:raw', newData, {profile: adapter.profile});
                });
            }

            return promises;
        },

        /**
         * Save only models which don't exist on Dropbox or
         * which were updated locally.
         *
         * @param {Object} params - Parameters for checkLocalChanges
         * @param {Array}  params.localData   - Local data array
         * @param {Array}  params.remoteData  - Remote data array
         * @param {String} params.module      - Module name
         * @param {Array}  params.encryptKeys - Encryption keys
         * @returns {Array} - Array of promise-returning functions
         */
        checkLocalChanges: function(params) {
            var promises = [];

            _.each(params.localData, function(lModel) {
                var model = _.findWhere(params.remoteData, {id: lModel.id});
                if (model && model.updated >= lModel.updated) {
                    return;
                }

                console.log('Dropbox local changes:', lModel);
                promises.push(function() {
                    return adapter.save(params.module, lModel, params.encryptKeys);
                });
            });

            return promises;
        },