internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    if (internals.isEmptyPayloadWithEmptyStatusCode(response, request)) {
        response.code(204);
        delete response.headers['content-length'];
    }

    const encoding = request.connection._compression.encoding(response);

    const ranger = internals.setupRange(request, response, length, encoding);
    if (ranger && Boom.is(ranger)) {
        return internals.fail(request, ranger, callback);
    }

    const compressor = internals.setupCompression(request, response, length, encoding);
    if (compressor && Boom.is(compressor)) {
        return internals.fail(request, compressor, callback);
    }

    if (internals.shouldUpdateEtagWithEncoding(response)) {
        response.headers.etag = response.headers.etag.slice(0, -1) + '-' + (response.headers['content-encoding'] || encoding) + '"';
    }

    if (internals.shouldCloseConnection(request)) {
        response._header('connection', 'close');
    }

    const writeError = internals.writeHead(response);
    if (writeError) {
        return Hoek.nextTick(callback)(writeError);
    }

    internals.handleInjection(request, response);

    response._tap();

    internals.sendPayload(request, response, source, compressor, ranger, callback);
};

internals.isEmptyPayloadWithEmptyStatusCode = function (response, request) {

    return request.route.settings.response.emptyStatusCode === 204 &&
        response.statusCode === 200 &&
        response.headers['content-length'] === '0';
};

internals.setupRange = function (request, response, length, encoding) {

    if (!request.route.settings.response.ranges ||
        request.method !== 'get' ||
        response.statusCode !== 200 ||
        length === 0 ||
        encoding) {

        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (!request.headers.range) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (request.headers['if-range'] &&
        request.headers['if-range'] !== response.headers.etag) {

        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        response._header('accept-ranges', 'bytes');
        return error;
    }

    if (ranges.length === 1) {
        const range = ranges[0];
        const ranger = new Ammo.Stream(range);
        response.code(206);
        response.bytes(range.to - range.from + 1);
        response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
        return ranger;
    }

    response._header('accept-ranges', 'bytes');
    return null;
};

internals.setupCompression = function (request, response, length, encoding) {

    if (!encoding ||
        length === 0 ||
        response.statusCode === 206 ||
        !response._isPayloadSupported()) {

        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);

    return request.connection._compression.encoder(request, encoding);
};

internals.shouldUpdateEtagWithEncoding = function (response) {

    const hasEncoding = response.headers['content-encoding'] || response.headers['content-encoding'];
    return hasEncoding &&
        response.headers.etag &&
        response.settings.varyEtag;
};

internals.shouldCloseConnection = function (request) {

    const isInjection = Shot.isInjection(request.raw.req);
    const notConnectionPersistent = !(isInjection || request.connection._started);
    const payloadPending = request._isPayloadPending && !request.raw.req._readableState.ended;

    return notConnectionPersistent || payloadPending;
};

internals.writeHead = function (response) {

    const res = response.request.raw.res;
    const headers = Object.keys(response.headers);
    let i = 0;

    try {
        for (; i < headers.length; ++i) {
            const header = headers[i];
            const value = response.headers[header];
            if (value !== undefined) {
                res.setHeader(header, value);
            }
        }
    }
    catch (err) {

        for (--i; i >= 0; --i) {
            res.setHeader(headers[i], null);
        }

        return Boom.boomify(err);
    }

    if (response.settings.message) {
        res.statusMessage = response.settings.message;
    }

    try {
        res.writeHead(response.statusCode);
    }
    catch (err) {
        return Boom.boomify(err);
    }

    return null;
};

internals.handleInjection = function (request, response) {

    if (!Shot.isInjection(request.raw.req)) {
        return;
    }

    request.raw.res._hapi = { request };

    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
};

internals.sendPayload = function (request, response, source, compressor, ranger, callback) {

    const end = Hoek.once((err, event) => {

        source.removeListener('error', end);

        request.raw.req.removeListener('aborted', onAborted);
        request.raw.req.removeListener('close', onClose);

        request.raw.res.removeListener('close', onClose);
        request.raw.res.removeListener('error', end);
        request.raw.res.removeListener('finish', end);

        if (err) {
            internals.handleStreamError(request, err);
        }

        internals.handleStreamEvent(request, event, err);
        const tags = (err ? ['response', 'error'] : (event ? ['response', 'error', event] : ['response']));
        request._log(tags, err);
        return callback();
    });

    source.once('error', end);

    const onAborted = () => end(null, 'aborted');
    const onClose = () => end(null, 'close');

    request.raw.req.once('aborted', onAborted);
    request.raw.req.once('close', onClose);

    request.raw.res.once('close', onClose);
    request.raw.res.once('error', end);
    request.raw.res.once('finish', end);

    const tap = response._tap();
    const preview = (tap ? source.pipe(tap) : source);
    const compressed = (compressor ? preview.pipe(compressor) : preview);
    const ranged = (ranger ? compressed.pipe(ranger) : compressed);
    ranged.pipe(request.raw.res);
};

internals.handleStreamError = function (request, err) {

    request.raw.res.destroy();

    if (request.raw.res._hapi) {
        request.raw.res.statusCode = 500;
        request.raw.res._hapi.result = Boom.boomify(err).output.payload;
    }

    source.unpipe();
    Response.drain(source);
};

internals.handleStreamEvent = function (request, event, err) {

    if (request.raw.res.finished ||
        event === 'aborted') {

        return;
    }

    request.raw.res.end();

    if (event || err) {
        request.emit('disconnect');
    }
};