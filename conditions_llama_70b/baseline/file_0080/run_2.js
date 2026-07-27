internals.Request.prototype.getLog = function (tags, internal) {

    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    let result = [];

    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    tags = [].concat(tags || []);

    if (!tags.length && internal === undefined) {
        return this._logger;
    }

    const filter = tags.length ? Hoek.mapToObject(tags) : null;

    for (let i = 0; i < this._logger.length; ++i) {
        const event = this._logger[i];

        if (internal === undefined || event.internal === internal) {
            if (filter) {
                if (hasTag(event, filter)) {
                    result.push(event);
                }
            } else {
                result.push(event);
            }
        }
    }

    return result;
};

function hasTag(event, filter) {
    for (let j = 0; j < event.tags.length; ++j) {
        const tag = event.tags[j];
        if (filter[tag]) {
            return true;
        }
    }
    return false;
}