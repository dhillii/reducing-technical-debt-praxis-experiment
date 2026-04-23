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

            internals.postMarshal(response);
            return Auth.response(request, next);
        });
    });
};

internals.postMarshal = function (response) {
    if (response._payload.jsonp) {
        response._header('content-type', 'text/javascript' + (response.settings.charset ? '; charset=' + response.settings.charset : ''));
        response._header('x-content-type-options', 'nosniff');
        response._payload.jsonp(response.request.jsonp);
    }

    if (response._payload.size && typeof response._payload.size === 'function') {
        response._header('content-length', response._payload.size(), { override: false });
    }

    if (!response._isPayloadSupported()) {
        response._close();
        response._payload = new internals.Empty();
    }

    internals.content(response, true);
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

    internals.setupResponse(response);

    const end = Hoek.once((err, event) => {
        internals.cleanup(request, source, err, event);
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
    const compressed = internals.compress(preview, response);
    const ranged = internals.range(compressed, response);
    ranged.pipe(request.raw.res);
};

internals.setupResponse = function (response) {
    const request = response.request;

    if (response.statusCode === 200 && request.route.settings.response.emptyStatusCode === 204) {
        response.code(204);
        delete response.headers['content-length'];
    }

    const encoding = request.connection._compression.encoding(response);
    response._header('content-encoding', encoding);

    if (encoding && response.headers.etag && response.settings.varyEtag) {
        response.headers.etag = response.headers.etag.slice(0, -1) + '-' + encoding + '"';
    }

    if (!(Shot.isInjection(request.raw.req) || request.connection._started) ||
        (request._isPayloadPending && !request.raw.req._readableState.ended)) {
        response._header('connection', 'close');
    }

    internals.writeHead(response);
};

internals.compress = function (source, response) {
    const request = response.request;
    const encoding = request.connection._compression.encoding(response);
    const compressor = encoding ? request.connection._compression.encoder(request, encoding) : null;
    return compressor ? source.pipe(compressor) : source;
};

internals.range = function (source, response) {
    const request = response.request;
    const length = parseInt(response.headers['content-length'], 10);
    const ranger = request.route.settings.response.ranges && request.method === 'get' && response.statusCode === 200 && length > 0 ? new Ammo.Stream(Ammo.header(request.headers.range, length)[0]) : null;
    if (ranger) {
        response.code(206);
        response.bytes(ranger.range.to - ranger.range.from + 1);
        response._header('content-range', 'bytes ' + ranger.range.from + '-' + ranger.range.to + '/' + length);
    }
    return ranger ? source.pipe(ranger) : source;
};

internals.cleanup = function (request, source, err, event) {
    source.removeListener('error', internals.end);
    request.raw.req.removeListener('aborted', internals.onAborted);
    request.raw.req.removeListener('close', internals.onClose);
    request.raw.res.removeListener('close', internals.onClose);
    request.raw.res.removeListener('error', internals.end);
    request.raw.res.removeListener('finish', internals.end);

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

    const tags = err ? ['response', 'error'] : event ? ['response', 'error', event] : ['response'];
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
        const ttl = response.settings.ttl !== null ? response.settings.ttl : request._route._cache.ttl();
        const privacy = request.auth.isAuthenticated || response.headers['set-cookie'] ? 'private' : request.route.settings.cache.privacy || 'default';
        response._header('cache-control', 'max-age=' + Math.floor(ttl / 1000) + ', must-revalidate' + (privacy !== 'default' ? ', ' + privacy : ''));
    } else if (request.route.settings.cache) {
        response._header('cache-control', request.route.settings.cache.otherwise);
    }
};

internals.content = function (response, postMarshal) {
    let type = response.headers['content-type'];
    if (!type) {
        if (response._contentType) {
            const charset = response.settings.charset && response._contentType !== 'application/octet-stream' ? '; charset=' + response.settings.charset : '';
            response.type(response._contentType + charset);
        }
    } else {
        type = type.trim();
        if ((!response._contentType || !postMarshal) && response.settings.charset && type.match(/^(?:text\/)|(?:application\/(?:json)|(?:javascript))/)) {
            if (!type.match(/; *charset=/)) {
                const semi = type[type.length - 1] === ';';
                response.type(type + (semi ? ' ' : '; ') + 'charset=' + response.settings.charset);
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
                header = Array.isArray(existing) ? existing.concat(header) : [existing].concat(header);
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