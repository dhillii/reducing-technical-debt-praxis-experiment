internals.Request.prototype.getLog = function (tags, internal) {

    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    // Normalize tags and internal flag
    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    tags = [].concat(tags || []);

    // Early return all logs when no filters
    if (!tags.length && internal === undefined) {
        return this._logger;
    }

    const filter = tags.length ? Hoek.mapToObject(tags) : null;

    return this._logger.filter(createLogFilter(internal, filter));
};

function createLogFilter(internal, filter) {

    return function (event) {

        if (!isInternalMatch(event.internal, internal)) {
            return false;
        }

        return filter ? hasMatchingTag(event, filter) : true;
    };
}

function isInternalMatch(eventInternal, requestedInternal) {

    return requestedInternal === undefined || eventInternal === requestedInternal;
}

function hasMatchingTag(event, filter) {

    for (let j = 0; j < event.tags.length; ++j) {
        if (filter[event.tags[j]]) {
            return true;
        }
    }
    return false;
}