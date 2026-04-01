```javascript
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

            internals.applyJsonp(request, response);
            internals.applyContentLength(response);
            internals.closeUnsupportedPayload(response);
            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};


/**
 * Determines if payload should be set to empty stream
 */
internals.shouldSetEmptyPayload = function (response, request) {

    return !response._isPayloadSupported() && request.method !== 'head';
};


/**
 * Applies JSONP transformation if applicable
 */
internals.applyJsonp = function (request, response) {

    if (!request.jsonp || !response._payload.jsonp) {
        return;
    }

    const charset = response.settings.charset ? '; charset=' + response.settings.charset : '';
    response._header('content-type', 'text/javascript' + charset);
    response._header('x-content-type-options', 'nosniff');
    response._payload.jsonp(request.jsonp);
};


/**
 * Sets content-length header if payload size is available
 */
internals.applyContentLength = function (response) {

    if (!response._payload.size || typeof response._payload.size !== 'function') {
        return;
    }

    response._header('content-length', response._payload.size(), { override: false });
};


/**
 * Closes and replaces payload if not supported
 */
internals.closeUnsupportedPayload = function (response) {

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
            internals.setMinimalErrorPayload(response, error, boom);
        }

        return internals.transmit(response, callback);
    });
};


/**
 * Sets minimal error payload when marshaling fails
 */
internals.setMinimalErrorPayload = function (response, error, boom) {

    const minimal = {
        statusCode: error.statusCode,
        error: Http.STATUS_CODES[error.statusCode],
        message: boom.message
    };

    response._payload = new Response.Payload(JSON.stringify(minimal), {});
};


internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    internals.applyEmptyStatusCode(response, length);
    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.setupRangeRequest(request, response, length, encoding, callback);

    if (ranger === false) {
        return;
    }

    const compressor = internals.setupCompression(request, response, encoding, length);
    internals.applyEtagEncoding(response, encoding);
    internals.applyConnectionClose(request, response);

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    internals.setupInjection(request, response);
    internals.pipePayload(request, response, source, ranger, compressor, callback);
};


/**
 * Applies 204 status code for empty responses
 */
internals.applyEmptyStatusCode = function (response, length) {

    const isEmptyResponse = length === 0 && response.statusCode === 200;
    const shouldUse204 = response.request.route.settings.response.emptyStatusCode === 204;

    if (!isEmptyResponse || !shouldUse204) {
        return;
    }

    response.code(204);
    delete response.headers['content-length'];
};


/**
 * Determines if range request conditions are met
 */
internals.isRangeRequestEligible = function (request, response, length, encoding) {

    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !encoding;
};


/**
 * Checks if If-Range header matches current ETag
 */
internals.isIfRangeValid = function (request, response) {

    if (!request.headers['if-range']) {
        return true;
    }

    return request.headers['if-range'] === response.headers.etag;
};


/**
 * Processes range request and returns ranger or false on error
 */
internals.setupRangeRequest = function (request, response, length, encoding, callback) {

    if (!internals.isRangeRequestEligible(request, response, length, encoding)) {
        response._header('accept-ranges', 'bytes');
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
        internals.fail(request, error, callback);
        return false;
    }

    response._header('accept-ranges', 'bytes');

    if (ranges.length !== 1) {
        return null;
    }

    const range = ranges[0];
    const ranger = new Ammo.Stream(range);
    response.code(206);
    response.bytes(range.to - range.from + 1);
    response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);

    return ranger;
};


/**
 * Sets up compression if applicable
 */
internals.setupCompression = function (request, response, encoding, length) {

    if (!encoding || length === 0 || response.statusCode === 206 || !response._isPayloadSupported()) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);

    return request.connection._compression.encoder(request, encoding);
};


/**
 * Applies ETag modification for encoded responses
 */
internals.applyEtagEncoding = function (response, encoding) {

    const hasEncoding = response.headers['content-encoding'] || encoding;
    if (!hasEncoding || !response.headers.etag || !response.settings.varyEtag) {
        return;
    }

    const encodingValue = response.headers['content-encoding'] || encoding;
    response.headers.etag = response.headers.etag.slice(0, -1) + '-' + encodingValue + '"';
};


/**
 * Determines if connection should be closed
 */
internals.shouldCloseConnection = function (request) {

    const isInjection = Shot.isInjection(request.raw.req);
    const connectionStarted = request.connection._started;
    const payloadPending = request._isPayloadPending && !request.raw.req._readableState.ended;

    return !(isInjection || connectionStarted) || payloadPending;
};


/**
 * Applies connection close header if needed
 */
internals.applyConnectionClose = function (request, response) {

    if (internals.shouldCloseConnection(request)) {
        response._header('connection', 'close');
    }
};


/**
 * Sets up injection response metadata
 */
internals.setupInjection = function (request, response) {

    if (!Shot.isInjection(request.raw.req)) {
        return;
    }

    request.raw.res._hapi = { request };

    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
};


/**
 * Pipes payload through transformations and to response
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
        internals.finalizeResponse(request, response, err, event);
        internals.logPayloadEvent(request, err, event);

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
 * Finalizes response after payload transmission
 */
internals.finalizeResponse = function (request, response, err, event) {

    if (request.raw.res.finished || event === 'aborted') {
        return;
    }

    request.raw.res.end();
};


/**
 * Logs payload transmission event
 */
internals.logPayloadEvent = function (request, err, event) {

    if (err) {
        request.emit('disconnect');
        request._log(['response', 'error'], err);
        return;
    }

    if (event) {
        request.emit('disconnect');
        request._log(['response', 'error', event]);
        return;
    }

    request._log(['response']);
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

    internals.applyCacheControl(request, response, policy);
};


/**
 * Determines cache policy for response
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
 * Applies cache control header
 */
internals.applyCacheControl = function (request, response, policy) {

    const ttl = response.settings.ttl !== null ? response.settings.ttl : request._route._cache.ttl();
    const isAuthenticated = request.auth.isAuthenticated;
    const hasCookie = response.headers['set-cookie'];
    const privacy = (isAuthenticated || hasCookie) ? 'private' : (request.route.settings.cache