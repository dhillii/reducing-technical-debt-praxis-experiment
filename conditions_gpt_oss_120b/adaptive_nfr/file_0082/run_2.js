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
 * Determines if the response should be treated as an empty response.
 * @param {number} length
 * @param {object} response
 * @param {object} request
 * @returns {boolean}
 */
function isEmptyResponse(length, response, request) {
    return length === 0 &&
        response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204;
}

/**
 * Determines if range handling should be attempted.
 * @param {object} request
 * @param {object} response
 * @param {number} length
 * @param {string|null} encoding
 * @returns {boolean}
 */
function shouldHandleRange(request, response, length, encoding) {
    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !encoding;
}

/**
 * Determines if the request contains a valid Range header.
 * @param {object} request
 * @returns {boolean}
 */
function hasRangeHeader(request) {
    return !!request.headers.range;
}

/**
 * Determines if the If-Range condition is satisfied.
 * @param {object} request
 * @param {object} response
 * @returns {boolean}
 */
function isIfRangeValid(request, response) {
    return !request.headers['if-range'] ||
        request.headers['if-range'] === response.headers.etag;
}

/**
 * Handles range processing and returns a ranger stream or an error.
 * @param {object} request
 * @param {object} response
 * @param {number} length
 * @param {string|null} encoding
 * @returns {null|object|Error}
 */
function handleRange(request, response, length, encoding) {
    if (!shouldHandleRange(request, response, length, encoding)) {
        return null;
    }

    if (!hasRangeHeader(request)) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (!isIfRangeValid(request, response)) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const err = Boom.rangeNotSatisfiable();
        err.output.headers['content-range'] = 'bytes */' + length;
        return err;
    }

    if (ranges.length === 1) {
        const range = ranges[0];
        const ranger = new Ammo.Stream(range);
        response.code(206);
        response.bytes(range.to - range.from + 1);
        response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
        response._header('accept-ranges', 'bytes');
        return ranger;
    }

    response._header('accept-ranges', 'bytes');
    return null;
}

/**
 * Determines if compression should be applied.
 * @param {string|null} encoding
 * @param {number} length
 * @param {object} response
 * @returns {boolean}
 */
function shouldCompress(encoding, length, response) {
    return encoding &&
        length !== 0 &&
        response.statusCode !== 206 &&
        response._isPayloadSupported();
}

/**
 * Sets up compression and returns a compressor stream if applicable.
 * @param {string|null} encoding
 * @param {number} length
 * @param {object} response
 * @param {object} request
 * @returns {null|object}
 */
function handleCompression(encoding, length, response, request) {
    if (!shouldCompress(encoding, length, response)) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return request.connection._compression.encoder(request, encoding);
}

/**
 * Determines if the ETag should be varied based on content encoding.
 * @param {object} response
 * @param {string|null} encoding
 * @returns {boolean}
 */
function shouldVaryEtag(response, encoding) {
    return (response.headers['content-encoding'] || encoding) &&
        response.headers.etag &&
        response.settings.varyEtag;
}

/**
 * Adjusts the ETag header to include content encoding information.
 * @param {object} response
 * @param {string|null} encoding
 */
function adjustVaryEtag(response, encoding) {
    if (!shouldVaryEtag(response, encoding)) {
        return;
    }

    response.headers.etag = response.headers.etag.slice(0, -1) +
        '-' + (response.headers['content-encoding'] || encoding) + '"';
}

/**
 * Determines if a connection: close header should be sent.
 * @param {boolean} isInjection
 * @param {object} request
 * @returns {boolean}
 */
function shouldCloseConnection(isInjection, request) {
    return !(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended);
}

/**
 * Adds injection-specific headers to the raw response.
 * @param {object} request
 * @param {object} response
 */
function setInjectionHeaders(request, response) {
    request.raw.res._hapi = { request };
    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
}

/**
 * Transmit the response to the client.
 * @param {object} response
 * @param {function} callback
 */
internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    if (isEmptyResponse(length, response, request)) {
        response.code(204);
        delete response.headers['content-length'];
    }

    const encoding = request.connection._compression.encoding(response);

    const ranger = handleRange(request, response, length, encoding);
    if (ranger instanceof Error) {
        return internals.fail(request, ranger, callback);
    }

    const compressor = handleCompression(encoding, length, response, request);
    adjustVaryEtag(response, encoding);

    const isInjection = Shot.isInjection(request.raw.req);
    if (shouldCloseConnection(isInjection, request)) {
        response._header('connection', 'close');
    }

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    if (isInjection) {
        setInjectionHeaders(request, response);
    }

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

    const policy = request.route.settings.cache &&
        request._route._cache &&
        (request.route.settings.cache._statuses[response.statusCode] || (response.statusCode === 304 && request.route.settings.cache._statuses['200']));

    if (policy ||
        response.settings.ttl) {

        const ttl = (response.settings.ttl !== null ? response.settings.ttl : request._route._cache.ttl());
        const privacy = (request.auth.isAuthenticated || response.headers['set-cookie'] ? 'private' : request.route.settings.cache.privacy || 'default');
        response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + (privacy !== 'default' ? ', ' + privacy : ''));
    }
    else if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};


internals.content = function (response, postMarshal) {

    let type = response.headers['content-type'];
    if (!type) {
        if (response._contentType) {
            const charset = (response.settings.charset && response._contentType !== 'application/octet-stream' ? '; charset=' + response.settings.charset : '');
            response.type(response._contentType + charset);
        }
    }
    else {
        type = type.trim();
        if ((!response._contentType || !postMarshal) &&
            response.settings.charset &&
            type.match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/)) {

            if (!type.match(/; *charset=/)) {
                const semi = (type[type.length - 1] === ';');
                response.type(type + (semi ? ' ' : '; ') + 'charset=' + (response.settings.charset));
            }
        }
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

    // Set headers from reply.entity()

    if (request._entity.etag &&
        !response.headers.etag) {

        response.etag(request._entity.etag, { vary: request._entity.vary });
    }

    if (request._entity.modified &&
        !response.headers['last-modified']) {

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
            request._states = {};                                           // Clear broken state
            return next(err);
        }

        internals.cache(response);

        if (!response._isPayloadSupported() &&
            request.method !== 'head') {

            // Set empty stream

            response._close();                                  // Close unused file streams
            response._payload = new internals.Empty();
            delete response.headers['content-length'];
            return Auth.response(request, next);                // Must be last in case requires access to headers
        }

        response._marshal((err) => {

            if (err) {
                return next(Boom.boomify(err));
            }

            if (request.jsonp &&
                response._payload.jsonp) {

                response._header('content-type', 'text/javascript' + (response.settings.charset ? '; charset=' + response.settings.charset : ''));
                response._header('x-content-type-options', 'nosniff');
                response._payload.jsonp(request.jsonp);
            }

            if (response._payload.size &&
                typeof response._payload.size === 'function') {

                response._header('content-length', response._payload.size(), { override: false });
            }

            if (!response._isPayloadSupported()) {
                response._close();                              // Close unused file streams
                response._payload = new internals.Empty();      // Set empty stream
            }

            internals.content(response, true);
            return Auth.response(request, next);               // Must be last in case requires access to headers
        });
    });
};


internals.fail = function (request, boom, callback) {

    const error = boom.output;
    const response = new Response(error.payload, request);
    response._error = boom;
    response.code(error.statusCode);
    response.headers = Hoek.clone(error.headers);           // Prevent source from being modified
    request.response = response;                            // Not using request._setResponse() to avoid double log

    internals.marshal(request, (err) => {

        if (err) {

            // Failed to marshal an error - replace with minimal representation of original error

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