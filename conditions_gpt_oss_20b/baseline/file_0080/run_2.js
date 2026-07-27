internals.Request.prototype.getLog = function (tags, internal) {
    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    tags = tags ? [].concat(tags) : [];

    if (!tags.length && internal === undefined) {
        return this._logger;
    }

    const filter = tags.length ? Hoek.mapToObject(tags) : null;

    return this._logger.filter(event => {
        if (internal !== undefined && event.internal !== internal) {
            return false;
        }
        if (!filter) {
            return true;
        }
        return event.tags.some(tag => filter[tag]);
    });
};