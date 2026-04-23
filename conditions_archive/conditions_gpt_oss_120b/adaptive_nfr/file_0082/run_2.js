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
            request._states = {}; // Clear broken state
            return next(err);
        }

        internals.cache(response);
        if (internals.isUnsupportedPayload(response, request)) {
            return internals.handleUnsupportedPayload(request, response, next);
        }

        response._marshal((err) => {
            if (err) {
                return next(Boom.boomify(err));
            }

            internals.applyJsonp(request, response);
            internals.applyPayloadSizeHeader(response);
            if (!response._isPayloadSupported()) {
                response._close();
                response._payload = new internals.Empty();
            }

            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};

/**
 * Handles unsupported payload case.
 */
internals.handleUnsupportedPayload = function (request, response, next) {

    response._close(); // Close unused file streams
    response._payload = new internals.Empty();
    delete response.headers['content-length'];
    return Auth.response(request, next); // Must be last in case requires access to headers
};

/**
 * Determines if payload is unsupported for the request.
 */
internals.isUnsupportedPayload = function (response, request) {

    return !response._isPayloadSupported() && request.method !== 'head';
};

/**
 * Applies JSONP handling if needed.
 */
internals.applyJsonp = function (request, response) {

    if (request.jsonp && response._payload.jsonp) {
        response._header('content-type', 'text/javascript' + (response.settings.charset ? '; charset=' + response.settings.charset : ''));
        response._header('x-content-type-options', 'nosniff');
        response._payload.jsonp(request.jsonp);
    }
};

/**
 * Applies content-length header if payload provides size.
 */
internals.applyPayloadSizeHeader = function (response) {

    if (response._payload.size && typeof response._payload.size === 'function') {
        response._header('content-length', response._payload.size(), { override: false });
    }
};

/**
 * Handles failure cases.
 */
internals.fail = function (request, boom, callback) {

    const error = boom.output;
    const response = new Response(error.payload, request);
    response._error = boom;
    response.code(error.statusCode);
    response.headers = Hoek.clone(error.headers); // Prevent source from being modified
    request.response = response; // Not using request._setResponse() to avoid double log

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
 */
internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    if (internals.shouldTreatAsEmpty(length, response, request)) {
        response.code(204);
        delete response.headers['content-length'];
    }

    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.maybeCreateRanger(request, response, length, encoding);
    const compressor = internals.maybeCreateCompressor(request, response, length, encoding);
    internals.maybeAdjustVaryEtag(response, encoding);
    internals.maybeSetConnectionClose(request, response);
    const writeError = internals.writeHead(response);
    if (writeError) {
        return Hoek.nextTick(callback)(writeError);
    }

    internals.handleInjection(request, response);
    internals.pipeResponse(source, request, response, ranger, compressor, callback);
};

/**
 * Determines if response should be treated as empty.
 */
internals.shouldTreatAsEmpty = function (length, response, request) {

    return length === 0 &&
        response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204;
};

/**
 * Creates a range stream if applicable.
 */
internals.maybeCreateRanger = function (request, response, length, encoding) {

    if (!internals.isRangeSupported(request, response, length, encoding)) {
        return null;
    }

    if (!request.headers.range) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (!internals.isIfRangeValid(request, response)) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        internals.fail(request, error, Hoek.noop);
        return null;
    }

    if (ranges.length !== 1) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const range = ranges[0];
    response.code(206);
    response.bytes(range.to - range.from + 1);
    response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
    response._header('accept-ranges', 'bytes');
    return new Ammo.Stream(range);
};

/**
 * Checks if range handling is applicable.
 */
internals.isRangeSupported = function (request, response, length, encoding) {

    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !encoding;
};

/**
 * Validates If-Range header.
 */
internals.isIfRangeValid = function (request, response) {

    return !request.headers['if-range'] ||
        request.headers['if-range'] === response.headers.etag;
};

/**
 * Creates a compression stream if applicable.
 */
internals.maybeCreateCompressor = function (request, response, length, encoding) {

    if (!internals.isCompressionApplicable(request, response, length, encoding)) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return request.connection._compression.encoder(request, encoding);
};

/**
 * Checks if compression should be applied.
 */
internals.isCompressionApplicable = function (request, response, length, encoding) {

    return encoding &&
        length !== 0 &&
        response.statusCode !== 206 &&
        response._isPayloadSupported();
};

/**
 * Adjusts ETag when content-encoding varies.
 */
internals.maybeAdjustVaryEtag = function (response, encoding) {

    if (!((response.headers['content-encoding'] || encoding) && response.headers.etag && response.settings.varyEtag)) {
        return;
    }

    response.headers.etag = response.headers.etag.slice(0, -1) + '-' + (response.headers['content-encoding'] || encoding) + '"';
};

/**
 * Sets connection: close header when needed.
 */
internals.maybeSetConnectionClose = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    if (isInjection || request.connection._started) {
        return;
    }

    if (request._isPayloadPending && !request.raw.req._readableState.ended) {
        return;
    }

    response._header('connection', 'close');
};

/**
 * Handles injection-specific response modifications.
 */
internals.handleInjection = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    if (!isInjection) {
        return;
    }

    request.raw.res._hapi = { request };

    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
};

/**
 * Pipes the response payload through optional transforms and writes to the client.
 */
internals.pipeResponse = function (source, request, response, ranger, compressor, callback) {

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
    const preview = tap ? source.pipe(tap) : source;
    const compressed = compressor ? preview.pipe(compressor) : preview;
    const ranged = ranger ? compressed.pipe(ranger) : compressed;
    ranged.pipe(request.raw.res);
};

/**
 * Writes response headers.
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

/**
 * Empty stream implementation.
 */
internals.Empty = function () {

    Stream.Readable.call(this);
};

Hoek.inherits(internals.Empty, Stream.Readable);

internals.Empty.prototype._read = function () {

    this.push(null);
};

/**
 * Adds cache-control header if needed.
 */
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
        const privacy = internals.calculatePrivacy(request, response);
        response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + (privacy !== 'default' ? ', ' + privacy : ''));
    }
    else if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};

/**
 * Determines privacy directive for cache-control.
 */
internals.calculatePrivacy = function (request, response) {

    if (request.auth.isAuthenticated || response.headers['set-cookie']) {
        return 'private';
    }

    return request.route.settings.cache.privacy || 'default';
};

/**
 * Sets content-type and charset handling.
 */
internals.content = function (response, postMarshal) {

    let type = response.headers['content-type'];
    if (!type) {
        if (response._contentType) {
            const charset = internals.buildCharset(response);
            response.type(response._contentType + charset);
        }
        return;
    }

    type = type.trim();
    if (internals.shouldAddCharset(response, type, postMarshal)) {
        const semi = type[type.length - 1] === ';';
        response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
    }
};

/**
 * Builds charset suffix for content-type.
 */
internals.buildCharset = function (response) {

    if (!response.settings.charset || response._contentType === 'application/octet-stream') {
        return '';
    }

    return '; charset=' + response.settings.charset;
};

/**
 * Determines if charset should be added to existing content-type.
 */
internals.shouldAddCharset = function (response, type, postMarshal) {

    if ((response._contentType && !postMarshal) ||
        !response.settings.charset) {
        return false;
    }

    const isText = type.match(/^(?:text\/)|(?:application\/(?:json|javascript))/);
    if (!isText) {
        return false;
    }

    return !type.match(/; *charset=/);
};

/**
 * Handles state cookies.
 */
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

/**
 * Handles unmodified responses based on entity tags.
 */
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