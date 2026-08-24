onReady: function() {
            const profile = Radio.request('uri', 'profile') || 'notes-db';
            const self = this;
            adapter.init(this.client, profile);

            this.timeout = window.setTimeout(function() {
                self.checkChanges();
            }, 500);
        },