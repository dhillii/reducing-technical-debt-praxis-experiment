internals.transmit = function (response, callback) {
    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    if (shouldReturn204(response, length)) {
        return handle204Response(response, callback);
    }

    const encoding = request.connection._compression.encoding(response);
    const ranger = getRanger(request, response, length, encoding);

    const compressor = getCompressor(response, encoding, length);
    const tap = response._tap();
    const preview = tap ? source.pipe(tap) : source;
    const compressed = compressor ? preview.pipe(compressor) : preview;
    const ranged = ranger ? compressed.pipe(ranger) : compressed;

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    handleInjection(request, response, ranged);
    handlePayloadWrite(request, response, ranged, callback);
};

function shouldReturn204(response, length) {
    return length === 0 &&
        response.statusCode === 200 &&
        response.request.route.settings.response.emptyStatusCode === 204;
}

function handle204Response(response, callback) {
    response.code(204);
    delete response.headers['content-length'];
    internals.writeHead(response);
    callback();
}

function getRanger(request, response, length, encoding) {
    if (!request.route.settings.response.ranges ||
        request.method !== 'get' ||
        response.statusCode !== 200 ||
        length <= 0 ||
        encoding) {
        return null;
    }

    if (!request.headers.range) {
        return null;
    }

    if (request.headers['if-range'] && request.headers['if-range'] !== response.headers.etag) {
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        return internals.fail(request, error, () => { });
    }

    if (ranges.length > 1) {
        return null;
    }

    const range = ranges[0];
    response.code(206);
    response.bytes(range.to - range.from + 1);
    response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
    return new Ammo.Stream(range);
}

function getCompressor(response, encoding, length) {
    if (!encoding ||
        length === 0 ||
        response.statusCode === 206 ||
        !response._isPayloadSupported()) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return response.request.connection._compression.encoder(response.request, encoding);
}

function handleInjection(request, response, ranged) {
    const isInjection = Shot.isInjection(request.raw.req);
    if (isInjection) {
        request.raw.res._hapi = { request };

        if (response.variety === 'plain') {
            request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
        }
    }
}

function handlePayloadWrite(request, response, ranged, callback) {
    const end = Hoek.once((err, event) => {
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

            response._payload.unpipe();
            Response.drain(response._payload);
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

    response._payload.once('error', end);

    const onAborted = () => end(null, 'aborted');
    const onClose = () => end(null, 'close');

    request.raw.req.once('aborted', onAborted);
    request.raw.req.once('close', onClose);

    request.raw.res.once('close', onClose);
    request.raw.res.once('error', end);
    request.raw.res.once('finish', end);

    ranged.pipe(request.raw.res);
}