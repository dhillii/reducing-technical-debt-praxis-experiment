```javascript
'use strict';

const Url = require('url');
const Boom = require('boom');
const Hoek = require('hoek');
const Items = require('items');
const Podium = require('podium');

const Cors = require('./cors');
const Protect = require('./protect');
const Response = require('./response');
const Transmit = require('./transmit');

const internals = {
    properties: ['connection', 'server', 'url', 'query', 'path', 'method', 'mime', 'setUrl', 'setMethod', 'headers', 'id', 'app', 'plugins', 'route', 'auth', 'pre', 'preResponses', 'info', 'orig', 'params', 'paramsArray', 'payload', 'state', 'jsonp', 'response', 'raw', 'tail', 'addTail', 'domain', 'log', 'getLog', 'generateResponse'],
    emitter: new Podium(['finish', { name: 'peek', spread: true }, 'disconnect'])
};

exports = module.exports = internals.Generator = function () {
    this._decorations = null;
};

internals.Generator.prototype.request = function (connection, req, res, options) {
    const request = new internals.Request(connection, req, res, options);
    this._applyDecorations(request);
    return request;
};

internals.Generator.prototype._applyDecorations = function (request) {
    if (!this._decorations) {
        return;
    }

    Object.keys(this._decorations).forEach((property) => {
        const assignment = this._decorations[property];
        request[property] = assignment.apply ? assignment.method(request) : assignment.method;
    });
};

internals.Generator.prototype.decorate = function (property, method, options) {
    options = options || {};

    Hoek.assert(!this._decorations || this._decorations[property] === undefined, 'Request interface decoration already defined:', property);
    Hoek.assert(internals.properties.indexOf(property) === -1, 'Cannot override built-in request interface decoration:', property);

    this._decorations = this._decorations || {};
    this._decorations[property] = { method, apply: options.apply };
};

internals.Request = function (connection, req, res, options) {
    Podium.decorate(this, internals.emitter);

    this._bench = new Hoek.Bench();
    const now = Date.now();

    this.connection = connection;
    this.server = connection.server;

    this._initializeUrl();
    this._initializeMethod();
    this._initializeInfo(req, now);
    this._initializeAuth(options);
    this._initializeState();
    this._initializeRaw(req, res);
    this._initializePrivateMembers(req, options);

    this.id = this._generateRequestId(connection, now);
    this.app = options.app ? Hoek.shallow(options.app) : {};
    this.plugins = options.plugins ? Hoek.shallow(options.plugins) : {};

    this._route = this.connection._router.specials.notFound.route;
    this.route = this._route.public;

    this.info.acceptEncoding = this.connection._compression.accept(this);

    this._listenRequest();

    const about = {
        method: this.method,
        url: this.url.href,
        agent: this.raw.req.headers['user-agent']
    };

    this._log(['received'], about, now);
};

Hoek.inherits(internals.Request, Podium);

internals.Request.prototype._initializeUrl = function () {
    this.url = null;
    this.query = null;
    this.path = null;
    this.setUrl = this._setUrl;
};

internals.Request.prototype._initializeMethod = function () {
    this.method = null;
    this.setMethod = this._setMethod;
};

internals.Request.prototype._initializeInfo = function (req, now) {
    this.headers = req.headers;
    this.info = {
        received: now,
        responded: 0,
        remoteAddress: req.connection.remoteAddress,
        remotePort: req.connection.remotePort || '',
        referrer: req.headers.referrer || req.headers.referer || '',
        host: req.headers.host ? req.headers.host.replace(/\s/g, '') : ''
    };
    this.info.hostname = this.info.host.split(':')[0];

    this._setUrl(req.url, this.connection.settings.router.stripTrailingSlash);
    this._setMethod(req.method);
};

internals.Request.prototype._initializeAuth = function (options) {
    this.auth = {
        isAuthenticated: false,
        credentials: options.credentials || null,
        artifacts: options.artifacts || null,
        strategy: null,
        mode: null,
        error: null
    };
};

internals.Request.prototype._initializeState = function () {
    this.pre = {};
    this.preResponses = {};
    this.orig = {};
    this.params = {};
    this.paramsArray = [];
    this.payload = null;
    this.state = null;
    this.jsonp = null;
    this.response = null;
};

internals.Request.prototype._initializeRaw = function (req, res) {
    this.raw = { req, res };
    this.tail = this.addTail = this._addTail;
};

internals.Request.prototype._initializePrivateMembers = function (req, options) {
    this._states = {};
    this._entity = {};
    this._logger = [];
    this._allowInternals = !!options.allowInternals;
    this._expectContinue = !!options.expectContinue;
    this._isPayloadPending = !!(req.headers['content-length'] || req.headers['transfer-encoding']);
    this._isBailed = false;
    this._isReplied = false;
    this._isFinalized = false;
    this._tails = {};
    this._tailIds = 0;
    this._protect = new Protect(this);
    this.domain = this._protect.domain;
};

internals.Request.prototype._generateRequestId = function (connection, now) {
    const id = now + ':' + connection.info.id + ':' + connection._requestCounter.value++;
    if (connection._requestCounter.value > connection._requestCounter.max) {
        connection._requestCounter.value = connection._requestCounter.min;
    }
    return id;
};

internals.Request.prototype._listenRequest = function () {
    this._onEnd = () => {
        this._isPayloadPending = false;
    };

    this._onClose = () => {
        this._log(['request', 'closed', 'error']);
        this._isPayloadPending = false;
        this._isBailed = true;
    };

    this._onError = (err) => {
        this._log(['request', 'error'], err);
        this._isPayloadPending = false;
    };

    this._onAbort = () => {
        this._log(['request', 'abort', 'error']);
        this._isPayloadPending = false;
        this._isBailed = true;
        this.emit('disconnect');
    };

    this.raw.req.once('end', this._onEnd);
    this.raw.req.once('close', this._onClose);
    this.raw.req.once('error', this._onError);
    this.raw.req.once('aborted', this._onAbort);
};

internals.Request.prototype._setUrl = function (url, stripTrailingSlash) {
    url = typeof url === 'string' ? Url.parse(url, true) : Hoek.clone(url);

    let path = this.connection._router.normalize(url.pathname || '');

    if (stripTrailingSlash && path.length > 1 && path[path.length - 1] === '/') {
        path = path.slice(0, -1);
    }

    if (path !== url.pathname) {
        url.pathname = path;
        url.path = url.search ? path + url.search : path;
        url.href = Url.format(url);
    }

    this.url = url;
    this.query = url.query;
    this.path = url.pathname;

    if (url.hostname) {
        this.info.hostname = url.hostname;
        this.info.host = url.host;
    }
};

internals.Request.prototype._setMethod = function (method) {
    Hoek.assert(method && typeof method === 'string', 'Missing method');
    this.method = method.toLowerCase();
};

internals.Request.prototype.log = function (tags, data, timestamp, _internal) {
    tags = [].concat(tags);
    timestamp = timestamp instanceof Date ? timestamp.getTime() : (timestamp || Date.now());
    const internal = !!_internal;

    const update = typeof data !== 'function'
        ? [this, { request: this.id, timestamp, tags, data, internal }]
        : () => [this, { request: this.id, timestamp, tags, data: data(), internal }];

    if (this.route.settings.log) {
        const logEntry = typeof data === 'function' ? update()[1] : update[1];
        this._logger.push(logEntry);
    }

    this.connection.emit({ name: internal ? 'request-internal' : 'request', tags }, update);
};

internals.Request.prototype._log = function (tags, data) {
    return this.log(tags, data, null, true);
};

internals.Request.prototype.getLog = function (tags, internal) {
    Hoek.assert(this.route.settings.log, 'Request logging is disabled');

    if (typeof tags === 'boolean') {
        internal = tags;
        tags = [];
    }

    tags = [].concat(tags || []);

    if (!tags.length && internal === undefined) {
        return this._logger;
    }

    return this._filterLogs(tags, internal);
};

internals.Request.prototype._filterLogs = function (tags, internal) {
    const filter = tags.length ? Hoek.mapToObject(tags) : null;
    const result = [];

    for (let i = 0; i < this._logger.length; ++i) {
        const event = this._logger[i];
        if (internal !== undefined && event.internal !== internal) {
            continue;
        }

        if (!filter || this._eventMatchesTags(event, filter)) {
            result.push(event);
        }
    }

    return result;
};

internals.Request.prototype._eventMatchesTags = function (event, filter) {
    for (let j = 0; j < event.tags.length; ++j) {
        if (filter[event.tags[j]]) {
            return true;
        }
    }
    return false;
};

internals.Request.prototype._execute = function () {
    if (!this.connection._extensions.onRequest.nodes) {
        return this._match();
    }

    this._invoke(this.connection._extensions.onRequest, (err) => this._match(err));
};

internals.Request.prototype._match = function (err) {
    this.setUrl = undefined;
    this.setMethod = undefined;

    if (err) {
        return this._reply(err);
    }

    if (!this.path || this.path[0] !== '/') {
        return this._reply(Boom.badRequest('Invalid path'));
    }

    const match = this.connection._router.route(this.method, this.path, this.info.hostname);
    if (!match.route.settings.isInternal || this._allowInternals) {
        this._route = match.route;
        this.route = this._route.public;
    }

    this.params = match.params || {};
    this.paramsArray = match.paramsArray || [];

    if (this.route.settings.cors) {
        this.info.cors = {
            isOriginMatch: Cors.matchOrigin(this.headers.origin, this.route.settings.cors)
        };
    }

    return this._lifecycle();
};

internals.Request.prototype._lifecycle = function () {
    this._setTimeouts();

    const each = (func, next) => {
        if (this._isReplied || this._isBailed) {
            return next(Boom.internal('Already closed'));
        }

        if (typeof func !== 'function') {
            return this._invoke(func, next);
        }

        return func(this, next);
    };

    return Items.serial(this._route._cycle, each, (err) => this._reply(err));
};

internals.Request.prototype._setTimeouts = function () {
    if (this.raw.req.socket && this.route.settings.timeout.socket !== undefined) {
        this.raw.req.socket.setTimeout(this.route.settings.timeout.socket || 0);
    }

    const serverTimeout = this.route.settings.timeout.server;
    if (!serverTimeout) {
        return;
    }

    const adjustedTimeout = Math.floor(serverTimeout - this._bench.elapsed());
    const timeoutReply = () => {
        this._log(['request', 'server', 'timeout', 'error'], { timeout: adjustedTimeout, elapsed: this._bench.elapsed() });
        this._reply(Boom.serverUnavailable());
    };

    if (adjustedTimeout <= 0) {
        return timeoutReply();
    }

    this._serverTimeoutId = setTimeout(timeoutReply, adjustedTimeout);
};

internals.Request.prototype._invoke = function (event, callback) {
    this._protect.run(callback, (exit) => {
        const each = (ext, next) => {
            const finalize = (result, override) => {
                if (override) {
                    this._setResponse(override);
                }
                return next(result);
            };

            const options = { postHandler: event.type === 'onPostHandler' || event.type === 'onPreResponse' };
            const reply = this.server._replier.interface(this, ext.plugin.realm, options, finalize);
            const bind = ext.bind || ext.plugin.realm.settings.bind;

            ext.func.call(bind, this, reply);
        };

        Items.serial(event.nodes, each, exit);
    });
};

internals.Request.prototype._reply = function (exit) {
    if (this._isReplied) {
        return;
    }

    this._isReplied = true;
    clearTimeout(this._serverTimeoutId);

    if (this._isBailed) {
        return this._finalize();
    }

    if (this.response && this.response.closed) {
        if (this.response.end) {
            this.raw.res.end();
        }
        return this._finalize();
    }

    if (exit) {
        this._setResponse(Response.wrap(exit, this));
    }

    this._protect.reset();

    const transmit = (err) => {
        if (err) {
            this._setResponse(Response.wrap(err, this));
        }
        return Transmit.send(this, () => this._finalize());
    };

    if (!this._route._extensions.onPreResponse.nodes) {
        return transmit();
    }

    return this._invoke(this._route._extensions.onPreResponse, transmit);
};

internals.Request.prototype._finalize = function () {
    this.info.responded = Date.now();

    if (this.response && this.response.statusCode === 500 && this.response._error) {
        this.connection.emit('request-error', [this, this.response._error]);
        const tags = this.response._error.isDeveloperError ? ['internal', 'implementation', 'error'] : ['internal', 'error'];
        this._log(tags, this.response._error);
    }

    this.connection.emit('response', this);

    this._isFinalized = true;