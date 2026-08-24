internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    if (internals.isEmptyResponse(response, request, length)) {
        return internals.handleEmptyResponse(response, callback);
    }

    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.setupRange(request, response, length, encoding);
    const compressor = internals.setupCompression(request, response, encoding, length);

    if (internals.shouldSetConnectionClose(request, response)) {
        response._header('connection', 'close');
    }

    const writeError = internals.writeHead(response);
    if (writeError) {
        return Hoek.nextTick(callback)(writeError);
    }

    internals.setupInjection(request, response);

    internals.pipePayload(response, source, ranger, compressor, callback);
};


internals.isEmptyResponse = function (response, request, length) {

    return length === 0 &&
        response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204;
};


internals.handleEmptyResponse = function (response, callback) {

    response.code(204);
    delete response.headers['content-length'];
    return internals.transmit(response, callback);
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
        return internals.fail(request, error, () => {});
    }

    if (ranges.length !== 1) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const range = ranges[0];
    const ranger = new Ammo.Stream(range);
    response.code(206);
    response.bytes(range.to - range.from + 1);
    response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);

    return ranger;
};


internals.setupCompression = function (request, response, encoding, length) {

    if (!encoding ||
        length === 0 ||
        response.statusCode === 206 ||
        !response._isPayloadSupported()) {

        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);

    const compressor = request.connection._compression.encoder(request, encoding);

    if (response.headers.etag &&
        response.settings.varyEtag) {

        response.headers.etag = response.headers.etag.slice(0, -1) + '-' + encoding + '"';
    }

    return compressor;
};


internals.shouldSetConnectionClose = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    return !(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended);
};


internals.setupInjection = function (request, response) {

    if (!Shot.isInjection(request.raw.req)) {
        return;
    }

    request.raw.res._hapi = { request };

    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
};


internals.pipePayload = function (response, source, ranger, compressor, callback) {

    const request = response.request;

    const end = Hoek.once((err, event) => {

        source.removeListener('error', end);
        request.raw.req.removeListener('aborted', onAborted);
        request.raw.req.removeListener('close', onClose);
        request.raw.res.removeListener('close', onClose);
        request.raw.res.removeListener('error', end);
        request.raw.res.removeListener('finish', end);

        if (err) {
            request.raw.res.destroy();

            if (request.raw.res._hapi) {
                request.raw.res.statusCode = 500;
                request.raw.res._hapi.result = Boom.boomify(err).output.payload;
            }

            source.unpipe();
            Response.drain(source);
        }

        if (!request.raw.res.finished &&
            event !== 'aborted') {

            request.raw.res.end();
        }

        if (event || err) {
            request.emit('disconnect');
        }

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