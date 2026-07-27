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

    const isInjection = Shot.isInjection(request.raw.req);
    if (isInjection) {
        request.raw.res._hapi = { request };
        if (response.variety === 'plain') {
            request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
        }
    }

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

        if (!request.raw.res.finished && event !== 'aborted') {
            request.raw.res.end();
        }

        if (event || err) {
            request.emit('disconnect');
        }

        const tags = err ? ['response', 'error'] : event ? ['response', 'error', event] : ['response'];
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

    ranged.pipe(request.raw.res);
};

/**
 * Checks if the response should return a 204 status code.
 * @param {Object} response - The response object.
 * @param {number} length - The content length of the response.
 * @returns {boolean} True if the response should return a 204 status code, false otherwise.
 */
function shouldReturn204(response, length) {
    return length === 0 && response.statusCode === 200 && request.route.settings.response.emptyStatusCode === 204;
}

/**
 * Handles a 204 response.
 * @param {Object} response - The response object.
 * @param {Function} callback - The callback function.
 */
function handle204Response(response, callback) {
    response.code(204);
    delete response.headers['content-length'];
    return callback();
}

/**
 * Gets the ranger for the response.
 * @param {Object} request - The request object.
 * @param {Object} response - The response object.
 * @param {number} length - The content length of the response.
 * @param {string} encoding - The encoding of the response.
 * @returns {Object|null} The ranger object or null if not applicable.
 */
function getRanger(request, response, length, encoding) {
    if (request.route.settings.response.ranges && request.method === 'get' && response.statusCode === 200 && length > 0 && !encoding) {
        if (request.headers.range) {
            const ranges = Ammo.header(request.headers.range, length);
            if (!ranges) {
                const error = Boom.rangeNotSatisfiable();
                error.output.headers['content-range'] = 'bytes */' + length;
                return internals.fail(request, error, () => {});
            }

            if (ranges.length === 1) {
                const range = ranges[0];
                response.code(206);
                response.bytes(range.to - range.from + 1);
                response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
                return new Ammo.Stream(range);
            }
        }
        response._header('accept-ranges', 'bytes');
    }
    return null;
}

/**
 * Gets the compressor for the response.
 * @param {Object} response - The response object.
 * @param {string} encoding - The encoding of the response.
 * @param {number} length - The content length of the response.
 * @returns {Object|null} The compressor object or null if not applicable.
 */
function getCompressor(response, encoding, length) {
    if (encoding && length !== 0 && response.statusCode !== 206 && response._isPayloadSupported()) {
        delete response.headers['content-length'];
        response._header('content-encoding', encoding);
        return request.connection._compression.encoder(request, encoding);
    }
    return null;
}