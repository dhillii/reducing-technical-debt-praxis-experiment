internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    internals.handleEmptyResponse(response, request);
    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.handleRange(request, response, length, encoding);
    const compressor = internals.handleCompression(request, response, encoding, length);

    internals.handleConnectionClose(request, response);
    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    internals.handleInjection(request, response);

    internals.pipePayload(request, response, source, compressor, ranger, callback);
};


internals.handleEmptyResponse = function (response, request) {

    if (response.headers['content-length'] === '0' &&
        response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204) {

        response.code(204);
        delete response.headers['content-length'];
    }
};


internals.handleRange = function (request, response, length, encoding) {

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
        throw error;
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


internals.handleCompression = function (request, response, encoding, length) {

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


internals.handleConnectionClose = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    if (!(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended)) {

        response._header('connection', 'close');
    }
};


internals.writeHead = function (response) {

    const res = response.request.raw.res;
    const headers = Object.keys(response.headers);

    try {
        for (let i = 0; i < headers.length; ++i) {
            const header = headers[i];
            const value = response.headers[header];
            if (value !== undefined) {
                res.setHeader(header, value);
            }
        }
    }
    catch (err) {
        for (let j = i - 1; j >= 0; --j) {
            res.setHeader(headers[j], null);
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

    if (response.variety === 'plain' &&
        response._isPayloadSupported()) {

        request.raw.res._hapi.result = response.source;
    }
};


internals.pipePayload = function (request, response, source, compressor, ranger, callback) {

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