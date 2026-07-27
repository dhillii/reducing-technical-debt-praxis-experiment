@task
*fetchRequiredDataTask() {
    const promises = [];

    // total # of members - used to enable/disable email
    // Only Admins/Owners have permission to browse members and get a count
    // for Editors/Authors set member count to 1 so email isn't disabled for not having any members
    if (this.user.isAdmin) {
        promises.push(this.membersCountCache.count({}).then((res) => {
            this.totalMemberCount = res;
        }));
    } else {
        this.totalMemberCount = 1;
    }

    // limits
    promises.push(...[
        this._checkSendingLimit(),
        this._checkPublishingLimit()
    ]);

    // newsletters
    if (!this.user.isContributor) {
        promises.push(this.store.query('newsletter', {status: 'active', limit: 'all', include: 'count.active_members'}));
    }

    yield Promise.all(promises);
}