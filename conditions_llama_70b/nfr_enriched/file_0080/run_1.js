internals.Request.prototype.getLog = function (tags, internal) {
    /**
     * Returns the request log.
     * 
     * @param {string|string[]} tags - Log tags.
     * @param {boolean} internal - Whether to include internal logs.
     * @returns {object[]} Request log.
     */
    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    tags = [].concat(tags || []);

    return this._filterLog(tags, internal);
};

internals.Request.prototype._filterLog = function (tags, internal) {
    /**
     * Filters the request log based on the provided tags and internal flag.
     * 
     * @param {string[]} tags - Log tags.
     * @param {boolean} internal - Whether to include internal logs.
     * @returns {object[]} Filtered request log.
     */
    const filter = tags.length ? Hoek.mapToObject(tags) : null;
    const result = [];

    for (let i = 0; i < this._logger.length; ++i) {
        const event = this._logger[i];
        if (internal === undefined || event.internal === internal) {
            if (filter) {
                for (let j = 0; j < event.tags.length; ++j) {
                    const tag = event.tags[j];
                    if (filter[tag]) {
                        result.push(event);
                        break;
                    }
                }
            }
            else {
                result.push(event);
            }
        }
    }

    return result;
};