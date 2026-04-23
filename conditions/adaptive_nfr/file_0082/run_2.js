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


/**
 * Determines if response should have empty status code
 */
internals.shouldUseEmptyStatusCode = function (response, request) {

    return response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204;
};


/**
 * Determines if range request should be processed
 */
internals.shouldProcessRange = function (request, response, length, encoding) {

    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !encoding;
};


/**
 * Determines if If-Range condition is satisfied
 */
internals.isIfRangeSatisfied = function (request, response) {

    return !request.headers['if-range'] ||
        request.headers['if-range'] === response.headers.etag;
};


/**
 * Processes range request and returns ranger stream
 */
internals.processRangeRequest = function (request, response, length) {

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
        throw error;
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
 * Determines if compression should be applied
 */
internals.shouldCompress = function (encoding, length, response) {

    return encoding &&
        length !== 0 &&
        response.statusCode !== 206 &&
        response._isPayloadSupported();
};


/**
 * Determines if connection should be closed
 */
internals.shouldCloseConnection = function (request, isInjection) {

    if (isInjection || request.connection._started) {
        if (request._isPayloadPending && !request.raw.req._readableState.ended) {
            return true;
        }
        return false;
    }

    return true;
};


internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    if (length === 0 && internals.shouldUseEmptyStatusCode(response, request)) {
        response.code(204);
        delete response.headers['content-length'];
    }

    const encoding = request.connection._compression.encoding(response);

    let ranger = null;
    if (internals.shouldProcessRange(request, response, length, encoding)) {
        response._header('accept-ranges', 'bytes');
        try {
            ranger = internals.processRangeRequest(request, response, length);
        }
        catch (err) {
            return internals.fail(request, err, callback);
        }
    }

    let compressor = null;
    if (internals.shouldCompress(encoding, length, response)) {
        delete response.headers['content-length'];
        response._header('content-encoding', encoding);
        compressor = request.connection._compression.encoder(request, encoding);
    }

    if ((response.headers['content-encoding'] || encoding) &&
        response.headers.etag &&
        response.settings.varyEtag) {

        response.headers.etag = response.headers.etag.slice(0, -1) + '-' + (response.headers['content-encoding'] || encoding) + '"';
    }

    const isInjection = Shot.isInjection(request.raw.req);
    if (internals.shouldCloseConnection(request, isInjection)) {
        response._header('connection', 'close');
    }

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    if (isInjection) {
        request.raw.res._hapi = { request };

        if (response.variety === 'plain') {
            request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
        }
    }

    internals.pipePayload(source, request, response, compressor, ranger, callback);
};


/**
 * Handles payload piping and event management
 */
internals.pipePayload = function (source, request, response, compressor, ranger, callback) {

    const end = Hoek.once((err, event) => {

        source.removeListener('error', end);
        request.raw.req.removeListener('aborted', onAborted);
        request.raw.req.removeListener('close', onClose);
        request.raw.res.removeListener('close', onClose);
        request.raw.res.removeListener('error', end);
        request.raw.res.removeListener('finish', end);

        internals.handlePayloadEnd(err, event, request, response, source);
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
    const preview = (tap ? source.pipe(tap) : source);
    const compressed = (compressor ? preview.pipe(compressor) : preview);
    const ranged = (ranger ? compressed.pipe(ranger) : compressed);
    ranged.pipe(request.raw.res);
};


/**
 * Handles cleanup and logging after payload transmission
 */
internals.handlePayloadEnd = function (err, event, request, response, source) {

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


/**
 * Determines if cache policy applies
 */
internals.hasCachePolicy = function (request, response) {

    return request.route.settings.cache &&
        request._route._cache &&
        (request.route.settings.cache._statuses[response.statusCode] ||
         (response.statusCode === 304 && request.route.settings.cache._statuses['200']));
};


/**
 * Determines if TTL should be applied
 */
internals.shouldApplyTtl = function (response) {

    return response.settings.ttl !== null || response.settings.ttl !== undefined;
};


/**
 * Determines cache privacy level
 */
internals.getCachePrivacy = function (request, response) {

    if (request.auth.isAuthenticated || response.headers['set-cookie']) {
        return 'private';
    }

    return request.route.settings.cache.privacy || 'default';
};


internals.cache = function (response) {

    const request = response.request;

    if (response.headers['cache-control']) {
        return;
    }

    const hasPolicy = internals.hasCachePolicy(request, response);
    const hasTtl = response.settings.ttl !== null;

    if (hasPolicy || hasTtl) {
        const ttl = (hasTtl ? response.settings.ttl : request._route._cache.ttl());
        const privacy = internals.getCachePrivacy(request, response);
        const privacySuffix = (privacy !== 'default' ? ', ' + privacy : '');
        response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + privacySuffix);
        return;
    }

    if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};


/**
 * Determines if charset should be added to content-type
 */
internals.shouldAddCharset = function (response, type, postMarshal) {

    return response.settings.charset &&
        (!response._contentType || !postMarshal) &&
        type.match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/);
};


/**
 * Determines if charset is already present
 */
internals.hasCharset = function (type) {

    return type.match(/; *charset=/);
};


internals.content = function (response, postMarshal) {

    let type = response.headers['content-type'];
    if (!type) {
        if (response._contentType) {
            const charset = (response.settings.charset && response._contentType !== 'application/octet-stream' ? '; charset=' + response.settings.charset : '');
            response.type(response._contentType + charset);
        }
        return;
    }

    type = type.trim();
    if (!internals.shouldAddCharset(response, type, postMarshal)) {
        return;
    }

    if (internals.hasCharset(type)) {
        return;
    }

    const semi = (type[type.length - 1] === ';');
    response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
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


/**
 * Determines if entity etag should be set
 */
internals.shouldSetEntityEtag = function (request, response) {

    return request._entity.etag && !response.headers.etag;
};


/**
 * Determines if entity modified should be set
 */
internals.shouldSetEntityModified = function (request, response) {

    return request._entity.modified && !response.headers['last-modified'];
};


internals.unmodified = function (response) {

    const request = response.request;

    if (internals.shouldSetEntityEtag(request, response)) {
        response.etag(request._entity.etag, { vary: request._entity.vary });
    }

    if (internals.shouldSetEntityModified(request, response)) {
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