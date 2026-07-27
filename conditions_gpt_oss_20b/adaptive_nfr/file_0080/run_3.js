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

    /**
     * Checks if the event matches the internal flag.
     * @param {Object} event
     * @returns {boolean}
     */
    const matchesInternal = (event) => internal === undefined || event.internal === internal;

    /**
     * Checks if the event contains any of the requested tags.
     * @param {Object} event
     * @returns {boolean}
     */
    const matchesTag = (event) => {
        if (!filter) {
            return true;
        }
        return event.tags.some(tag => filter[tag]);
    };

    return this._logger.filter(event => matchesInternal(event) && matchesTag(event));
};