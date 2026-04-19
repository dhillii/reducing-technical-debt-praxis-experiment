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

        return internals.transmit(response, callback);
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

        if (!internals.isPayloadSupported(response) &&
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

            if (internals.hasJsonpPayload(response)) {
                response._header('content-type', 'text/javascript' + (response.settings.charset ? '; charset=' + response.settings.charset : ''));
                response._header('x-content-type-options', 'nosniff');
                response._payload.jsonp(request.jsonp);
            }

            if (internals.hasPayloadSize(response)) {
                response._header('content-length', response._payload.size(), { override: false });
            }

            if (!internals.isPayloadSupported(response)) {
                response._close();
                response._payload = new internals.Empty();
            }

            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
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

    if (internals.isEmptyResponse(response, request)) {
        response.code(204);
        delete response.headers['content-length'];
    }

    const encoding = request.connection._compression.encoding(response);

    const ranger = internals.createRange(request, response, length, encoding);

    const compressor = internals.createCompressor(request, response, encoding, length);

    if (internals.shouldCloseConnection(request, response)) {
        response._header('connection', 'close');
    }

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    if (Shot.isInjection(request.raw.req)) {
        request.raw.res._hapi = { request };

        if (response.variety === 'plain') {
            request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
        }
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

        if (!request.raw.res.finished &&
            event !== 'aborted') {

            request.raw.res.end();
        }

        if (event || err) {
            request.emit('disconnect');
        }

        const tags = (err ? ['response', 'error'] : (event ? ['response', 'error', event] : ['response']));
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

    const tap = response._tap();
    const preview = (tap ? source.pipe(tap) : source);
    const compressed = (compressor ? preview.pipe(compressor) : preview);
    const ranged = (ranger ? compressed.pipe(ranger) : compressed);
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

    const policy = internals.hasCachePolicy(request, response);

    if (policy ||
        response.settings.ttl) {

        const ttl = internals.getTtl(response, request);
        const privacy = internals.getPrivacy(request, response);
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
            const charset = internals.hasCharset(response);
            response.type(response._contentType + charset);
        }
    }
    else {
        type = type.trim();
        if (internals.shouldAddCharset(response, postMarshal)) {
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

    if (internals.hasEtag(request) &&
        !response.headers.etag) {

        response.etag(request._entity.etag, { vary: request._entity.vary });
    }

    if (internals.hasModified(request) &&
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


// Predicate functions


internals.isPayloadSupported = function (response) {

    return response._isPayloadSupported();
};


internals.hasJsonpPayload = function (response) {

    return response._payload.jsonp;
};


internals.hasPayloadSize = function (response) {

    return response._payload.size &&
        typeof response._payload.size === 'function';
};


internals.isEmptyResponse = function (response, request) {

    const length = parseInt(response.headers['content-length'], 10);

    return length === 0 &&
        response.statusCode === 200 &&
        request.route.settings.response.emptyStatusCode === 204;
};


internals.createRange = function (request, response, length, encoding) {

    if (!request.route.settings.response.ranges ||
        request.method !== 'get' ||
        response.statusCode !== 200 ||
        length <= 0 ||
        encoding) {

        return null;
    }

    if (!request.headers.range) {
        return null;
    }

    if (request.headers['if-range'] &&
        request.headers['if-range'] !== response.headers.etag) {

        return null;
    }

    const ranges = Ammo.header(request.headers.range, length);
    if (!ranges) {
        return null;
    }

    if (ranges.length !== 1) {
        return null;
    }

    const range = ranges[0];
    return new Ammo.Stream(range);
};


internals.createCompressor = function (request, response, encoding, length) {

    if (!encoding ||
        length === 0 ||
        response.statusCode === 206 ||
        !response._isPayloadSupported()) {

        return null;
    }

    return request.connection._compression.encoder(request, encoding);
};


internals.shouldCloseConnection = function (request, response) {

    const isInjection = Shot.isInjection(request.raw.req);

    return !(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended);
};


internals.hasCachePolicy = function (request, response) {

    return request.route.settings.cache &&
        request._route._cache &&
        (request.route.settings.cache._statuses[response.statusCode] ||
            (response.statusCode === 304 && request.route.settings.cache._statuses['200']));
};


internals.getTtl = function (response, request) {

    return response.settings.ttl !== null ? response.settings.ttl : request._route._cache.ttl();
};


internals.getPrivacy = function (request, response) {

    return request.auth.isAuthenticated || response.headers['set-cookie'] ? 'private' : request.route.settings.cache.privacy || 'default';
};


internals.hasCharset = function (response) {

    return response.settings.charset && response._contentType !== 'application/octet-stream' ? '; charset=' + response.settings.charset : '';
};


internals.shouldAddCharset = function (response, postMarshal) {

    return (!response._contentType || !postMarshal) &&
        response.settings.charset &&
        response.headers['content-type'].match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/);
};


internals.hasEtag = function (request) {

    return request._entity.etag;
};


internals.hasModified = function (request) {

    return request._entity.modified;
};
```