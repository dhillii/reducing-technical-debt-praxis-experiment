internals.Request.prototype.getLog = function (tags, internal) {

    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    tags = [].concat(tags || []);
    if (typeof tags[0] === 'boolean') {
        internal = tags[0];
        tags = [];
    }

    if (!tags.length && internal === undefined) {
        return this._logger;
    }

    const filter = tags.length ? Hoek.mapToObject(tags) : null;
    return _filterLogEvents(this._logger, filter, internal);
};

function _filterLogEvents(logger, filter, internal) {

    const result = [];

    for (let i = 0; i < logger.length; ++i) {
        const event = logger[i];

        if (!_matchInternal(event, internal) ||
            (filter && !_hasMatchingTag(event, filter))) {

            continue;
        }

        result.push(event);
    }

    return result;
}

function _matchInternal(event, internal) {

    return (internal === undefined || event.internal === internal);
}

function _hasMatchingTag(event, filter) {

    for (let j = 0; j < event.tags.length; ++j) {
        if (filter[event.tags[j]]) {
            return true;
        }
    }

    return false;
}