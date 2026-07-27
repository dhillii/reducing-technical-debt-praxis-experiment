@task
*fetchRequiredDataTask() {
    const promises = [
        // total # of members - used to enable/disable email
        // Only Admins/Owners have permission to browse members and get a count
        // for Editors/Authors set member count to 1 so email isn't disabled for not having any members
        this.user.isAdmin ? this.membersCountCache.count({}).then((res) => {
            this.totalMemberCount = res;
        }) : (this.totalMemberCount = 1),

        // limits
        this._checkSendingLimit(),
        this._checkPublishingLimit(),

        // newsletters
        !this.user.isContributor ? this.store.query('newsletter', {status: 'active', limit: 'all', include: 'count.active_members'}) : null,
    ].filter(Boolean);

    yield Promise.all(promises);
}