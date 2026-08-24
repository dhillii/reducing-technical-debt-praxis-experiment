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
    const logger = this._logger;

    for (let i = 0; i < logger.length; ++i) {
        const event = logger[i];

        if (internal !== undefined &&
            event.internal !== internal) {

            continue;
        }

        if (!filter) {
            result.push(event);
            continue;
        }

        for (let j = 0; j < event.tags.length; ++j) {
            if (filter[event.tags[j]]) {
                result.push(event);
                break;
            }
        }
    }

    return result;
};