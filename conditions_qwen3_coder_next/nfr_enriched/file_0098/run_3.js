onReady: function() {
            const profile = Radio.request('uri', 'profile') || 'notes-db';
            adapter.init(this.client, profile);

            this.timeout = window.setTimeout(() => {
                this.checkChanges();
            }, 500);
        },