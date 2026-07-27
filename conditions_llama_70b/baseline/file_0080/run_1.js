internals.Request.prototype.getLog = function (tags, internal) {

    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    let filterTags = tags;
    let isInternal = internal;

    if (typeof tags === 'boolean') {
        isInternal = tags;
        filterTags = [];
    }

    filterTags = [].concat(filterTags || []);

    const filter = filterTags.length ? Hoek.mapToObject(filterTags) : null;
    const result = [];

    const filterLogger = (event) => {
        if (isInternal === undefined || event.internal === isInternal) {
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
    };

    for (let i = 0; i < this._logger.length; ++i) {
        const event = this._logger[i];
        filterLogger(event);
    }

    if (!filterTags.length && isInternal === undefined) {
        return this._logger;
    }

    return result;
};