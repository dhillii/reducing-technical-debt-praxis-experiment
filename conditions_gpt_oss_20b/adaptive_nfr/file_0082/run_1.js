internals.transmit = function (response, callback) {
    // Setup source
    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10); // In case value is a string

    // Empty response
    if (isEmptyResponse(length, response.statusCode, request.route.settings.response.emptyStatusCode)) {
        response.code(204);
        delete response.headers['content-length'];
    }

    // Compression
    const encoding = request.connection._compression.encoding(response);

    // Range
    const ranger = handleRange(request, response, length, encoding);

    // Content-Encoding
    const compressor = handleCompression(response, encoding, length);

    // Adjust ETag if needed
    adjustEtagIfNeeded(response, encoding);

    // Connection: close
    const isInjection = Shot.isInjection(request.raw.req);
    if (shouldCloseConnection(isInjection, request)) {
        response._header('connection', 'close');
    }

    // Write headers
    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    // Injection
    if (isInjection) {
        request.raw.res._hapi = { request };
        if (response.variety === 'plain') {
            request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
        }
    }

    // Write payload
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
                request.raw.res._hapi.result = Boom.boomify(err).output.payload; // Force injected response to error
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

        const tags = getTags(err, event);
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
    const preview = tap ? source.pipe(tap) : source;
    const compressed = compressor ? preview.pipe(compressor) : preview;
    const ranged = ranger ? compressed.pipe(ranger) : compressed;
    ranged.pipe(request.raw.res);
};

/**
 * Determines if the response should be treated as an empty response.
 *
 * @param {number} length - The content length.
 * @param {number} statusCode - The current status code.
 * @param {number} emptyStatusCode - The configured empty status code.
 * @returns {boolean}
 */
function isEmptyResponse(length, statusCode, emptyStatusCode) {
    return length === 0 && statusCode === 200 && emptyStatusCode === 204;
}

/**
 * Handles HTTP range requests and returns a ranger stream if applicable.
 *
 * @param {Object} request - The request object.
 * @param {Object} response - The response object.
 * @param {number} length - The content length.
 * @param {string} encoding - The selected encoding.
 * @returns {Object|null} The ranger stream or null.
 */
function handleRange(request, response, length, encoding) {
    if (!request.route.settings.response.ranges ||
        request.method !== 'get' ||
        response.statusCode !== 200 ||
        length <= 0 ||
        encoding) {
        return null;
    }

    if (!request.headers.range) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (!request.headers['if-range'] || request.headers['if-range'] === response.headers.etag) {
        const ranges = Ammo.header(request.headers.range, length);
        if (!ranges) {
            const error = Boom.rangeNotSatisfiable();
            error.output.headers['content-range'] = 'bytes */' + length;
            internals.fail(request, error, callback);
            return null;
        }

        if (ranges.length === 1) {
            const range = ranges[0];
            const ranger = new Ammo.Stream(range);
            response.code(206);
            response.bytes(range.to - range.from + 1);
            response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
            response._header('accept-ranges', 'bytes');
            return ranger;
        }
    }

    response._header('accept-ranges', 'bytes');
    return null;
}

/**
 * Handles content compression and returns a compressor stream if applicable.
 *
 * @param {Object} response - The response object.
 * @param {string} encoding - The selected encoding.
 * @param {number} length - The content length.
 * @returns {Object|null} The compressor stream or null.
 */
function handleCompression(response, encoding, length) {
    if (!encoding || length === 0 || response.statusCode === 206 || !response._isPayloadSupported()) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);

    return request.connection._compression.encoder(request, encoding);
}

/**
 * Adjusts the ETag header if content-encoding is present.
 *
 * @param {Object} response - The response object.
 * @param {string} encoding - The selected encoding.
 */
function adjustEtagIfNeeded(response, encoding) {
    if ((response.headers['content-encoding'] || encoding) &&
        response.headers.etag &&
        response.settings.varyEtag) {
        response.headers.etag = response.headers.etag.slice(0, -1) + '-' + (response.headers['content-encoding'] || encoding) + '"';
    }
}

/**
 * Determines whether the connection should be closed.
 *
 * @param {boolean} isInjection - Whether the request is an injection.
 * @param {Object} request - The request object.
 * @returns {boolean}
 */
function shouldCloseConnection(isInjection, request) {
    return !(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended);
}

/**
 * Returns the appropriate log tags based on error and event.
 *
 * @param {Error|null} err - The error, if any.
 * @param {string|null} event - The event, if any.
 * @returns {Array<string>}
 */
function getTags(err, event) {
    if (err) {
        return ['response', 'error'];
    }
    if (event) {
        return ['response', 'error', event];
    }
    return ['response'];
}