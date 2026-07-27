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

        if (!response._isPayloadSupported() &&
            request.method !== 'head') {

            response._close();
            response._payload = new internals.Empty();
            delete response.headers['content-length'];
            return Auth.response(request, next);
        }

        response._marshal((err) => {

            if (err) {
                return next(Boom.boomify(err));
            }

            internals.handleJsonp(request, response);
            internals.handlePayloadSize(response);
            internals.handleUnsupportedPayload(response);

            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};


internals.handleJsonp = function (request, response) {

    if (!request.jsonp || !response._payload.jsonp) {
        return;
    }

    response._header('content-type', 'text/javascript' + (response.settings.charset ? '; charset=' + response.settings.charset : ''));
    response._header('x-content-type-options', 'nosniff');
    response._payload.jsonp(request.jsonp);
};


internals.handlePayloadSize = function (response) {

    if (!response._payload.size || typeof response._payload.size !== 'function') {
        return;
    }

    response._header('content-length', response._payload.size(), { override: false });
};


internals.handleUnsupportedPayload = function (response) {

    if (!response._isPayloadSupported()) {
        response._close();
        response._payload = new internals.Empty();
    }
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


/** @returns {boolean} True if response should be converted to 204 No Content */
internals.shouldConvertToNoContent = function (response) {

    const length = parseInt(response.headers['content-length'], 10);
    return length === 0 &&
        response.statusCode === 200 &&
        response.request.route.settings.response.emptyStatusCode === 204;
};


/** @returns {boolean} True if range requests should be processed */
internals.shouldProcessRanges = function (request, response, length, encoding) {

    return request.route.settings.response.ranges &&
        request.method === 'get' &&
        response.statusCode === 200 &&
        length > 0 &&
        !encoding;
};


/** @returns {boolean} True if If-Range condition is satisfied */
internals.isIfRangeSatisfied = function (request, response) {

    if (!request.headers['if-range']) {
        return true;
    }

    return request.headers['if-range'] === response.headers.etag;
};


/** @returns {boolean} True if compression should be applied */
internals.shouldCompress = function (response, length, encoding) {

    return encoding &&
        length !== 0 &&
        response.statusCode !== 206 &&
        response._isPayloadSupported();
};


/** @returns {boolean} True if ETag should be varied by encoding */
internals.shouldVaryEtagByEncoding = function (response, encoding) {

    return (response.headers['content-encoding'] || encoding) &&
        response.headers.etag &&
        response.settings.varyEtag;
};


/** @returns {boolean} True if connection should be closed */
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


/** @returns {object|null} Range object if valid range request, null otherwise */
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
        return error;
    }

    if (ranges.length !== 1) {
        return null;
    }

    return ranges[0];
};


/** @returns {object|null} Ranger stream if range should be applied, null otherwise */
internals.createRanger = function (request, response, length, encoding) {

    if (!internals.shouldProcessRanges(request, response, length, encoding)) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const range = internals.processRangeRequest(request, response, length);

    if (range instanceof Error) {
        return range;
    }

    if (!range) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    const ranger = new Ammo.Stream(range);
    response.code(206);
    response.bytes(range.to - range.from + 1);
    response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
    response._header('accept-ranges', 'bytes');

    return ranger;
};


/** @returns {object|null} Compressor stream if compression should be applied, null otherwise */
internals.createCompressor = function (request, response, length, encoding) {

    if (!internals.shouldCompress(response, length, encoding)) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);

    return request.connection._compression.encoder(request, encoding);
};


internals.applyEtagEncoding = function (response, encoding) {

    if (!internals.shouldVaryEtagByEncoding(response, encoding)) {
        return;
    }

    response.headers.etag = response.headers.etag.slice(0, -1) + '-' + (response.headers['content-encoding'] || encoding) + '"';
};


internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    internals.handleEmptyResponse(response);

    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.createRanger(request, response, length, encoding);

    if (ranger instanceof Error) {
        return internals.fail(request, ranger, callback);
    }

    const compressor = internals.createCompressor(request, response, length, encoding);
    internals.applyEtagEncoding(response, encoding);

    if (internals.shouldCloseConnection(request)) {
        response._header('connection', 'close');
    }

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    internals.setupInjection(request, response);
    internals.setupPayloadPipe(request, response, source, compressor, ranger, callback);
};


internals.handleEmptyResponse = function (response) {

    if (!internals.shouldConvertToNoContent(response)) {
        return;
    }

    response.code(204);
    delete response.headers['content-length'];
};


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


internals.setupPayloadPipe = function (request, response, source, compressor, ranger, callback) {

    const end = internals.createEndHandler(request, response, source, callback);

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


internals.createEndHandler = function (request, response, source, callback) {

    return Hoek.once((err, event) => {

        source.removeListener('error', arguments.callee);

        request.raw.req.removeListener('aborted', arguments.callee);
        request.raw.req.removeListener('close', arguments.callee);

        request.raw.res.removeListener('close', arguments.callee);
        request.raw.res.removeListener('error', arguments.callee);
        request.raw.res.removeListener('finish', arguments.callee);

        internals.handleEndError(request, response, source, err);
        internals.finalizeResponse(request, err, event);

        const tags = (err ? ['response', 'error'] : (event ? ['response', 'error', event] : ['response']));
        request._log(tags, err);
        return callback();
    });
};


internals.handleEndError = function (request, response, source, err) {

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


internals.finalizeResponse = function (request, err, event) {

    if (!request.raw.res.finished && event !== 'aborted') {
        request.raw.res.end();
    }

    if (event || err) {
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