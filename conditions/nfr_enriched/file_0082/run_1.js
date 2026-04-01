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

        if (!response._isPayloadSupported() && request.method !== 'head') {
            return internals.handleEmptyPayload(response, request, next);
        }

        response._marshal((err) => {

            if (err) {
                return next(Boom.boomify(err));
            }

            internals.applyJsonpHeaders(response, request);
            internals.applyContentLength(response);
            internals.handleUnsupportedPayload(response);
            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};


// Handle response with empty payload
internals.handleEmptyPayload = function (response, request, next) {

    response._close();
    response._payload = new internals.Empty();
    delete response.headers['content-length'];
    return Auth.response(request, next);
};


// Apply JSONP headers if applicable
internals.applyJsonpHeaders = function (response, request) {

    if (request.jsonp && response._payload.jsonp) {
        response._header('content-type', 'text/javascript' + (response.settings.charset ? '; charset=' + response.settings.charset : ''));
        response._header('x-content-type-options', 'nosniff');
        response._payload.jsonp(request.jsonp);
    }
};


// Apply content-length header if payload size is available
internals.applyContentLength = function (response) {

    if (response._payload.size && typeof response._payload.size === 'function') {
        response._header('content-length', response._payload.size(), { override: false });
    }
};


// Handle unsupported payload by replacing with empty stream
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


internals.transmit = function (response, callback) {

    const request = response.request;
    const source = response._payload;
    const length = parseInt(response.headers['content-length'], 10);

    internals.adjustEmptyResponse(response, length);

    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.setupRangeRequest(request, response, length, encoding);
    const compressor = internals.setupCompression(request, response, encoding, length);

    internals.adjustEtagForEncoding(response, encoding);
    internals.setupConnectionHeader(request, response);

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    internals.setupInjection(request, response);
    internals.pipePayload(request, response, source, ranger, compressor, callback);
};


// Adjust status code to 204 for empty successful responses
internals.adjustEmptyResponse = function (response, length) {

    if (length === 0 && response.statusCode === 200 && response.request.route.settings.response.emptyStatusCode === 204) {
        response.code(204);
        delete response.headers['content-length'];
    }
};


// Setup range request handling
internals.setupRangeRequest = function (request, response, length, encoding) {

    if (!request.route.settings.response.ranges || request.method !== 'get' || response.statusCode !== 200 || length === 0 || encoding) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    if (!request.headers.range) {
        response._header('accept-ranges', 'bytes');
        return null;
    }

    return internals.processRangeHeader(request, response, length);
};


// Process Range header and return ranger stream
internals.processRangeHeader = function (request, response, length) {

    if (request.headers['if-range'] && request.headers['if-range'] !== response.headers.etag) {
        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        const error = Boom.rangeNotSatisfiable();
        error.output.headers['content-range'] = 'bytes */' + length;
        return internals.fail(request, error, () => {});
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


// Setup compression if applicable
internals.setupCompression = function (request, response, encoding, length) {

    if (!encoding || length === 0 || response.statusCode === 206 || !response._isPayloadSupported()) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return request.connection._compression.encoder(request, encoding);
};


// Adjust etag to vary by encoding
internals.adjustEtagForEncoding = function (response, encoding) {

    if ((response.headers['content-encoding'] || encoding) && response.headers.etag && response.settings.varyEtag) {
        const contentEncoding = response.headers['content-encoding'] || encoding;
        response.headers.etag = response.headers.etag.slice(0, -1) + '-' + contentEncoding + '"';
    }
};


// Setup connection header for non-injection or pending requests
internals.setupConnectionHeader = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);
    if (!(isInjection || request.connection._started) || (request._isPayloadPending && !request.raw.req._readableState.ended)) {
        response._header('connection', 'close');
    }
};


// Setup injection metadata
internals.setupInjection = function (request, response) {

    if (!Shot.isInjection(request.raw.req)) {
        return;
    }

    request.raw.res._hapi = { request };

    if (response.variety === 'plain') {
        request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
    }
};


// Pipe payload through transformations and to response
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


// Create handler for payload transmission end
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

        const tags = (err ? ['response', 'error'] : (event ? ['response', 'error', event] : ['response']));
        request._log(tags, err);
        return callback();
    });
};


// Handle errors during payload transmission
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


// Finalize response transmission
internals.finalizeResponse = function (request, response, err, event) {

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

    if (policy || response.settings.ttl) {
        internals.setCacheControl(response, request);
    }
    else if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};


// Set cache-control header with appropriate directives
internals.setCacheControl = function (response, request) {

    const ttl = (response.settings.ttl !== null ? response.settings.ttl : request._route._cache.ttl());
    const privacy = (request.auth.isAuthenticated || response.headers['set-cookie'] ? 'private' : request.route.settings.cache.privacy || 'default');
    const privacyDirective = (privacy !== 'default' ? ', ' + privacy : '');
    response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + privacyDirective);
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
        internals.adjustContentTypeCharset(response, type, postMarshal);
    }
};


// Adjust content-type header to include charset if needed
internals.adjustContentTypeCharset = function (response, type, postMarshal) {

    type = type.trim();
    if ((!response._contentType || !postMarshal) &&
        response.settings.charset &&
        type.match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/)) {

        if (!type.match(/; *charset=/)) {
            const semi = (type[type.length - 1] === ';');
            response.type(type + (semi ? ' ' : '; ') + 'charset=' + (response.settings.charset));
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