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

            internals.handleJsonp(response, request);
            internals.setContentLength(response);

            if (!response._isPayloadSupported()) {
                response._close();
                response._payload = new internals.Empty();
            }

            internals.content(response, true);
            return Auth.response(request, next);
        });
    });
};

internals.handleJsonp = function (response, request) {
    if (request.jsonp && response._payload.jsonp) {
        const charset = response.settings.charset ? '; charset=' + response.settings.charset : '';
        response._header('content-type', 'text/javascript' + charset);
        response._header('x-content-type-options', 'nosniff');
        response._payload.jsonp(request.jsonp);
    }
};

internals.setContentLength = function (response) {
    if (response._payload.size && typeof response._payload.size === 'function') {
        response._header('content-length', response._payload.size(), { override: false });
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

    internals.handleEmptyResponse(response, length);

    const encoding = request.connection._compression.encoding(response);
    const ranger = internals.handleRange(request, response, length, encoding, callback);

    if (ranger === false) {
        return;
    }

    const compressor = internals.handleCompression(request, response, encoding, length);
    internals.handleEtagEncoding(response, encoding);
    internals.handleConnectionClose(request, response);

    const error = internals.writeHead(response);
    if (error) {
        return Hoek.nextTick(callback)(error);
    }

    internals.handleInjection(request, response);
    internals.pipePayload(request, response, source, ranger, compressor, callback);
};

internals.handleEmptyResponse = function (response, length) {
    if (length === 0 && response.statusCode === 200 &&
        response.request.route.settings.response.emptyStatusCode === 204) {
        response.code(204);
        delete response.headers['content-length'];
    }
};

internals.handleRange = function (request, response, length, encoding, callback) {
    if (!request.route.settings.response.ranges || request.method !== 'get' ||
        response.statusCode !== 200 || length === 0 || encoding) {
        response._header('accept-ranges', 'bytes');
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
        internals.fail(request, error, callback);
        return false;
    }

    response._header('accept-ranges', 'bytes');

    if (ranges.length === 1) {
        const range = ranges[0];
        const ranger = new Ammo.Stream(range);
        response.code(206);
        response.bytes(range.to - range.from + 1);
        response._header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
        return ranger;
    }

    return null;
};

internals.handleCompression = function (request, response, encoding, length) {
    if (!encoding || length === 0 || response.statusCode === 206 || !response._isPayloadSupported()) {
        return null;
    }

    delete response.headers['content-length'];
    response._header('content-encoding', encoding);
    return request.connection._compression.encoder(request, encoding);
};

internals.handleEtagEncoding = function (response, encoding) {
    if ((response.headers['content-encoding'] || encoding) && response.headers.etag && response.settings.varyEtag) {
        const encodingValue = response.headers['content-encoding'] || encoding;
        response.headers.etag = response.headers.etag.slice(0, -1) + '-' + encodingValue + '"';
    }
};

internals.handleConnectionClose = function (request, response) {
    const isInjection = Shot.isInjection(request.raw.req);
    if (!(isInjection || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended)) {
        response._header('connection', 'close');
    }
};

internals.handleInjection = function (request, response) {
    const isInjection = Shot.isInjection(request.raw.req);
    if (isInjection) {
        request.raw.res._hapi = { request };
        if (response.variety === 'plain') {
            request.raw.res._hapi.result = response._isPayloadSupported() ? response.source : null;
        }
    }
};

internals.pipePayload = function (request, response, source, ranger, compressor, callback) {
    const end = Hoek.once((err, event) => {
        internals.cleanupListeners(request, source, end);

        if (err) {
            internals.handlePayloadError(request, source, err);
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

    source.once('error', end);

    const onAborted = () => end(null, 'aborted');
    const onClose = () => end(null, 'close');

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

internals.cleanupListeners = function (request, source, end) {
    source.removeListener('error', end);
    request.raw.req.removeListener('aborted', end);
    request.raw.req.removeListener('close', end);
    request.raw.res.removeListener('close', end);
    request.raw.res.removeListener('error', end);
    request.raw.res.removeListener('finish', end);
};

internals.handlePayloadError = function (request, source, err) {
    request.raw.res.destroy();

    if (request.raw.res._hapi) {
        request.raw.res.statusCode = 500;
        request.raw.res._hapi.result = Boom.boomify(err).output.payload;
    }

    source.unpipe();
    Response.drain(source);
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

internals.Empty.prototype._read = function () {
    this.push(null);
};

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
    const isPrivate = request.auth.isAuthenticated || response.headers['set-cookie'];
    const privacy = isPrivate ? 'private' : (request.route.settings.cache.privacy || 'default');
    const privacySuffix = privacy !== 'default' ? ', ' + privacy : '';
    response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + privacySuffix);
};

internals.content = function (response, postMarshal) {
    let type = response.headers['content-type'];

    if (!type) {
        if (response._contentType) {
            const charset = response.settings.charset && response._contentType !== 'application/octet-stream'
                ? '; charset=' + response.settings.charset
                : '';
            response.type(response._contentType + charset);
        }
    }
    else {
        internals.updateContentType(response, type, postMarshal);
    }
};

internals.updateContentType = function (response, type, postMarshal) {
    type = type.trim();
    const needsCharset = (!response._contentType || !postMarshal) &&
        response.settings.charset &&
        type.match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/);

    if (needsCharset && !type.match(/; *charset=/)) {
        const semi = type[type.length - 1] === ';';
        response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
    }
};

internals.state = function (response, next) {
    const request = response.request;
    const names = {};
    const states = [];

    Object.keys(request._states).forEach((stateName) => {
        names[stateName] = true;
        states.push(request._states[stateName]);
    });

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
        vary: response.settings.varyE