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

        return internals.transmit(response, (err) => {

            if (err) {
                request._setResponse(err);
                return internals.fail(request, err, callback);
            }

            return callback();
        });
    });
};


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

        if (internals.shouldSetEmptyPayload(response, request)) {
            response._close();
            response._payload = new internals.Empty();
            delete response.headers['content-length'];
            return Auth.response(request, next);
        }

        response._marshal((err) => {

            if (err) {
                return next(Boom.boomify(err));
            }

            internals.applyJsonp(response, request);
            internals.applyContentLength(response);
            internals.applyEmptyPayload(response);
            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};


/**
 * Determines if payload should be set to empty based on support and method
 */
internals.shouldSetEmptyPayload = function (response, request) {

    return !response._isPayloadSupported() && request.method !== 'head';
};


/**
 * Applies JSONP transformation if applicable
 */
internals.applyJsonp = function (response, request) {

    if (!request.jsonp || !response._payload.jsonp) {
        return;
    }

    const charset = response.settings.charset ? '; charset=' + response.settings.charset : '';
    response._header('content-type', 'text/javascript' + charset);
    response._header('x-content-type-options', 'nosniff');
    response._payload.jsonp(request.jsonp);
};


/**
 * Applies content-length header if payload size is available
 */
internals.applyContentLength = function (response) {

    if (!response._payload.size || typeof response._payload.size !== 'function') {
        return;
    }

    response._header('content-length', response._payload.size(), { override: false });
};


/**
 * Sets empty payload if not supported
 */
internals.applyEmptyPayload = function (response) {

    if (response._isPayloadSupported()) {
        return;
    }

    response._close();
    response._payload = new internals.Empty();
};


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


internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    internals.applyEmptyStatusCode(response, length);

    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.setupRanging(request, response, length, encoding, callback);

    if (!ranger) {
        return;
    }

    const compressor = internals.setupCompression(request, response, encoding, length);
    internals.setupConnectionClose(request, response);

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    internals.setupInjection(request, response);
    internals.pipePayload(request, response, source, ranger, compressor, callback);
};


/**
 * Applies 204 status code for empty responses when configured
 */
internals.applyEmptyStatusCode = function (response, length) {

    if (length !== 0 || response.statusCode !== 200) {
        return;
    }

    if (response.request.route.settings.response.emptyStatusCode !== 204) {
        return;
    }

    response.code(204);
    delete response.headers['content-length'];
};


/**
 * Sets up HTTP range request handling
 */
internals.setupRanging = function (request, response, length, encoding, callback) {

    if (!internals.shouldEnableRanging(request, response, length, encoding)) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (!request.headers.range) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    return internals.processRangeHeader(request, response, length, callback);
};


/**
 * Determines if range requests should be enabled
 */
internals.shouldEnableRanging = function (request, response, length, encoding) {

    if (!request.route.settings.response.ranges) {
        return false;
    }

    if (request.method !== 'get') {
        return false;
    }

    if (response.statusCode !== 200) {
        return false;
    }

    if (length <= 0) {
        return false;
    }

    if (encoding) {
        return false;
    }

    return true;
};


/**
 * Processes the Range header and sets up ranger stream
 */
internals.processRangeHeader = function (request, response, length, callback) {

    if (internals.isRangeNotSatisfiable(request, response)) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        internals.fail(request, error, callback);
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges || ranges.length !== 1) {
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


/**
 * Determines if range request cannot be satisfied
 */
internals.isRangeNotSatisfiable = function (request, response) {

    if (request.headers['if-range'] && request.headers['if-range'] !== response.headers.etag) {
        return true;
    }

    return false;
};


/**
 * Sets up compression if applicable
 */
internals.setupCompression = function (request, response, encoding, length) {

    if (!internals.shouldCompress(response, encoding, length)) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);

    return request.connection._compression.encoder(request, encoding);
};


/**
 * Determines if response should be compressed
 */
internals.shouldCompress = function (response, encoding, length) {

    if (!encoding) {
        return false;
    }

    if (length === 0) {
        return false;
    }

    if (response.statusCode === 206) {
        return false;
    }

    if (!response._isPayloadSupported()) {
        return false;
    }

    return true;
};


/**
 * Updates ETag if content-encoding is applied
 */
internals.updateEtagForEncoding = function (response, encoding) {

    if (!response.headers['content-encoding'] && !encoding) {
        return;
    }

    if (!response.headers.etag || !response.settings.varyEtag) {
        return;
    }

    const appliedEncoding = response.headers['content-encoding'] || encoding;
    response.headers.etag = response.headers.etag.slice(0, -1) + '-' + appliedEncoding + '"';
};


/**
 * Sets up connection close header if needed
 */
internals.setupConnectionClose = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);

    if (isInjection || request.connection._started) {
        if (request._isPayloadPending && !request.raw.req._readableState.ended) {
            response._header('connection', 'close');
        }
        return;
    }

    response._header('connection', 'close');
};


/**
 * Sets up injection response metadata
 */
internals.setupInjection = function (request, response) {

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
 * Pipes payload through transformation streams and to response
 */
internals.pipePayload = function (request, response, source, ranger, compressor, callback) {

    const end = internals.createPayloadEndHandler(request, response, source, callback);

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


/**
 * Creates the end handler for payload transmission
 */
internals.createPayloadEndHandler = function (request, response, source, callback) {

    return Hoek.once((err, event) => {

        source.removeListener('error', arguments.callee);

        request.raw.req.removeListener('aborted', arguments.callee);
        request.raw.req.removeListener('close', arguments.callee);

        request.raw.res.removeListener('close', arguments.callee);
        request.raw.res.removeListener('error', arguments.callee);
        request.raw.res.removeListener('finish', arguments.callee);

        internals.handlePayloadError(request, response, source, err);
        internals.finishResponse(request, response, err, event);

        const tags = (err ? ['response', 'error'] : (event ? ['response', 'error', event] : ['response']));
        request._log(tags, err);
        return callback();
    });
};


/**
 * Handles errors during payload transmission
 */
internals.handlePayloadError = function (request, response, source, err) {

    if (!err) {
        return;
    }

    request.raw.res.destroy();

    if (request.raw.res._hapi) {
        request.raw.res.statusCode = 500;
        request.raw.res._hapi.result = Boom.boomify(err).output.payload;
    }

    source.unpipe();
    Response.drain(source);
};


/**
 * Finishes the response if not already finished
 */
internals.finishResponse = function (request, response, err, event) {

    if (request.raw.res.finished || event === 'aborted') {
        return;
    }

    request.raw.res.end();

    if (err || event) {
        request.emit('disconnect');
    }
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


internals.Empty = function () {

    Stream.Readable.call(this);
};

Hoek.inherits(internals.Empty, Stream.Readable);


internals.Empty.prototype._read = function (/* size */) {

    this.push(null);
};


internals.cache = function (response) {

    const request = response.request;

    if (response.headers['cache-control']) {
        return;
    }

    const policy = internals.getCachePolicy(request, response);

    if (!policy && !response.settings.ttl) {
        internals.applyCacheOtherwise(request, response);
        return;
    }

    internals.applyCacheTtl(request, response);
};


/**
 * Determines cache policy based on route settings and status code
 */
internals.getCachePolicy = function (request, response) {

    if (!request.route.settings.cache || !request._route._cache) {
        return null;
    }

    const statusPolicy = request.route.settings.cache._statuses[response.statusCode];
    if (statusPolicy) {
        return statusPolicy;
    }

    if (response.statusCode === 304 && request.route.settings.cache._statuses['200']) {
        return request.route.settings.cache._statuses['200'];
    }

    return null;
};


/**
 * Applies cache-control header with TTL
 */
internals.applyCacheTtl = function (request, response) {

    const ttl = response.settings.ttl !== null ? response.settings.ttl : request._route._cache.ttl();
    const isAuthenticated = request.auth.isAuthenticated;
    const hasCookie = response.headers['set-cookie'];
    const privacy = (isAuthenticated || hasCookie) ? 'private' : (request.route.settings.cache.privacy || 'default');
    const privacySuffix = privacy !== 'default' ? ', ' + privacy : '';

    response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + privacySuffix);
};


/**
 * Applies default cache-control header
 */
internals.applyCacheOtherwise = function (request, response) {

    if (!request.route.settings.cache) {
        return;
    }

    response._header('cache-control', request.route.settings.cache.otherwise);
};


internals.content = function (response, postMarshal) {

    let type = response.headers['content-type'];

    if (!type) {
        internals.setDefaultContentType(response);
        return;
    }

    internals.updateContentTypeCharset(response, type, postMarshal);
};


/**
 * Sets default content-type if not already set
 */
internals.setDefaultContentType = function (response) {

    if (!response._contentType) {
        return;
    }

    const charset = response.settings.charset && response._contentType !== 'application/octet-stream' ? '; charset=' + response.settings.charset : '';
    response.type(response._contentType + charset);
};


/**
 * Updates content-type with charset if applicable
 */
internals.updateContentTypeCharset = function (response, type, postMarshal) {

    type = type.trim();

    if (!internals.shouldAddCharset(response, type, postMarshal)) {
        return;
    }

    if (type.match(/; *charset=/)) {
        return;
    }

    const semi = (type[type.length - 1] === ';');
    response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
};


/**
 * Determines if charset should be added to content-type
 */
internals.shouldAddCharset = function (response, type, postMarshal) {

    if (!response.settings.charset) {
        return false;
    }

    if (response._contentType && postMarshal) {
        return false;
    }

    if (!type.match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/)) {
        return false;
    }

    return true;
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

    internals.applyEntityHeaders(response, request);

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


/**
 * Applies entity headers from request to response
 */
internals.applyEntityHeaders = function (response, request) {

    if (request._entity.etag && !response.headers.etag) {
        response.etag(request._entity.etag, { vary: request._entity.vary });
    }

    if (request._entity.modified && !response.headers['last-modified']) {
        response.header('last-modified', request._entity.modified);
    }
};