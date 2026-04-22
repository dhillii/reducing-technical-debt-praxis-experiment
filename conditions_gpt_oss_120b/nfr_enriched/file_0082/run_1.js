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

/**
 * Public entry point – sends a response.
 */
exports.send = function (request, callback) {

    const response = request.response;

    if (response.isBoom) {
        return internals.handleBoom(request, response, callback);
    }

    internals.marshal(request, (err) => {

        if (err) {
            request._setResponse(err);
            return internals.handleBoom(request, err, callback);
        }

        internals.transmit(response, (err) => {

            if (err) {
                request._setResponse(err);
                return internals.handleBoom(request, err, callback);
            }

            return callback();
        });
    });
};

/**
 * Handles Boom errors (both original and marshaling failures).
 */
internals.handleBoom = function (request, boom, callback) {

    const error = boom.output;
    const response = new Response(error.payload, request);
    response._error = boom;
    response.code(error.statusCode);
    response.headers = Hoek.clone(error.headers);
    request.response = response;                     // Avoid double logging

    internals.marshal(request, (marshalErr) => {

        if (marshalErr) {
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
 * Prepares the response (headers, state, cache, etc.).
 */
internals.marshal = function (request, next) {

    const response = request.response;

    Cors.headers(response);
    internals.setContentType(response, false);
    Security.headers(response);
    internals.unmodified(response);

    internals.applyState(response, (stateErr) => {

        if (stateErr) {
            request._log(['state', 'response', 'error'], stateErr);
            request._states = {};                     // Clear broken state
            return next(stateErr);
        }

        internals.cache(response);
        internals.handleUnsupportedPayload(request, response, next);
    });
};

/**
 * Handles cases where the payload is not supported.
 */
internals.handleUnsupportedPayload = function (request, response, next) {

    const unsupported = !response._isPayloadSupported() && request.method !== 'head';

    if (!unsupported) {
        return internals.finalizeMarshal(request, response, next);
    }

    // Empty stream for unsupported payloads
    response._close();
    response._payload = new internals.Empty();
    delete response.headers['content-length'];
    return Auth.response(request, next);            // Must be last
};

/**
 * Completes marshaling after payload checks.
 */
internals.finalizeMarshal = function (request, response, next) {

    response._marshal((err) => {

        if (err) {
            return next(Boom.boomify(err));
        }

        internals.applyJsonp(request, response);
        internals.applyContentLength(response);
        internals.ensureEmptyPayload(response);
        internals.setContentType(response, true);
        return Auth.response(request, next);        // Must be last
    });
};

/**
 * Adds JSONP wrapper when needed.
 */
internals.applyJsonp = function (request, response) {

    if (request.jsonp && response._payload.jsonp) {
        response._header('content-type', 'text/javascript' + (response.settings.charset ? '; charset=' + response.settings.charset : ''));
        response._header('x-content-type-options', 'nosniff');
        response._payload.jsonp(request.jsonp);
    }
};

/**
 * Sets the Content‑Length header if the payload provides a size function.
 */
internals.applyContentLength = function (response) {

    if (response._payload.size && typeof response._payload.size === 'function') {
        response._header('content-length', response._payload.size(), { override: false });
    }
};

/**
 * Replaces unsupported payloads with an empty stream.
 */
internals.ensureEmptyPayload = function (response) {

    if (!response._isPayloadSupported()) {
        response._close();
        response._payload = new internals.Empty();
    }
};

/**
 * Sends the response over the network.
 */
internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10) || 0;

    internals.adjustEmptyStatus(request, response, length);
    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.setupRange(request, response, length, encoding);
    const compressor = internals.setupCompression(request, response, length, encoding);
    internals.adjustVaryEtag(response, encoding);
    internals.maybeCloseConnection(request, response);

    const headError = internals.writeHead(response);
    if (headError) {
        return Hoek.nextTick(callback)(headError);
    }

    internals.handleInjection(request, response);
    internals.pipeResponse(source, request, response, ranger, compressor, callback);
};

/**
 * Adjusts status code for empty responses.
 */
internals.adjustEmptyStatus = function (request, response, length) {

    if (length === 0 &&
        response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204) {

        response.code(204);
        delete response.headers['content-length'];
    }
};

/**
 * Configures range handling if applicable.
 */
internals.setupRange = function (request, response, length, encoding) {

    if (!request.route.settings.response.ranges ||
        request.method !== 'get' ||
        response.statusCode !== 200 ||
        length <= 0 ||
        encoding) {

        response._header('accept-ranges', 'bytes');
        return null;
    }

    const rangeHeader = request.headers.range;
    if (!rangeHeader) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    // If‑Range validation
    if (request.headers['if-range'] && request.headers['if-range'] !== response.headers.etag) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranges = Ammo.header(rangeHeader, length);
    if (!ranges) {
        const err = Boom.rangeNotSatisfiable();
        err.output.headers['content-range'] = 'bytes */' + length;
        internals.handleBoom(request, err, () => { });
        return null;
    }

    if (ranges.length === 1) {
        const range = ranges[0];
        response.code(206);
        response.bytes(range.to - range.from + 1);
        response._header('content-range', `bytes ${range.from}-${range.to}/${length}`);
        return new Ammo.Stream(range);
    }

    response._header('accept-ranges', 'bytes');
    return null;
};

/**
 * Configures compression if applicable.
 */
internals.setupCompression = function (request, response, length, encoding) {

    if (!encoding ||
        length === 0 ||
        response.statusCode === 206 ||
        !response._isPayloadSupported()) {

        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return request.connection._compression.encoder(request, encoding);
};

/**
 * Adjusts ETag when content‑encoding varies.
 */
internals.adjustVaryEtag = function (response, encoding) {

    if ((response.headers['content-encoding'] || encoding) &&
        response.headers.etag &&
        response.settings.varyEtag) {

        response.headers.etag = response.headers.etag.slice(0, -1) + '-' + (response.headers['content-encoding'] || encoding) + '"';
    }
};

/**
 * Adds a Connection: close header when needed.
 */
internals.maybeCloseConnection = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    if (!(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended)) {

        response._header('connection', 'close');
    }
};

/**
 * Handles injection‑specific response tweaks.
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
 * Pipes the payload through optional transforms and writes to the raw response.
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

        const tags = err ? ['response', 'error'] : (event ? ['response', 'error', event] : ['response']);
        request._log(tags, err);
        return callback();
    });

    const onAborted = () => end(null, 'aborted');
    const onClose = () => end(null, 'close');

    source.once('error', end);
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
 * Writes response headers to the raw response.
 */
internals.writeHead = function (response) {

    const res = response.request.raw.res;
    const headerNames = Object.keys(response.headers);
    let i = 0;

    try {
        for (; i < headerNames.length; ++i) {
            const name = headerNames[i];
            const value = response.headers[name];
            if (value !== undefined) {
                res.setHeader(name, value);
            }
        }
    }
    catch (err) {
        for (let j = i - 1; j >= 0; --j) {
            res.setHeader(headerNames[j], null);
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
 * Empty readable stream used for unsupported payloads.
 */
internals.Empty = function () {
    Stream.Readable.call(this);
};
Hoek.inherits(internals.Empty, Stream.Readable);
internals.Empty.prototype._read = function () {
    this.push(null);
};

/**
 * Adds cache‑control header when appropriate.
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
        const privacy = (request.auth.isAuthenticated || response.headers['set-cookie'])
            ? 'private'
            : request.route.settings.cache.privacy || 'default';

        response._header('cache-control',
            `max-age=${Math.floor(ttl / 1000)}, must-revalidate${privacy !== 'default' ? ', ' + privacy : ''}`);
    }
    else if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};

/**
 * Sets or adjusts the Content‑Type header.
 */
internals.setContentType = function (response, postMarshal) {

    let type = response.headers['content-type'];
    if (!type) {
        if (response._contentType) {
            const charset = (response.settings.charset && response._contentType !== 'application/octet-stream')
                ? '; charset=' + response.settings.charset
                : '';
            response.type(response._contentType + charset);
        }
        return;
    }

    type = type.trim();

    if ((!response._contentType || !postMarshal) &&
        response.settings.charset &&
        /^(?:text\/|application\/(?:json|javascript))/.test(type) &&
        !/; *charset=/.test(type)) {

        const semi = type.endsWith(';');
        response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
    }
};

/**
 * Applies state (cookies) to the response.
 */
internals.applyState = function (response, next) {

    const request = response.request;
    const names = {};
    const states = [];

    // Existing states
    Object.keys(request._states).forEach((name) => {
        names[name] = true;
        states.push(request._states[name]);
    });

    const processCookie = (name, done) => {

        const cookie = request.connection.states.cookies[name];
        const autoValue = cookie.autoValue;

        if (!autoValue || names[name]) {
            return done();
        }

        names[name] = true;

        if (typeof autoValue !== 'function') {
            states.push({ name, value: autoValue });
            return done();
        }

        autoValue(request, (err, value) => {
            if (err) {
                return done(err);
            }
            states.push({ name, value });
            done();
        });
    };

    const cookieNames = Object.keys(request.connection.states.cookies);
    Items.parallel(cookieNames, processCookie, (err) => {

        if (err) {
            return next(Boom.boomify(err));
        }

        if (!states.length) {
            return next();
        }

        request.connection.states.format(states, (fmtErr, header) => {
            if (fmtErr) {
                return next(Boom.boomify(fmtErr));
            }

            const existing = response.headers['set-cookie'];
            if (existing) {
                header = (Array.isArray(existing) ? existing : [existing]).concat(header);
            }
            response._header('set-cookie', header);
            next();
        });
    });
};

/**
 * Handles conditional responses (ETag / Last‑Modified).
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
```