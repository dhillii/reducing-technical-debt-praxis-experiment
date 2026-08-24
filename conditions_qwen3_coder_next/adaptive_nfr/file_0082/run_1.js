internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    // Handle empty response
    if (internals.isEmptyResponse(length, response, request)) {
        return internals.handleEmptyResponse(response, callback);
    }

    // Handle range requests
    const ranger = internals.processRange(request, response, length);
    if (ranger instanceof Error) {
        return internals.fail(request, ranger, callback);
    }

    // Handle compression
    const encoding = request.connection._compression.encoding(response);
    const compressor = internals.createCompressor(request, response, encoding, length);

    // Handle connection close header
    internals.setConnectionCloseHeader(response, request);

    // Write headers
    const headerError = internals.writeHead(response);
    if (headerError) {
        return Hoek.nextTick(callback)(headerError);
    }

    // Handle injection
    internals.handleInjection(request, response);

    // Setup response stream handling
    return internals.pipeResponse(request, response, source, compressor, ranger, callback);
};

internals.isEmptyResponse = function (length, response, request) {
    return length === 0 &&
        response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204;
};

internals.handleEmptyResponse = function (response, callback) {
    response.code(204);
    delete response.headers['content-length'];
    return internals.transmit(response, callback);
};

internals.processRange = function (request, response, length) {
    if (!internals.shouldProcessRange(request, response, length)) {
        return null;
    }

    if (!request.headers.range) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (!internals.isValidIfRange(request, response)) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        return error;
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
    response._header('accept-ranges', 'bytes');

    return ranger;
};

internals.shouldProcessRange = function (request, response, length) {
    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !request.connection._compression.encoding(response);
};

internals.isValidIfRange = function (request, response) {
    return !request.headers['if-range'] ||
        request.headers['if-range'] === response.headers.etag;
};

internals.createCompressor = function (request, response, encoding, length) {
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

internals.setConnectionCloseHeader = function (response, request) {
    const isInjection = Shot.isInjection(request.raw.req);
    if (internals.shouldCloseConnection(isInjection, request)) {
        response._header('connection', 'close');
    }
};

internals.shouldCloseConnection = function (isInjection, request) {
    return !(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended);
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

internals.pipeResponse = function (request, response, source, compressor, ranger, callback) {
    const end = internals.createEndHandler(request, response, callback);

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

internals.createEndHandler = function (request, response, callback) {
    return Hoek.once((err, event) => {
        const source = response._payload;

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

        if (!request.raw.res.finished && event !== 'aborted') {
            request.raw.res.end();
        }

        if (event || err) {
            request.emit('disconnect');
        }

        const tags = (err ? ['response', 'error'] : (event ? ['response', 'error', event] : ['response']));
        request._log(tags, err);
        return callback();
    });
};