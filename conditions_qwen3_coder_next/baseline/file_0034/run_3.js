// limits
        promises.push(
            this._checkSendingLimit(),
            this._checkPublishingLimit()
        );

        // newsletters
        if (!this.user.isContributor) {
            promises.push(this.store.query('newsletter', {status: 'active', limit: 'all', include: 'count.active_members'}));
        }