return false;
            }

            const configs = Radio.request('configs', 'get:object'),
                backup  = {encrypt: configs.encryptBackup.encrypt || 0};
            model       = model || this.Collection.prototype.model.prototype;

            return (
                !_.isUndefined(model.encryptKeys) &&
                (Number(configs.encrypt) || Number(backup.encrypt)) === 1
            );
        },