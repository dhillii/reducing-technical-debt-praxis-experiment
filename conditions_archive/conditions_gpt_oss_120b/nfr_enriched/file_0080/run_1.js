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

    if (this._decorations) {
        const properties = Object.keys(this._decorations);
        for (let i = 0; i < properties.length; ++i) {
            const property = properties[i];
            const assignment = this._decorations[property];
            request[property] = assignment.apply ? assignment.method(request) : assignment.method;
        }
    }

    return request;
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

    this.url = null;
    this.query = null;
    this.path = null;
    this.method = null;
    this.mime = null;
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

    this.setUrl = this._setUrl;
    this.setMethod = this._setMethod;

    this._setUrl(req.url, this.connection.settings.router.stripTrailingSlash);
    this._setMethod(req.method);

    this.id = now + ':' + connection.info.id + ':' + connection._requestCounter.value++;
    if (connection._requestCounter.value > connection._requestCounter.max) {
        connection._requestCounter.value = connection._requestCounter.min;
    }

    this.app = options.app ? Hoek.shallow(options.app) : {};
    this.plugins = options.plugins ? Hoek.shallow(options.plugins) : {};

    this._route = this.connection._router.specials.notFound.route;
    this.route = this._route.public;

    this.auth = {
        isAuthenticated: false,
        credentials: options.credentials || null,
        artifacts: options.artifacts || null,
        strategy: null,
        mode: null,
        error: null
    };

    this.pre = {};
    this.preResponses = {};

    this.orig = {};
    this.params = {};
    this.paramsArray = [];
    this.payload = null;
    this.state = null;
    this.jsonp = null;
    this.response = null;

    this.raw = { req, res };
    this.tail = this.addTail = this._addTail;

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

internals.Request.prototype._listenRequest = function () {
    this._onEnd = () => {
        this._isPayloadPending = false;
    };
    this.raw.req.once('end', this._onEnd);

    this._onClose = () => {
        this._log(['request', 'closed', 'error']);
        this._isPayloadPending = false;
        this._isBailed = true;
    };
    this.raw.req.once('close', this._onClose);

    this._onError = (err) => {
        this._log(['request', 'error'], err);
        this._isPayloadPending = false;
    };
    this.raw.req.once('error', this._onError);

    this._onAbort = () => {
        this._log(['request', 'abort', 'error']);
        this._isPayloadPending = false;
        this._isBailed = true;
        this.emit('disconnect');
    };
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

/**
 * Create a log entry object.
 */
internals.Request.prototype._createLogEntry = function (tags, data, timestamp, internal) {
    timestamp = timestamp !== undefined ? (timestamp instanceof Date ? timestamp.getTime() : timestamp) : Date.now();
    const entry = {
        request: this.id,
        timestamp,
        tags,
        data: typeof data === 'function' ? data() : data,
        internal
    };
    return entry;
};

internals.Request.prototype.log = function (tags, data, timestamp, _internal) {
    tags = [].concat(tags);
    const internal = !!_internal;
    const entry = this._createLogEntry(tags, data, timestamp, internal);
    const update = [this, entry];

    if (this.route.settings.log) {
        this._logger.push(entry);
    }

    this.connection.emit({ name: internal ? 'request-internal' : 'request', tags }, update);
};

internals.Request.prototype._log = function (tags, data) {
    return this.log(tags, data, null, true);
};

/**
 * Filter logger events based on tags and internal flag.
 */
internals.Request.prototype._filterLogEvents = function (event, filter, internal) {
    if (internal !== undefined && event.internal !== internal) {
        return false;
    }
    if (!filter) {
        return true;
    }
    for (let i = 0; i < event.tags.length; ++i) {
        if (filter[event.tags[i]]) {
            return true;
        }
    }
    return false;
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

    const filter = tags.length ? Hoek.mapToObject(tags) : null;
    const result = [];

    for (let i = 0; i < this._logger.length; ++i) {
        const event = this._logger[i];
        if (this._filterLogEvents(event, filter, internal)) {
            result.push(event);
        }
    }

    return result;
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

/**
 * Run each lifecycle step sequentially.
 */
internals.Request.prototype._runLifecycleStep = function (func, next) {
    if (this._isReplied || this._isBailed) {
        return next(Boom.internal('Already closed'));
    }

    if (typeof func !== 'function') {
        return this._invoke(func, next);
    }

    return func(this, next);
};

internals.Request.prototype._lifecycle = function () {
    this._setTimeouts();

    const each = (func, next) => this._runLifecycleStep(func, next);
    Items.serial(this._route._cycle, each, (err) => this._reply(err));
};

internals.Request.prototype._setSocketTimeout = function () {
    if (this.raw.req.socket && this.route.settings.timeout.socket !== undefined) {
        this.raw.req.socket.setTimeout(this.route.settings.timeout.socket || 0);
    }
};

internals.Request.prototype._scheduleServerTimeout = function () {
    let serverTimeout = this.route.settings.timeout.server;
    if (!serverTimeout) {
        return;
    }

    serverTimeout = Math.floor(serverTimeout - this._bench.elapsed());
    const timeoutReply = () => {
        this._log(['request', 'server', 'timeout', 'error'], { timeout: serverTimeout, elapsed: this._bench.elapsed() });
        this._reply(Boom.serverUnavailable());
    };

    if (serverTimeout <= 0) {
        return timeoutReply();
    }

    this._serverTimeoutId = setTimeout(timeoutReply, serverTimeout);
};

internals.Request.prototype._setTimeouts = function () {
    this._setSocketTimeout();
    this._scheduleServerTimeout();
};

/**
 * Execute an extension event.
 */
internals.Request.prototype._runExtension = function (ext, reply) {
    const options = { postHandler: (ext.type === 'onPostHandler' || ext.type === 'onPreResponse') };
    const bind = ext.bind || ext.plugin.realm.settings.bind;
    const finalize = (result, override) => {
        if (override) {
            this._setResponse(override);
        }
        reply(result);
    };
    const reply = this.server._replier.interface(this, ext.plugin.realm, options, finalize);
    ext.func.call(bind, this, reply);
};

internals.Request.prototype._invoke = function (event, callback) {
    this._protect.run(callback, (exit) => {
        const each = (ext, next) => this._runExtension(ext, next);
        Items.serial(event.nodes, each, exit);
    });
};

internals.Request.prototype._shouldFinalize = function () {
    if (this._isBailed) {
        this._finalize();
        return true;
    }
    if (this.response && this.response.closed) {
        if (this.response.end) {
            this.raw.res.end();
        }
        this._finalize();
        return true;
    }
    return false;
};

internals.Request.prototype._reply = function (exit) {
    if (this._isReplied) {
        return;
    }
    this._isReplied = true;
    clearTimeout(this._serverTimeoutId);

    if (this._shouldFinalize()) {
        return;
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

    this._invoke(this._route._extensions.onPreResponse, transmit);
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
    this.addTail = undefined;
    this.tail = undefined;

    if (Object.keys(this._tails).length === 0) {
        this.connection.emit('tail', this);
    }

    this.raw.req.removeListener('end', this._onEnd);
    this.raw.req.removeListener('close', this._onClose);
    this.raw.req.removeListener('error', this._onError);
    this.raw.req.removeListener('error', this._onAbort);

    if (this.response && this.response._close) {
        this.response._close();
    }

    this._protect.logger = this.server;
};

internals.Request.prototype._setResponse = function (response) {
    if (this.response && !this.response.isBoom && this.response !== response && (response.isBoom || this.response.source !== response.source)) {
        this.response._close();
    }

    if (this._isFinalized) {
        if (response._close) {
            response._close();
        }
        return;
    }

    this.response = response;
};

internals.Request.prototype._addTail = function (name) {
    name = name || 'unknown';
    const tailId = this._tailIds++;
    this._tails[tailId] = name;
    this._log(['tail', 'add'], { name, id: tailId });

    const drop = () => {
        if (!this._tails[tailId]) {
            this._log(['tail', 'remove', 'error'], { name, id: tailId });
            return;
        }

        delete this._tails[tailId];

        if (Object.keys(this._tails).length === 0 && this._isFinalized) {
            this._log(['tail', 'remove', 'last'], { name, id: tailId });
            this.connection.emit('tail', this);
        } else {
            this._log(['tail', 'remove'], { name, id: tailId });
        }
    };

    return drop;
};

internals.Request.prototype._setState = function (name, value, options) {
    const state = { name, value };
    if (options) {
        Hoek.assert(!options.autoValue, 'Cannot set autoValue directly in a response');
        state.options = Hoek.clone(options);
    }
    this._states[name] = state;
};

internals.Request.prototype._clearState = function (name, options) {
    const state = { name };
    state.options = Hoek.clone(options || {});
    state.options.ttl = 0;
    this._states[name] = state;
};

internals.Request.prototype._tap = function () {
    return (this.hasListeners('finish') || this.hasListeners('peek') ? new Response.Peek(this) : null);
};

internals.Request.prototype.generateResponse = function (source, options) {
    return new Response(source, this, options);
};