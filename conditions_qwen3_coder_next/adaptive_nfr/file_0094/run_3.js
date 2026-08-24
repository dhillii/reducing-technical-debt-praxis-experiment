checkPasswords: function(data) {
            var self = this;

            if (this.shouldUseNewPasswordAsOld(data)) {
                data.old = data.password;
            }

            return Q.all(this.buildPasswordCheckPromises(data))
                .then(function(results) {
                    if (self.hasInvalidPassword(results)) {
                        return self.view.trigger('password:invalid', results);
                    }
                    self.passwords = data;
                    Radio.trigger('Encryption', 'password:valid');
                });
        },

        /**
         * Determines if the old password field should be populated using the new password.
         */
        shouldUseNewPasswordAsOld: function(data) {
            return Number(this.backup.encrypt) && !data.old && data.password;
        },

        /**
         * Builds an array of password check promises based on provided data.
         */
        buildPasswordCheckPromises: function(data) {
            var promises = [];

            if (data.old) {
                this.vent.request('change:configs', this.backup);
                promises.push(this.vent.request('check:password', data.old));
            }

            if (data.password) {
                this.vent.request('change:configs', this.configs);
                promises.push(this.vent.request('check:password', data.password));
            }

            return promises;
        },

        /**
         * Checks whether any of the password checks resulted in a failure.
         */
        hasInvalidPassword: function(results) {
            return !results.length || _.indexOf(results, false) > -1;
        },