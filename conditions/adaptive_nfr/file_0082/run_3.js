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
    const ranger = internals.setupRanging(request, response, length, encoding, callback);

    if (ranger === false) {
        return;
    }

    const compressor = internals.setupCompression(request, response, encoding, length);
    internals.setupConnectionClose(request, response);

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    internals.setupInjection(request, response);
    internals.pipePayload(request, response, source, compressor, ranger, callback);
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
 * Determines if range request conditions are met
 */
internals.isRangeRequestAllowed = function (request, response, length, encoding) {

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
 * Checks if If-Range condition is satisfied
 */
internals.isIfRangeSatisfied = function (request, response) {

    if (!request.headers['if-range']) {
        return true;
    }

    return request.headers['if-range'] === response.headers.etag;
};


/**
 * Processes range header and returns ranger or error
 */
internals.processRangeHeader = function (request, response, length, callback) {

    if (!request.headers.range) {
        return null;
    }

    if (!internals.isIfRangeSatisfied(request, response)) {
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        internals.fail(request, error, callback);
        return false;
    }

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
 * Sets up range request handling
 */
internals.setupRanging = function (request, response, length, encoding, callback) {

    if (!internals.isRangeRequestAllowed(request, response, length, encoding)) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranger = internals.processRangeHeader(request, response, length, callback);
    response._header('accept-ranges', 'bytes');

    return ranger;
};


/**
 * Determines if compression should be applied
 */
internals.shouldCompress = function (encoding, length, statusCode, isPayloadSupported) {

    if (!encoding) {
        return false;
    }

    if (length === 0) {
        return false;
    }

    if (statusCode === 206) {
        return false;
    }

    if (!isPayloadSupported) {
        return false;
    }

    return true;
};


/**
 * Sets up compression for response
 */
internals.setupCompression = function (request, response, encoding, length) {

    if (!internals.shouldCompress(encoding, length, response.statusCode, response._isPayloadSupported())) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);

    return request.connection._compression.encoder(request, encoding);
};


/**
 * Updates ETag if content-encoding is applied
 */
internals.updateEtagForEncoding = function (response, encoding) {

    if (!response.headers['content-encoding'] && !encoding) {
        return;
    }

    if (!response.headers.etag) {
        return;
    }

    if (!response.settings.varyEtag) {
        return;
    }

    const appliedEncoding = response.headers['content-encoding'] || encoding;
    response.headers.etag = response.headers.etag.slice(0, -1) + '-' + appliedEncoding + '"';
};


/**
 * Determines if connection should be closed
 */
internals.shouldCloseConnection = function (request) {

    const isInjection = Shot.isInjection(request.raw.req);

    if (isInjection || request.connection._started) {
        if (request._isPayloadPending && !request.raw.req._readableState.ended) {
            return true;
        }
        return false;
    }

    return true;
};


/**
 * Sets up connection close header if needed
 */
internals.setupConnectionClose = function (request, response) {

    if (internals.shouldCloseConnection(request)) {
        response._header('connection', 'close');
    }
};


/**
 * Sets up injection-specific response properties
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
 * Handles payload piping and stream events
 */
internals.pipePayload = function (request, response, source, compressor, ranger, callback) {

    const end = Hoek.once((err, event) => {

        internals.cleanupStreamListeners(request, source, end);

        if (err) {
            internals.handlePayloadError(request, source, err);
        }

        if (!request.raw.res.finished && event !== 'aborted') {
            request.raw.res.end();
        }

        if (event || err) {
            request.emit('disconnect');
        }

        const tags = internals.getLogTags(err, event);
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

    internals.buildAndPipeStream(request, response, source, compressor, ranger);
};


/**
 * Removes all stream event listeners
 */
internals.cleanupStreamListeners = function (request, source, end) {

    source.removeListener('error', end);
    request.raw.req.removeListener('aborted', end);
    request.raw.req.removeListener('close', end);
    request.raw.res.removeListener('close', end);
    request.raw.res.removeListener('error', end);
    request.raw.res.removeListener('finish', end);
};


/**
 * Handles errors during payload transmission
 */
internals.handlePayloadError = function (request, source, err) {

    request.raw.res.destroy();

    if (request.raw.res._hapi) {
        request.raw.res.statusCode = 500;
        request.raw.res._hapi.result = Boom.boomify(err).output.payload;
    }

    source.unpipe();
    Response.drain(source);
};


/**
 * Determines log tags based on error and event
 */
internals.getLogTags = function (err, event) {

    if (err) {
        return ['response', 'error'];
    }

    if (event) {
        return ['response', 'error', event];
    }

    return ['response'];
};


/**
 * Builds and pipes the response stream through transformations
 */
internals.buildAndPipeStream = function (request, response, source, compressor, ranger) {

    const tap = response._tap();
    const preview = tap ? source.pipe(tap) : source;
    const compressed = compressor ? preview.pipe(compressor) : preview;
    const ranged = ranger ? compressed.pipe(ranger) : compressed;
    ranged.pipe(request.raw.res);
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

    if (policy || response.settings.ttl) {
        internals.setCacheControl(request, response);
    }
    else if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};


/**
 * Determines if cache policy applies to response
 */
internals.getCachePolicy = function (request, response) {

    if (!request.route.settings.cache || !request._route._cache) {
        return false;
    }

    const statusPolicy = request.route.settings.cache._statuses[response.statusCode];
    if (statusPolicy) {
        return true;
    }