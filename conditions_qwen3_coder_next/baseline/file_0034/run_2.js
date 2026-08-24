// limits
        const limitPromises = [
            this._checkSendingLimit(),
            this._checkPublishingLimit()
        ];

        // newsletters
        if (!this.user.isContributor) {
            limitPromises.push(this.store.query('newsletter', {status: 'active', limit: 'all', include: 'count.active_members'}));
        }

        promises.push(...limitPromises);
        } else {
            promises.push(this.store.query('newsletter', {status: 'active', limit: 'all', include: 'count.active_members'}));
        }

        yield Promise.all(promises);
    }