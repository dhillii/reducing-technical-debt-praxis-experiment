internals.transmit = function (response, callback) {

    // Setup source

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    // Empty response

    if (internals.isEmptyResponse(length, response.statusCode, request)) {
        response.code(204);
        delete response.headers['content-length'];
    }

    // Compression

    const encoding = request.connection._compression.encoding(response);

    // Range handling

    if (internals.isRangeRequest(length, response.statusCode, request, encoding)) {
        const error = internals.processRange(request, response, length, encoding);
        if (error) {
            return internals.fail(request, error, callback);
        }
    }

    response._header('accept-ranges', 'bytes');

    // Content-Encoding

    if (internals.shouldCompress(encoding, length, response, request)) {
        delete response.headers['content-length'];
        response._header('content-encoding', encoding);
        const compressor = request.connection._compression.encoder(request, encoding);
        response.headers.etag = internals.applyVaryEtag(response, compressor);
    }

    // Connection: close header

    if (internals.shouldCloseConnection(request)) {
        response._header('connection', 'close');
    }

    // Write headers

    const headerError = internals.writeHead(response);
    if (headerError) {
        return Hoek.nextTick(callback)(headerError);
    }

    // Injection

    if (internals.isInjectionResponse(request)) {
        internals.setupInjectionResponse(request, response);
    }

    // Payload transmission

    internals.pipePayload(request, response, source, callback);
};

internals.isEmptyResponse = function (length, statusCode, request) {

    return length === 0 &&
        statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204;
};

internals.isRangeRequest = function (length, statusCode, request, encoding) {

    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        statusCode === 200 &&
        length > 0 &&
        !encoding &&
        request.headers.range;
};

internals.processRange = function (request, response, length, encoding) {

    if (!internals.isIfRangeValid(request)) {
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        return error;
    }

    if (ranges.length !== 1) {
        return null;
    }

    const range = ranges[0];
    const ranger = new Ammo.Stream(range);
    response.code(206);
    response.bytes(range.to - range.from + 1);
    response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
    response.source = response._payload.pipe(ranger);
    return null;
};

internals.isIfRangeValid = function (request) {

    if (!request.headers['if-range']) {
        return true;
    }

    return request.headers['if-range'] === response.headers.etag;
};

internals.shouldCompress = function (encoding, length, response, request) {

    return encoding &&
        length !== 0 &&
        response.statusCode !== 206 &&
        response._isPayloadSupported();
};

internals.applyVaryEtag = function (response, compressor) {

    if (!response.headers.etag || !response.settings.varyEtag) {
        return response.headers.etag;
    }

    return response.headers.etag.slice(0, -1) + '-' + (response.headers['content-encoding'] || compressor) + '"';
};

internals.shouldCloseConnection = function (request) {

    const isInjection = Shot.isInjection(request.raw.req);
    if (!(isInjection || request.connection._started)) {
        return true;
    }

    return request._isPayloadPending && !request.raw.req._readableState.ended;
};

internals.isInjectionResponse = function (request) {

    return Shot.isInjection(request.raw.req);
};

internals.setupInjectionResponse = function (request, response) {

    request.raw.res._hapi = { request };

    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
};

internals.pipePayload = function (request, response, source, callback) {

    const end = Hoek.once((err, event) => {

        source.removeListener('error', end);

        request.raw.req.removeListener('aborted', onAborted);
        request.raw.req.removeListener('close', onClose);

        request.raw.res.removeListener('close', onClose);
        request.raw.res.removeListener('error', end);
        request.raw.res.removeListener('finish', end);

        if (err) {
            internals.handlePayloadError(request, response, source, err);
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

    internals.pipeStreamChain(request, response, source);
};

internals.handlePayloadError = function (request, response, source, err) {

    request.raw.res.destroy();

    if (request.raw.res._hapi) {
        request.raw.res.statusCode = 500;
        request.raw.res._hapi.result = Boom.boomify(err).output.payload;
    }

    source.unpipe();
    Response.drain(source);
};

internals.pipeStreamChain = function (request, response, source) {

    const tap = response._tap();
    const preview = (tap ? source.pipe(tap) : source);

    let current = preview;

    if (response.source !== preview) {
        current = response.source;
    }
    else if (response.headers['content-encoding']) {
        const compressor = request.connection._compression.encoder(request, response.headers['content-encoding']);
        current = current.pipe(compressor);
    }

    if (response.source !== preview && response.source instanceof Ammo.Stream) {
        current = current.pipe(response.source);
    }

    current.pipe(request.raw.res);
};