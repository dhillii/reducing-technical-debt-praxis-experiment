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
    internals.pipePayload(request, response, source, compressor, ranger, callback);
};


/**
 * Applies 204 status code for empty responses
 */
internals.applyEmptyStatusCode = function (response, length) {

    const shouldApply = length === 0 &&
        response.statusCode === 200 &&
        response.request.route.settings.response.emptyStatusCode === 204;

    if (!shouldApply) {
        return;
    }

    response.code(204);
    delete response.headers['content-length'];
};


/**
 * Sets up range request handling
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

    return internals.processRangeHeader(request, response, length, callback);
};


/**
 * Determines if request is eligible for range processing
 */
internals.isRangeRequestEligible = function (request, response, length, encoding) {

    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !encoding;
};


/**
 * Processes range header and returns ranger or false on error
 */
internals.processRangeHeader = function (request, response, length, callback) {

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

    if (ranges.length !== 1) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    return internals.createRanger(response, ranges[0], length);
};


/**
 * Validates If-Range header
 */
internals.isIfRangeValid = function (request, response) {

    if (!request.headers['if-range']) {
        return true;
    }

    return request.headers['if-range'] === response.headers.etag;
};


/**
 * Creates ranger stream for single range request
 */
internals.createRanger = function (response, range, length) {

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

    if (!internals.isCompressionApplicable(response, encoding, length)) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return request.connection._compression.encoder(request, encoding);
};


/**
 * Determines if compression should be applied
 */
internals.isCompressionApplicable = function (response, encoding, length) {

    return encoding &&
        length !== 0 &&
        response.statusCode !== 206 &&
        response._isPayloadSupported();
};


/**
 * Applies etag encoding suffix if needed
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
 * Applies connection close header if needed
 */
internals.applyConnectionClose = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    const shouldClose = !(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended);

    if (shouldClose) {
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
 * Pipes payload through transformation streams
 */
internals.pipePayload = function (request, response, source, compressor, ranger, callback) {

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

        const tags = internals.getLogTags(err, event);
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
 * Finalizes response after payload transmission
 */
internals.finalizeResponse = function (request, response, err, event) {

    if (!request.raw.res.finished && event !== 'aborted') {
        request.raw.res.end();
    }

    if (err || event) {
        request.emit('disconnect');
    }
};


/**
 * Determines log tags based on transmission result
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


internals.writeHead = function (response) {

    const res = response.request.raw.res;
    const headers = Object.keys(response.headers);
    let i = 0;

    const headerError = internals.setHeaders(res, headers, response.headers);
    if (headerError) {
        internals.undoHeaders(res, headers, i);
        return Boom.boomify(headerError);
    }

    if (response.settings.message) {
        res.statusMessage = response.settings.message;
    }

    const writeError = internals.writeStatusCode(res, response.statusCode);
    if (writeError) {
        return Boom.boomify(writeError);
    }

    return null;
};


/**
 * Sets response headers
 */
internals.setHeaders = function (res, headers, headerValues) {

    try {
        for (let i = 0; i < headers.length; ++i) {
            const header = headers[i];
            const value = headerValues[header];
            if (value !== undefined) {
                res.setHeader(header, value);
            }
        }
        return null;
    }
    catch (err) {
        return err;
    }
};


/**
 * Undoes previously set headers
 */
internals.undoHeaders = function (res, headers, count) {

    for (let i = count - 1; i >= 0; --i) {
        res.setHeader(headers[i], null);
    }
};


/**
 * Writes status code to response
 */
internals.writeStatusCode = function (res, statusCode) {

    try {
        res.writeHead(statusCode);
        return null;
    }
    catch (err) {
        return err;
    }
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
 * Determines cache policy for response
 */
internals.getCachePolicy = function (request, response) {

    if (!request.route.settings.cache || !request._route._cache) {
        return false;
    }

    const statusPolicy = request.route.settings.cache._statuses[response.statusCode];
    const notModifiedPolicy = response.statusCode === 304 && request.route.settings.cache._statuses['200'];

    return statusPolicy || notModifiedPolicy;
};


/**
 * Sets cache-control header
 */
internals.setCacheControl = function (request, response) {

    const ttl = response.settings.ttl !== null ? response.settings.ttl : request._route._cache.ttl();
    const isPrivate = request.auth.isAuthenticated || response.headers['set-cookie'];
    const privacy = isPrivate ? 'private' : (request.route.settings.cache.privacy || 'default');
    const privacySuffix = privacy !== 'default' ? ', ' + privacy : '';

    response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + privacySuffix);
};


internals.content = function (response, postMarshal) {

    let type = response.headers['content-type'];

    if (!type) {
        internals.setDefaultContentType(response);
        return;
    }

    internals.applyCharsetToContentType(response, type, postMarshal);
};


/**
 * Sets default content type if not already set
 */
internals.setDefaultContentType = function (response) {

    if (!response._contentType) {
        return;
    }

    const charset = response.settings.charset && response._contentType !== 'application/octet-stream'
        ? '; charset=' + response.settings.charset
        : '';

    response.type(response._contentType + charset);
};


/**
 * Applies charset to content type if applicable
 */
internals.applyCharsetToContentType = function (response, type, postMarshal) {

    type = type.trim();

    if (!internals.shouldApplyCharset(response, type, postMarshal)) {
        return;
    }

    if (type.match(/; *charset=/)) {
        return;
    }

    const semi = type[type.length - 1] === ';';
    response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
};


/**
 * Determines if charset should be applied to content type
 */
internals.shouldApplyCharset = function (response, type, postMarshal) {

    if (!response.settings.charset) {
        return false;
    }

    if (response._contentType && postMarshal) {
        return false;
    }

    return type.match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/);
};


internals.state = function (response, next) {

    const request = response.request;
    const names = {};
    const states = [];

    internals.collectRequestStates(request, names, states);

    const each = (name, nextKey) => {
        internals.processStateAutoValue(request, name, names, states, nextKey);
    };

    const keys = Object.keys(request.connection.states.cookies);
    Items.parallel(keys, each, (err) => {

        if (err) {
            return next(Boom.boomify(err));
        }

        if (!states.length) {
            return next();
        }

        internals.formatAndSetStates(request, response, states, next);
    });
};


/**
 * Collects states from request
 */
internals.collectRequestStates = function (request, names, states) {

    const requestStates = Object.keys(request._states);
    for (let i = 0; i < requestStates.length; ++i) {
        const stateName = requestStates[i];
        names[stateName] = true;
        states.push(request._states[stateName]);
    }
};


/**
 * Processes auto value for a state
 */
internals.processStateAutoValue = function (request, name, names, states, nextKey) {

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


/**
 * Formats states and sets set-cookie header
 */
internals.formatAndSetStates = function (request, response, states, next) {

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
};


internals.unmodified = function (response) {

    const request = response.request;

    internals.applyEntityHeaders(request, response);

    if (response.statusCode === 304) {
        return;
    }

    internals.checkUnmodified(request, response);
};


/**
 * Applies entity headers from request to response
 */
internals.applyEntityHeaders = function (request, response) {

    if (request._entity.etag && !response.headers.etag) {
        response.etag(request._entity.etag, { vary: request._entity.vary });
    }

    if (request._entity.modified && !response.headers['last-modified']) {
        response.header('last-modified', request._entity.modified);
    }
};


/**
 * Checks if response is unmodified and sets 304 status
 */
internals.checkUnmodified = function (request, response) {

    const entity = {
        etag: response.headers.etag,
        vary: response.settings.varyEtag,
        modified: response.headers['last-modified']
    };

    if (Response.unmodified(request, entity)) {
        response.code(304);
    }
};
```