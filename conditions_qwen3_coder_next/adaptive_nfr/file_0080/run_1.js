internals.Request.prototype.getLog = function (tags, internal) {

    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    // Normalize arguments
    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    tags = [].concat(tags || []);

    // Handle empty tags and undefined internal case
    if (!tags.length && internal === undefined) {
        return this._logger;
    }

    const filter = tags.length ? Hoek.mapToObject(tags) : null;

    return this._logger.filter(createLogFilter(filter, internal));
};

// Extracted predicate to reduce cognitive complexity
function createLogFilter(filter, internal) {
    return function (event) {
        if (!isInternalMatch(event, internal)) {
            return false;
        }

        return filter ? hasMatchingTag(event, filter) : true;
    };
}

function isInternalMatch(event, internal) {
    return internal === undefined || event.internal === internal;
}

function hasMatchingTag(event, filter) {
    for (let j = 0; j < event.tags.length; ++j) {
        if (filter[event.tags[j]]) {
            return true;
        }
    }
    return false;
}