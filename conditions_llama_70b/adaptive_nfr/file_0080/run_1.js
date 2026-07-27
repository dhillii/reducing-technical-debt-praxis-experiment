internals.Request.prototype.getLog = function (tags, internal) {
    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    tags = [].concat(tags || []);

    const filterByTags = (event) => {
        if (!tags.length) return true;
        return tags.some((tag) => event.tags.includes(tag));
    };

    const filterByInternal = (event) => {
        if (internal === undefined) return true;
        return event.internal === internal;
    };

    const filterEvents = (event) => filterByTags(event) && filterByInternal(event);

    return this._logger.filter(filterEvents);
};