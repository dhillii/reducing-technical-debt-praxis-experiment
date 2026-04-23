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
 * @param {Object} request
 * @param {Function} callback
 */
exports.send = function (request, callback) {
    const response = request.response;

    if (isBoom(response)) {
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
 * @param {Object} request
 * @param {Function} next
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
            request._states = {};
            return next(err);
        }

        internals.cache(response);

        if (shouldReplaceWithEmptyStream(response, request)) {
            response._close();
            response._payload = new internals.Empty();
            delete response.headers['content-length'];
            return Auth.response(request, next);
        }

        response._marshal((err) => {
            if (err) {
                return next(Boom.boomify(err));
            }

            handleJsonp(request, response);
            setContentLengthIfFunction(response);
            maybeReplaceWithEmptyStream(response);
            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};

/**
 * Handles failure responses.
 * @param {Object} request
 * @param {Object} boom
 * @param {Function} callback
 */
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
 * Transmits a response to the client.
 * @param {Object} response
 * @param {Function} callback
 */
internals.transmit = function (response, callback) {
    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10) || 0;

    handleEmptyResponse(response, request, length);
    const encoding = request.connection._compression.encoding(response);
    const ranger = handleRange(request, response, length, encoding);
    const compressor = handleCompression(request, response, length, encoding);
    adjustVaryEtag(response);
    maybeCloseConnection(request, response);
    const writeError = internals.writeHead(response);
    if (writeError) {
        return Hoek.nextTick(callback)(writeError);
    }

    handleInjection(request, response);
    setupPayloadListeners(request, source, callback);
    pipeThroughTransforms(source, compressor, ranger, request);
};

/**
 * Writes response headers.
 * @param {Object} response
 * @returns {Error|null}
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
    } catch (err) {
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
    } catch (err) {
        return Boom.boomify(err);
    }

    return null;
};

internals.Empty = function () {
    Stream.Readable.call(this);
};
Hoek.inherits(internals.Empty, Stream.Readable);
internals.Empty.prototype._read = function () {
    this.push(null);
};

/**
 * Caches response headers.
 * @param {Object} response
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
        const privacy = computePrivacy(request, response);
        response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + (privacy !== 'default' ? ', ' + privacy : ''));
    } else if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};

/**
 * Adjusts content-type and charset.
 * @param {Object} response
 * @param {boolean} postMarshal
 */
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
    if ((!response._contentType || !postMarshal) &&
        response.settings.charset &&
        type.match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/)) {

        if (!type.match(/; *charset=/)) {
            const semi = type[type.length - 1] === ';';
            response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
        }
    }
};

/**
 * Handles state cookies.
 * @param {Object} response
 * @param {Function} next
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
        const autoValue = request.connection.states.cookies[name].autoValue;
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
 * Handles unmodified responses.
 * @param {Object} response
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

/* ---------- Helper Functions ---------- */

/**
 * @param {Object} response
 * @returns {boolean}
 */
function isBoom(response) {
    return response && response.isBoom;
}

/**
 * Determines if the response should be replaced with an empty stream.
 * @param {Object} response
 * @param {Object} request
 * @returns {boolean}
 */
function shouldReplaceWithEmptyStream(response, request) {
    return !response._isPayloadSupported() && request.method !== 'head';
}

/**
 * Handles JSONP payload modifications.
 * @param {Object} request
 * @param {Object} response
 */
function handleJsonp(request, response) {
    if (request.jsonp && response._payload.jsonp) {
        response._header('content-type', 'text/javascript' + (response.settings.charset ? '; charset=' + response.settings.charset : ''));
        response._header('x-content-type-options', 'nosniff');
        response._payload.jsonp(request.jsonp);
    }
}

/**
 * Sets Content-Length header if payload provides a size function.
 * @param {Object} response
 */
function setContentLengthIfFunction(response) {
    if (response._payload.size && typeof response._payload.size === 'function') {
        response._header('content-length', response._payload.size(), { override: false });
    }
}

/**
 * Replaces payload with empty stream when payload not supported.
 * @param {Object} response
 */
function maybeReplaceWithEmptyStream(response) {
    if (!response._isPayloadSupported()) {
        response._close();
        response._payload = new internals.Empty();
    }
}

/**
 * Handles empty 204 responses.
 * @param {Object} response
 * @param {Object} request
 * @param {number} length
 */
function handleEmptyResponse(response, request, length) {
    if (length === 0 &&
        response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204) {

        response.code(204);
        delete response.headers['content-length'];
    }
}

/**
 * Determines if range handling should be applied.
 * @param {Object} request
 * @param {Object} response
 * @param {number} length
 * @param {string|null} encoding
 * @returns {Object|null} Ranger stream or null
 */
function handleRange(request, response, length, encoding) {
    if (!isRangeApplicable(request, response, length, encoding)) {
        return null;
    }

    const rangeHeader = request.headers.range;
    if (!rangeHeader) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (!isIfRangeValid(request, response)) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranges = Ammo.header(rangeHeader, length);
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
    response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
    response._header('accept-ranges', 'bytes');
    return ranger;
}

/**
 * Checks if range processing is applicable.
 * @param {Object} request
 * @param {Object} response
 * @param {number} length
 * @param {string|null} encoding
 * @returns {boolean}
 */
function isRangeApplicable(request, response, length, encoding) {
    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !encoding;
}

/**
 * Validates If-Range header.
 * @param {Object} request
 * @param {Object} response
 * @returns {boolean}
 */
function isIfRangeValid(request, response) {
    const ifRange = request.headers['if-range'];
    return !ifRange || ifRange === response.headers.etag;
}

/**
 * Handles compression setup.
 * @param {Object} request
 * @param {Object} response
 * @param {number} length
 * @param {string|null} encoding
 * @returns {Object|null} Compressor stream or null
 */
function handleCompression(request, response, length, encoding) {
    if (!isCompressionApplicable(encoding, length, response)) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return request.connection._compression.encoder(request, encoding);
}

/**
 * Checks if compression should be applied.
 * @param {string|null} encoding
 * @param {number} length
 * @param {Object} response
 * @returns {boolean}
 */
function isCompressionApplicable(encoding, length, response) {
    return encoding &&
        length !== 0 &&
        response.statusCode !== 206 &&
        response._isPayloadSupported();
}

/**
 * Adjusts ETag when varying by content-encoding.
 * @param {Object} response
 */
function adjustVaryEtag(response) {
    if ((response.headers['content-encoding'] || response.headers['content-encoding']) &&
        response.headers.etag &&
        response.settings.varyEtag) {

        const suffix = '-' + (response.headers['content-encoding'] || response.headers['content-encoding']) + '"';
        response.headers.etag = response.headers.etag.slice(0, -1) + suffix;
    }
}

/**
 * Determines if connection should be closed.
 * @param {Object} request
 * @param {Object} response
 */
function maybeCloseConnection(request, response) {
    const isInjection = Shot.isInjection(request.raw.req);
    const shouldClose = !(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended);
    if (shouldClose) {
        response._header('connection', 'close');
    }
}

/**
 * Handles injection-specific response modifications.
 * @param {Object} request
 * @param {Object} response
 */
function handleInjection(request, response) {
    if (!Shot.isInjection(request.raw.req)) {
        return;
    }

    request.raw.res._hapi = { request };
    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
}

/**
 * Sets up listeners for payload events.
 * @param {Object} request
 * @param {Stream} source
 * @param {Function} callback
 */
function setupPayloadListeners(request, source, callback) {
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
}

/**
 * Pipes source through optional compressor and ranger before sending.
 * @param {Stream} source
 * @param {Object|null} compressor
 * @param {Object|null} ranger
 * @param {Object} request
 */
function pipeThroughTransforms(source, compressor, ranger, request) {
    const tap = request.response._tap();
    const preview = tap ? source.pipe(tap) : source;
    const compressed = compressor ? preview.pipe(compressor) : preview;
    const ranged = ranger ? compressed.pipe(ranger) : compressed;
    ranged.pipe(request.raw.res);
}

/**
 * Computes privacy directive for cache-control.
 * @param {Object} request
 * @param {Object} response
 * @returns {string}
 */
function computePrivacy(request, response) {
    if (request.auth.isAuthenticated || response.headers['set-cookie']) {
        return 'private';
    }
    return request.route.settings.cache.privacy || 'default';
}