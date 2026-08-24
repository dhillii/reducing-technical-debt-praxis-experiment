/**
         * Synchronize a collection.
         *
         * @type array localData
         * @type array remoteData
         * @type string module
         * @return promise
         */
        syncAll: function(localData, remoteData, module) {
            var modelCtor = localData.model,
                encryptKeys = modelCtor.prototype.encryptKeys,
                context = {
                    local: localData.fullCollection || localData,
                    module: module,
                    encryptKeys: encryptKeys
                };

            context.local = context.local.toJSON();

            var promises = [];
            promises.push.apply(promises, this.checkRemoteChanges(context, remoteData));
            promises.push.apply(promises, this.checkLocalChanges(context, remoteData));

            return _.reduce(promises, Q.when, new Q())
            .then(function() {
                return Radio.request(context.module, 'fetch', {encrypt: true});
            });
        },

        /**
         * Save only models which don't exist locally or which were updated
         * remotely.
         */
        checkRemoteChanges: function(context, remoteData) {
            var promises = [],
                localData = context.local,
                module = context.module;

            var newData = _.filter(remoteData, function(rModel) {
                var model = _.findWhere(localData, {id: rModel.id});
                return !model || model.updated < rModel.updated;
            });

            if (newData.length) {
                console.log('Dropbox changes:', newData);
                this.configs.statRemote = true;

                promises.push(function() {
                    return Radio.request(module, 'save:all:raw', newData, {profile: adapter.profile});
                });
            }

            return promises;
        },

        /**
         * Save only models which don't exist on Dropbox or
         * which were updated locally.
         */
        checkLocalChanges: function(context, remoteData) {
            var promises = [],
                localData = context.local,
                encryptKeys = context.encryptKeys;

            _.each(localData, function(lModel) {
                var model = _.findWhere(remoteData, {id: lModel.id});
                if (model && model.updated >= lModel.updated) {
                    return;
                }

                console.log('Dropbox local changes:', lModel);
                promises.push(function() {
                    return adapter.save(context.module, lModel, encryptKeys);
                });
            });

            return promises;
        },