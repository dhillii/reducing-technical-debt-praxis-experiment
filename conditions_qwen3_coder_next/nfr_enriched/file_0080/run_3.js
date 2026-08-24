internals.Request.prototype.getLog = function (tags, internal) {

    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    tags = [].concat(tags || []);

    if (!tags.length && internal === undefined) {
        return this._logger;
    }

    const filter = tags.length ? Hoek.mapToObject(tags) : null;
    return this._filterLogEvents(filter, internal);
};


internals.Request.prototype._filterLogEvents = function (filter, internal) {

    const result = [];

    for (let i = 0; i < this._logger.length; ++i) {
        const event = this._logger[i];

        if (!this._isLogEventMatch(event, internal, filter)) {
            continue;
        }

        result.push(event);
    }

    return result;
};


internals.Request.prototype._isLogEventMatch = function (event, internal, filter) {

    if (internal !== undefined && event.internal !== internal) {
        return false;
    }

    if (!filter) {
        return true;
    }

    return this._hasMatchingTag(event, filter);
};


internals.Request.prototype._hasMatchingTag = function (event, filter) {

    for (let j = 0; j < event.tags.length; ++j) {
        if (filter[event.tags[j]]) {
            return true;
        }
    }

    return false;
};