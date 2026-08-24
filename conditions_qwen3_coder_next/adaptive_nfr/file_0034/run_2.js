// limits
        const checkSendingLimitPromise = this._checkSendingLimit();
        const checkPublishingLimitPromise = this._checkPublishingLimit();
        promises.push(checkSendingLimitPromise, checkPublishingLimitPromise);

        // newsletters
        if (!this.user.isContributor) {
            promises.push(this.store.query('newsletter', {status: 'active', limit: 'all', include: 'count.active_members'}));
        }

        yield Promise.all(promises);