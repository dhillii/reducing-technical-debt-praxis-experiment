internals.Request.prototype.getLog = function (tags, internal) {

    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    let filterTags = tags;
    let filterInternal = internal;

    if (typeof tags === 'boolean') {
        filterInternal = tags;
        filterTags = [];
    }

    filterTags = [].concat(filterTags || []);

    const filter = filterTags.length ? Hoek.mapToObject(filterTags) : null;
    const result = [];

    const filterLogger = (event) => {
        if (filterInternal === undefined || event.internal === filterInternal) {
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

    if (!filterTags.length && filterInternal === undefined) {
        return this._logger;
    }

    return result;
};