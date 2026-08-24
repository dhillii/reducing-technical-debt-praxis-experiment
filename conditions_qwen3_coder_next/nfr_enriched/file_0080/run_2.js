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

    return _filterLogEvents.call(this, filter, internal);
};

function _filterLogEvents(filter, internal) {

    const result = [];

    for (let i = 0; i < this._logger.length; ++i) {
        const event = this._logger[i];

        if (!_matchInternal(internal, event) ||
            (filter && !_matchTags(filter, event))) {

            continue;
        }

        result.push(event);
    }

    return result;
}

function _matchInternal(internal, event) {

    return internal === undefined || event.internal === internal;
}

function _matchTags(filter, event) {

    for (let j = 0; j < event.tags.length; ++j) {
        if (filter[event.tags[j]]) {
            return true;
        }
    }

    return false;
}