'use strict';

const Http = require('http');
const Stream = require('stream');

const Ammo = require('ammo');
const Boom = require('boom');
const Hoek = require('hoek');
const Items = require('items');
const Shot = require('shot');

const Auth = require('./auth');
const Cors = require('./cors');
const Response = require('./response');
const Security = require('./security');

const internals = {};

/**
 * Sends a response.
 * @param {Object} request
 * @param {Function} callback
 */
exports.send = function (request, callback) {

    const response = request.response;
    if (response.isBoom) {
        return internals.fail(request, response, callback);
    }

    internals.marshal(request, (err) => {

        if (err) {
            request._setResponse(err);
            return internals.fail(request, err, callback);
        }

        internals.transmit(response, (err) => {

            if (err) {
                request._setResponse(err);
                return internals.fail(request, err, callback);
            }

            return callback();
        });
    });
};

/**
 * Marshals a response before transmission.
 * @param {Object} request
 * @param {Function} next
 */
internals.marshal = function (request, next) {

    const response = request.response;

    Cors.headers(response);
    internals.content(response, false);
    Security.headers(response);
    internals.unmodified(response);

    internals.state(response, (err) => {

        if (err) {
            request._log(['state', 'response', 'error'], err);
            request._states = {};
            return next(err);
        }

        internals.cache(response);

        if (shouldSkipPayload(request, response)) {
            return handleUnsupportedPayload(request, response, next);
        }

        response._marshal((err) => {

            if (err) {
                return next(Boom.boomify(err));
            }

            applyJsonp(request, response);
            applyContentLength(response);
            maybeReplacePayload(response);

            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};

/**
 * Determines if payload processing should be skipped.
 * @param {Object} request
 * @param {Object} response
 * @returns {boolean}
 */
function shouldSkipPayload(request, response) {

    return !response._isPayloadSupported() && request.method !== 'head';
}

/**
 * Handles cases where payload is not supported.
 * @param {Object} request
 * @param {Object} response
 * @param {Function} next
 */
function handleUnsupportedPayload(request, response, next) {

    response._close();
    response._payload = new internals.Empty();
    delete response.headers['content-length'];
    return Auth.response(request, next);
}

/**
 * Applies JSONP handling if needed.
 * @param {Object} request
 * @param {Object} response
 */
function applyJsonp(request, response) {

    if (!request.jsonp || !response._payload.jsonp) {
        return;
    }

    const charset = response.settings.charset ? '; charset=' + response.settings.charset : '';
    response._header('content-type', 'text/javascript' + charset);
    response._header('x-content-type-options', 'nosniff');
    response._payload.jsonp(request.jsonp);
}

/**
 * Sets content-length header when payload provides size().
 * @param {Object} response
 */
function applyContentLength(response) {

    const payload = response._payload;
    if (payload && typeof payload.size === 'function') {
        response._header('content-length', payload.size(), { override: false });
    }
}

/**
 * Replaces payload with empty stream if unsupported.
 * @param {Object} response
 */
function maybeReplacePayload(response) {

    if (response._isPayloadSupported()) {
        return;
    }

    response._close();
    response._payload = new internals.Empty();
}

/**
 * Handles failures by marshaling error response.
 * @param {Object} request
 * @param {Object} boom
 * @param {Function} callback
 */
internals.fail = function (request, boom, callback) {

    const error = boom.output;
    const response = new Response(error.payload, request);
    response._error = boom;
    response.code(error.statusCode);
    response.headers = Hoek.clone(error.headers);
    request.response = response;

    internals.marshal(request, (err) => {

        if (err) {
            const minimal = {
                statusCode: error.statusCode,
                error: Http.STATUS_CODES[error.statusCode],
                message: boom.message
            };
            response._payload = new Response.Payload(JSON.stringify(minimal), {});
        }

        return internals.transmit(response, callback);
    });
};

/**
 * Transmits a response to the client.
 * @param {Object} response
 * @param {Function} callback
 */
internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10) || 0;

    if (shouldForceNoContent(response, request, length)) {
        response.code(204);
        delete response.headers['content-length'];
    }

    const encoding = request.connection._compression.encoding(response);
    const ranger = maybeCreateRanger(request, response, length, encoding);
    const compressor = maybeCreateCompressor(request, response, length, encoding);
    adjustVaryEtag(response, encoding);
    maybeAddConnectionCloseHeader(request, response);

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    if (Shot.isInjection(request.raw.req)) {
        injectResult(request, response);
    }

    const end = Hoek.once((err, event) => finishResponse(err, event, request, response, source, callback));

    attachListeners(request, source, end);
    const pipeline = buildPipeline(source, compressor, ranger, response);
    pipeline.pipe(request.raw.res);
};

/**
 * Determines if response should be forced to 204 No Content.
 * @param {Object} response
 * @param {Object} request
 * @param {number} length
 * @returns {boolean}
 */
function shouldForceNoContent(response, request, length) {

    return length === 0 &&
        response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204;
}

/**
 * Creates a range stream if request satisfies range conditions.
 * @param {Object} request
 * @param {Object} response
 * @param {number} length
 * @param {string|null} encoding
 * @returns {Object|null}
 */
function maybeCreateRanger(request, response, length, encoding) {

    if (!isRangeApplicable(request, response, length, encoding)) {
        return null;
    }

    const rangeHeader = request.headers.range;
    if (!rangeHeader) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (!isIfRangeValid(request, response)) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranges = Ammo.header(rangeHeader, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        internals.fail(request, error, () => {});
        return null;
    }

    if (ranges.length !== 1) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const range = ranges[0];
    response.code(206);
    response.bytes(range.to - range.from + 1);
    response._header('content-range', `bytes ${range.from}-${range.to}/${length}`);
    response._header('accept-ranges', 'bytes');

    return new Ammo.Stream(range);
}

/**
 * Checks if range request conditions are met.
 * @param {Object} request
 * @param {Object} response
 * @param {number} length
 * @param {string|null} encoding
 * @returns {boolean}
 */
function isRangeApplicable(request, response, length, encoding) {

    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !encoding;
}

/**
 * Validates If-Range header against ETag.
 * @param {Object} request
 * @param {Object} response
 * @returns {boolean}
 */
function isIfRangeValid(request, response) {

    const ifRange = request.headers['if-range'];
    return !ifRange || ifRange === response.headers.etag;
}

/**
 * Creates a compression stream if applicable.
 * @param {Object} request
 * @param {Object} response
 * @param {number} length
 * @param {string|null} encoding
 * @returns {Object|null}
 */
function maybeCreateCompressor(request, response, length, encoding) {

    if (!shouldCompress(request, response, length, encoding)) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return request.connection._compression.encoder(request, encoding);
}

/**
 * Determines if compression should be applied.
 * @param {Object} request
 * @param {Object} response
 * @param {number} length
 * @param {string|null} encoding
 * @returns {boolean}
 */
function shouldCompress(request, response, length, encoding) {

    return !!encoding &&
        length !== 0 &&
        response.statusCode !== 206 &&
        response._isPayloadSupported();
}

/**
 * Adjusts ETag header when content-encoding varies.
 * @param {Object} response
 * @param {string|null} encoding
 */
function adjustVaryEtag(response, encoding) {

    if (!((response.headers['content-encoding'] || encoding) && response.headers.etag && response.settings.varyEtag)) {
        return;
    }

    const suffix = '-' + (response.headers['content-encoding'] || encoding) + '"';
    response.headers.etag = response.headers.etag.slice(0, -1) + suffix;
}

/**
 * Adds Connection: close header when needed.
 * @param {Object} request
 * @param {Object} response
 */
function maybeAddConnectionCloseHeader(request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    const shouldClose = !(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended);

    if (shouldClose) {
        response._header('connection', 'close');
    }
}

/**
 * Injects result into response for injection mode.
 * @param {Object} request
 * @param {Object} response
 */
function injectResult(request, response) {

    request.raw.res._hapi = { request };

    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
}

/**
 * Finalizes response handling after stream ends.
 * @param {Error|null} err
 * @param {string|null} event
 * @param {Object} request
 * @param {Object} response
 * @param {Stream} source
 * @param {Function} callback
 */
function finishResponse(err, event, request, response, source, callback) {

    source.removeListener('error', finishResponse);
    request.raw.req.removeListener('aborted', onAborted);
    request.raw.req.removeListener('close', onClose);
    request.raw.res.removeListener('close', onClose);
    request.raw.res.removeListener('error', finishResponse);
    request.raw.res.removeListener('finish', finishResponse);

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

    const tags = err ? ['response', 'error'] : (event ? ['response', 'error', event] : ['response']);
    request._log(tags, err);
    return callback();
}

/**
 * Attaches necessary listeners to request and source streams.
 * @param {Object} request
 * @param {Stream} source
 * @param {Function} end
 */
function attachListeners(request, source, end) {

    source.once('error', end);

    const onAborted = () => end(null, 'aborted');
    const onClose = () => end(null, 'close');

    request.raw.req.once('aborted', onAborted);
    request.raw.req.once('close', onClose);
    request.raw.res.once('close', onClose);
    request.raw.res.once('error', end);
    request.raw.res.once('finish', end);
}

/**
 * Builds the pipeline of streams for response transmission.
 * @param {Stream} source
 * @param {Object|null} compressor
 * @param {Object|null} ranger
 * @param {Object} response
 * @returns {Stream}
 */
function buildPipeline(source, compressor, ranger, response) {

    const tap = response._tap();
    const preview = tap ? source.pipe(tap) : source;
    const compressed = compressor ? preview.pipe(compressor) : preview;
    return ranger ? compressed.pipe(ranger) : compressed;
}

/**
 * Writes response headers to the raw response.
 * @param {Object} response
 * @returns {Error|null}
 */
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

internals.Empty = function () {

    Stream.Readable.call(this);
};

Hoek.inherits(internals.Empty, Stream.Readable);

internals.Empty.prototype._read = function () {

    this.push(null);
};

internals.cache = function (response) {

    const request = response.request;

    if (response.headers['cache-control']) {
        return;
    }

    const policy = request.route.settings.cache &&
        request._route._cache &&
        (request.route.settings.cache._statuses[response.statusCode] ||
            (response.statusCode === 304 && request.route.settings.cache._statuses['200']));

    if (policy || response.settings.ttl) {
        const ttl = response.settings.ttl !== null ? response.settings.ttl : request._route._cache.ttl();
        const privacy = (request.auth.isAuthenticated || response.headers['set-cookie']) ?
            'private' :
            request.route.settings.cache.privacy || 'default';
        response._header('cache-control', `max-age=${Math.floor(ttl / 1000)}, must-revalidate${privacy !== 'default' ? ', ' + privacy : ''}`);
    }
    else if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};

internals.content = function (response, postMarshal) {

    let type = response.headers['content-type'];
    if (!type) {
        if (response._contentType) {
            const charset = (response.settings.charset && response._contentType !== 'application/octet-stream') ?
                '; charset=' + response.settings.charset :
                '';
            response.type(response._contentType + charset);
        }
        return;
    }

    type = type.trim();

    if ((response._contentType && !postMarshal) &&
        response.settings.charset &&
        /^(?:text\/|application\/(?:json|javascript))/.test(type) &&
        !/; *charset=/.test(type)) {

        const semi = type.endsWith(';');
        response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
    }
};

internals.state = function (response, next) {

    const request = response.request;
    const names = {};
    const states = [];

    const requestStates = Object.keys(request._states);
    for (let i = 0; i < requestStates.length; ++i) {
        const stateName = requestStates[i];
        names[stateName] = true;
        states.push(request._states[stateName]);
    }

    const each = (name, nextKey) => {

        const autoValue = request.connection.states.cookies[name].autoValue;
        if (!autoValue || names[name]) {
            return nextKey();
        }

        names[name] = true;

        if (typeof autoValue !== 'function') {
            states.push({ name, value: autoValue });
            return nextKey();
        }

        autoValue(request, (err, value) => {

            if (err) {
                return nextKey(err);
            }

            states.push({ name, value });
            return nextKey();
        });
    };

    const keys = Object.keys(request.connection.states.cookies);
    Items.parallel(keys, each, (err) => {

        if (err) {
            return next(Boom.boomify(err));
        }

        if (!states.length) {
            return next();
        }

        request.connection.states.format(states, (err, header) => {

            if (err) {
                return next(Boom.boomify(err));
            }

            const existing = response.headers['set-cookie'];
            if (existing) {
                header = (Array.isArray(existing) ? existing : [existing]).concat(header);
            }

            response._header('set-cookie', header);
            return next();
        });
    });
};

internals.unmodified = function (response) {

    const request = response.request;

    if (request._entity.etag && !response.headers.etag) {
        response.etag(request._entity.etag, { vary: request._entity.vary });
    }

    if (request._entity.modified && !response.headers['last-modified']) {
        response.header('last-modified', request._entity.modified);
    }

    if (response.statusCode === 304) {
        return;
    }

    const entity = {
        etag: response.headers.etag,
        vary: response.settings.varyEtag,
        modified: response.headers['last-modified']
    };

    if (Response.unmodified(request, entity)) {
        response.code(304);
    }
};