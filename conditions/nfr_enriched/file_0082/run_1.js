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

// ============================================================================
// Public API
// ============================================================================

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

        return internals.transmit(response, callback);
    });
};

// ============================================================================
// Response Marshaling
// ============================================================================

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

        if (!response._isPayloadSupported() && request.method !== 'head') {
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

            if (!response._isPayloadSupported()) {
                response._close();
                response._payload = new internals.Empty();
            }

            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};

internals.applyJsonp = function (response, request) {

    if (!request.jsonp || !response._payload.jsonp) {
        return;
    }

    const charset = response.settings.charset ? '; charset=' + response.settings.charset : '';
    response._header('content-type', 'text/javascript' + charset);
    response._header('x-content-type-options', 'nosniff');
    response._payload.jsonp(request.jsonp);
};

internals.applyContentLength = function (response) {

    if (response._payload.size && typeof response._payload.size === 'function') {
        response._header('content-length', response._payload.size(), { override: false });
    }
};

// ============================================================================
// Error Handling
// ============================================================================

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

// ============================================================================
// Response Transmission
// ============================================================================

internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    internals.applyEmptyStatusCode(response, length);
    internals.applyRangeSupport(response, request, length, callback);
    internals.applyCompression(response, request, length);
    internals.applyEtagEncoding(response);
    internals.applyConnectionHeader(request, response);

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    internals.setupInjection(request, response);
    internals.pipePayload(request, response, source, callback);
};

internals.applyEmptyStatusCode = function (response, length) {

    if (length === 0 &&
        response.statusCode === 200 &&
        response.request.route.settings.response.emptyStatusCode === 204) {

        response.code(204);
        delete response.headers['content-length'];
    }
};

internals.applyRangeSupport = function (response, request, length, callback) {

    if (!request.route.settings.response.ranges ||
        request.method !== 'get' ||
        response.statusCode !== 200 ||
        length === 0) {

        response._header('accept-ranges', 'bytes');
        return;
    }

    const encoding = request.connection._compression.encoding(response);
    if (encoding) {
        response._header('accept-ranges', 'bytes');
        return;
    }

    if (!request.headers.range) {
        response._header('accept-ranges', 'bytes');
        return;
    }

    internals.processRangeRequest(response, request, length, callback);
};

internals.processRangeRequest = function (response, request, length, callback) {

    if (request.headers['if-range'] &&
        request.headers['if-range'] !== response.headers.etag) {

        response._header('accept-ranges', 'bytes');
        return;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        return internals.fail(request, error, callback);
    }

    if (ranges.length === 1) {
        const range = ranges[0];
        response._ranger = new Ammo.Stream(range);
        response.code(206);
        response.bytes(range.to - range.from + 1);
        response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
    }

    response._header('accept-ranges', 'bytes');
};

internals.applyCompression = function (response, request, length) {

    const encoding = request.connection._compression.encoding(response);

    if (!encoding || length === 0 || response.statusCode === 206 || !response._isPayloadSupported()) {
        return;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    response._compressor = request.connection._compression.encoder(request, encoding);
};

internals.applyEtagEncoding = function (response) {

    const encoding = response.headers['content-encoding'];
    if (!encoding || !response.headers.etag || !response.settings.varyEtag) {
        return;
    }

    response.headers.etag = response.headers.etag.slice(0, -1) + '-' + encoding + '"';
};

internals.applyConnectionHeader = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    if ((isInjection || request.connection._started) &&
        (!request._isPayloadPending || request.raw.req._readableState.ended)) {

        return;
    }

    response._header('connection', 'close');
};

internals.setupInjection = function (request, response) {

    if (!Shot.isInjection(request.raw.req)) {
        return;
    }

    request.raw.res._hapi = { request };

    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
};

internals.pipePayload = function (request, response, source, callback) {

    const end = internals.createPayloadEndHandler(request, response, source, callback);

    source.once('error', end);

    const onAborted = () => end(null, 'aborted');
    const onClose = () => end(null, 'close');

    request.raw.req.once('aborted', onAborted);
    request.raw.req.once('close', onClose);
    request.raw.res.once('close', onClose);
    request.raw.res.once('error', end);
    request.raw.res.once('finish', end);

    const pipeline = internals.buildPipeline(response, source);
    pipeline.pipe(request.raw.res);
};

internals.createPayloadEndHandler = function (request, response, source, callback) {

    return Hoek.once((err, event) => {

        source.removeListener('error', arguments.callee);

        request.raw.req.removeListener('aborted', arguments.callee);
        request.raw.req.removeListener('close', arguments.callee);
        request.raw.res.removeListener('close', arguments.callee);
        request.raw.res.removeListener('error', arguments.callee);
        request.raw.res.removeListener('finish', arguments.callee);

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
    });
};

internals.buildPipeline = function (response, source) {

    let stream = source;

    const tap = response._tap();
    if (tap) {
        stream = stream.pipe(tap);
    }

    if (response._compressor) {
        stream = stream.pipe(response._compressor);
    }

    if (response._ranger) {
        stream = stream.pipe(response._ranger);
    }

    return stream;
};

// ============================================================================
// Header Writing
// ============================================================================

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
        for (let i = headers.length - 1; i >= 0; --i) {
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

// ============================================================================
// Empty Stream
// ============================================================================

internals.Empty = function () {

    Stream.Readable.call(this);
};

Hoek.inherits(internals.Empty, Stream.Readable);

internals.Empty.prototype._read = function () {

    this.push(null);
};

// ============================================================================
// Cache Control
// ============================================================================

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
        internals.setCacheControl(response, request);
    }
    else if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};

internals.setCacheControl = function (response, request) {

    const ttl = response.settings.ttl !== null ? response.settings.ttl : request._route._cache.ttl();
    const privacy = request.auth.isAuthenticated || response.headers['set-cookie'] ? 'private' : (request.route.settings.cache.privacy || 'default');
    const privacySuffix = privacy !== 'default' ? ', ' + privacy : '';

    response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + privacySuffix);
};

// ============================================================================
// Content Type
// ============================================================================

internals.content = function (response, postMarshal) {

    let type = response.headers['content-type'];

    if (!type) {
        internals.setDefaultContentType(response);
        return;
    }

    internals.applyCharset(response, type, postMarshal);
};

internals.setDefaultContentType = function (response) {

    if (!response._contentType) {
        return;
    }

    const charset = response.settings.charset && response._contentType !== 'application/octet-stream'
        ? '; charset=' + response.settings.charset
        : '';

    response.type(response._contentType + charset);
};

internals.applyCharset = function (response, type, postMarshal) {

    type = type.trim();

    if ((!response._contentType || !postMarshal) &&
        response.settings.charset &&
        type.match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/)) {

        if (!type.match(/; *charset=/)) {
            const semi = type[type.length - 1] === ';';
            response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
        }
    }
};

// ============================================================================
// State Management
// ============================================================================

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

    const keys = Object.keys(request.connection.states.cookies);
    Items.parallel(keys, (name, nextKey) => {

        internals.processStateAutoValue(request, name, names, states, nextKey);

    }, (err) => {

        if (err) {
            return next(Boom.boomify(err));
        }

        if (!states.length) {
            return next();
        }

        internals.formatAndSetStates(response, request, states, next);
    });
};

internals.processStateAutoValue = function (request, name, names, states, callback) {

    const autoValue = request.connection.states.cookies[name].autoValue;

    if (!autoValue || names[name]) {
        return callback();
    }

    names[name] = true;

    if (typeof autoValue !== 'function') {
        states.