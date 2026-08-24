return false;
            }

            const configs = Radio.request('configs', 'get:object'),
                backup  = {encrypt: configs.encryptBackup.encrypt || 0};
            model       = model || this.Collection.prototype.model.prototype;

            const isConfigStore = this.Collection.prototype.storeName === 'configs';
            const isEncryptEnabled = !_.isUndefined(model.encryptKeys) &&
                (Number(configs.encrypt) || Number(backup.encrypt)) === 1;

            return !isConfigStore && isEncryptEnabled;
        },