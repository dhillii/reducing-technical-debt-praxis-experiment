internals.Request.prototype.getLog = function (tags, internal) {

    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    tags = [].concat(tags || []);
    if (!tags.length &&
        internal === undefined) {

        return this._logger;
    }

    const filter = tags.length ? Hoek.mapToObject(tags) : null;
    const result = [];

    for (let i = 0; i < this._logger.length; ++i) {
        const event = this._logger[i];
        if (isEventMatch(event, internal, filter)) {
            result.push(event);
        }
    }

    return result;
};

/**
 * Determines if a log event matches the specified filters.
 * @param {Object} event - The log event to check.
 * @param {boolean|undefined} internal - The internal filter value.
 * @param {Object|null} filter - The tag filter object.
 * @returns {boolean} True if the event matches the filters.
 */
function isEventMatch(event, internal, filter) {

    if (internal !== undefined && event.internal !== internal) {
        return false;
    }

    if (!filter) {
        return true;
    }

    for (let j = 0; j < event.tags.length; ++j) {
        if (filter[event.tags[j]]) {
            return true;
        }
    }

    return false;
}