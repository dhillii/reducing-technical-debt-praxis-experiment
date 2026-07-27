internals.Request.prototype.getLog = function (tags, internal) {

    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    let filterTags = [];
    let filterInternal = undefined;

    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    if (tags) {
        filterTags = [].concat(tags);
    }

    if (internal !== undefined) {
        filterInternal = internal;
    }

    const filter = filterTags.length ? Hoek.mapToObject(filterTags) : null;
    const result = [];

    for (let i = 0; i < this._logger.length; ++i) {
        const event = this._logger[i];
        if ((filterInternal === undefined || event.internal === filterInternal) &&
            (filter === null || filter[event.tags[0]])) {
            result.push(event);
        }
    }

    return result;
};