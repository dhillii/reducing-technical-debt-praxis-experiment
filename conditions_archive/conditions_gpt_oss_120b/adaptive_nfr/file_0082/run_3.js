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
 * Send response handling.
 */
exports.send = function (request, callback) {

    const response = request.response;
    if (response.isBoom) {
        return internals.fail(request, response, callback);
    }

    return internals.marshal(request, (err) => {

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

/**
 * Marshal response before transmission.
 */
internals.marshal = function (request, next) {

    const response = request.response;

    Cors.headers(response);
    internals.content(response, false);
    Security.headers(response);
    internals.unmodified(response);

    return internals.state(response, (stateErr) => {

        if (stateErr) {
            request._log(['state', 'response', 'error'], stateErr);
            request._states = {}; // Clear broken state
            return next(stateErr);
        }

        internals.cache(response);

        if (internals.isPayloadUnsupported(response) && request.method !== 'head') {
            response._close();
            response._payload = new internals.Empty();
            delete response.headers['content-length'];
            return Auth.response(request, next);
        }

        return response._marshal((marshalErr) => {

            if (marshalErr) {
                return next(Boom.boomify(marshalErr));
            }

            internals.applyJsonp(request, response);
            internals.applyContentLength(response);
            internals.finalizePayload(response);
            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};

/**
 * Apply JSONP handling if needed.
 */
internals.applyJsonp = function (request, response) {

    if (!request.jsonp) {
        return;
    }

    const payload = response._payload;
    if (!payload || typeof payload.jsonp !== 'function') {
        return;
    }

    response._header('content-type', 'text/javascript' + (response.settings.charset ? '; charset=' + response.settings.charset : ''));
    response._header('x-content-type-options', 'nosniff');
    payload.jsonp(request.jsonp);
};

/**
 * Apply content-length header if payload provides size().
 */
internals.applyContentLength = function (response) {

    const payload = response._payload;
    if (!payload || typeof payload.size !== 'function') {
        return;
    }

    response._header('content-length', payload.size(), { override: false });
};

/**
 * Ensure payload is compatible with response.
 */
internals.finalizePayload = function (response) {

    if (internals.isPayloadUnsupported(response)) {
        response._close();
        response._payload = new internals.Empty();
    }
};

/**
 * Determine if response payload is unsupported.
 */
internals.isPayloadUnsupported = function (response) {

    return !response._isPayloadSupported();
};

/**
 * Handle error responses.
 */
internals.fail = function (request, boom, callback) {

    const error = boom.output;
    const response = new Response(error.payload, request);
    response._error = boom;
    response.code(error.statusCode);
    response.headers = Hoek.clone(error.headers);
    request.response = response; // Avoid double log

    return internals.marshal(request, (marshalErr) => {

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
 * Transmit response to client.
 */
internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;

    internals.handleEmptyResponse(request, response);
    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.handleRange(request, response, encoding);
    const compressor = internals.handleCompression(request, response, encoding);
    internals.adjustVaryEtag(response, encoding);
    internals.handleConnectionClose(request, response);
    const writeError = internals.writeHead(response);
    if (writeError) {
        return Hoek.nextTick(callback)(writeError);
    }

    internals.handleInjection(request, response);
    internals.pipeResponse(source, request, response, ranger, compressor, callback);
};

/**
 * Adjust response for empty payload cases.
 */
internals.handleEmptyResponse = function (request, response) {

    const length = parseInt(response.headers['content-length'], 10);
    const emptyStatus = request.route.settings.response.emptyStatusCode;

    if (length === 0 &&
        response.statusCode === 200 &&
        emptyStatus === 204) {

        response.code(204);
        delete response.headers['content-length'];
    }
};

/**
 * Determine if compression should be applied.
 */
internals.shouldCompress = function (response, encoding, length) {

    return encoding &&
        length !== 0 &&
        response.statusCode !== 206 &&
        response._isPayloadSupported();
};

/**
 * Handle response compression.
 */
internals.handleCompression = function (request, response, encoding) {

    const length = parseInt(response.headers['content-length'], 10);
    if (!internals.shouldCompress(response, encoding, length)) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return request.connection._compression.encoder(request, encoding);
};

/**
 * Adjust ETag when content-encoding varies.
 */
internals.adjustVaryEtag = function (response, encoding) {

    if ((response.headers['content-encoding'] || encoding) &&
        response.headers.etag &&
        response.settings.varyEtag) {

        response.headers.etag = response.headers.etag.slice(0, -1) + '-' + (response.headers['content-encoding'] || encoding) + '"';
    }
};

/**
 * Determine if range handling is applicable.
 */
internals.isRangeApplicable = function (request, response, length, encoding) {

    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !encoding;
};

/**
 * Handle HTTP range requests.
 */
internals.handleRange = function (request, response, encoding) {

    const length = parseInt(response.headers['content-length'], 10);
    if (!internals.isRangeApplicable(request, response, length, encoding)) {
        return null;
    }

    if (!request.headers.range) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (request.headers['if-range'] && request.headers['if-range'] !== response.headers.etag) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        internals.fail(request, error, () => { });
        return null;
    }

    if (ranges.length !== 1) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const range = ranges[0];
    const ranger = new Ammo.Stream(range);
    response.code(206);
    response.bytes(range.to - range.from + 1);
    response._header('content-range', `bytes ${range.from}-${range.to}/${length}`);
    response._header('accept-ranges', 'bytes');
    return ranger;
};

/**
 * Set connection header to close when appropriate.
 */
internals.handleConnectionClose = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    const pending = request._isPayloadPending && !request.raw.req._readableState.ended;
    if (!(isInjection || request.connection._started) || pending) {
        response._header('connection', 'close');
    }
};

/**
 * Attach injection helpers to raw response.
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
 * Pipe source through optional transforms and send to client.
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
 * Write response headers.
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
 * Empty readable stream.
 */
internals.Empty = function () {

    Stream.Readable.call(this);
};

Hoek.inherits(internals.Empty, Stream.Readable);

internals.Empty.prototype._read = function () {

    this.push(null);
};

/**
 * Set cache-control header based on route and response settings.
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
            : (request.route.settings.cache.privacy || 'default');
        response._header('cache-control', `max-age=${Math.floor(ttl / 1000)}, must-revalidate${privacy !== 'default' ? ', ' + privacy : ''}`);
        return;
    }

    if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};

/**
 * Ensure proper content-type and charset handling.
 */
internals.content = function (response, postMarshal) {

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

    const shouldAddCharset = (!response._contentType || !postMarshal) &&
        response.settings.charset &&
        /^(?:text\/|application\/(?:json|javascript))/.test(type);

    if (shouldAddCharset && !/; *charset=/.test(type)) {
        const semi = type.endsWith(';');
        response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
    }
};

/**
 * Set state cookies on response.
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

    const each = (name, done) => {

        const cookie = request.connection.states.cookies[name];
        const autoValue = cookie && cookie.autoValue;
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
            return done();
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

        request.connection.states.format(states, (fmtErr, header) => {

            if (fmtErr) {
                return next(Boom.boomify(fmtErr));
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
 * Set ETag and Last-Modified headers based on request entity.
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