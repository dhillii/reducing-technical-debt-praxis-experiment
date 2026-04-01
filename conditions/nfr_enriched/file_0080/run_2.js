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

    // Decorate

    if (this._decorations) {
        const properties = Object.keys(this._decorations);
        for (let i = 0; i < properties.length; ++i) {
            const property = properties[i];
            const assignment = this._decorations[property];
            request[property] = (assignment.apply ? assignment.method(request) : assignment.method);
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

    // Take measurement as soon as possible

    this._bench = new Hoek.Bench();
    const now = Date.now();

    // Public members

    this.connection = connection;
    this.server = connection.server;

    this.url = null;
    this.query = null;
    this.path = null;
    this.method = null;
    this.mime = null;                       // Set if payload is parsed
    this.headers = req.headers;

    // Request info

    this.info = internals.initializeInfo(req, now);

    this.setUrl = this._setUrl;             // Decoration removed after 'onRequest'
    this.setMethod = this._setMethod;

    this._setUrl(req.url, this.connection.settings.router.stripTrailingSlash);      // Sets: this.url, this.path, this.query
    this._setMethod(req.method);                                                    // Sets: this.method

    this.id = internals.generateRequestId(now, connection);

    this.app = (options.app ? Hoek.shallow(options.app) : {});              // Place for application-specific state without conflicts with hapi, should not be used by plugins
    this.plugins = (options.plugins ? Hoek.shallow(options.plugins) : {});  // Place for plugins to store state without conflicts with hapi, should be namespaced using plugin name

    this._route = this.connection._router.specials.notFound.route;    // Used prior to routing (only settings are used, not the handler)
    this.route = this._route.public;

    this.auth = internals.initializeAuth(options);

    this.pre = {};                          // Pre raw values
    this.preResponses = {};                 // Pre response values

    // Assigned elsewhere:

    this.orig = {};
    this.params = {};
    this.paramsArray = [];              // Array of path parameters in path order
    this.payload = null;
    this.state = null;
    this.jsonp = null;
    this.response = null;

    // Semi-public members

    this.raw = { req, res };

    this.tail = this.addTail = this._addTail;       // Removed once wagging

    // Private members

    this._states = {};
    this._entity = {};                  // Entity information set via reply.entity()
    this._logger = [];
    this._allowInternals = !!options.allowInternals;
    this._expectContinue = !!options.expectContinue;
    this._isPayloadPending = !!(req.headers['content-length'] || req.headers['transfer-encoding']);      // false when incoming payload fully processed
    this._isBailed = false;             // true when lifecycle should end
    this._isReplied = false;            // true when response processing started
    this._isFinalized = false;          // true when request completed (may be waiting on tails to complete)
    this._tails = {};                   // tail id -> name (tracks pending tails)
    this._tailIds = 0;                  // Used to generate a unique tail id
    this._protect = new Protect(this);
    this.domain = this._protect.domain;

    // Encoding

    this.info.acceptEncoding = this.connection._compression.accept(this);       // Delay until request object fully initialized

    // Listen to request state

    this._listenRequest();

    // Log request

    const about = {
        method: this.method,
        url: this.url.href,
        agent: this.raw.req.headers['user-agent']
    };

    this._log(['received'], about, now);     // Must be last for object to be fully constructed
};

Hoek.inherits(internals.Request, Podium);


// Initialize request info object
internals.initializeInfo = function (req, now) {

    const info = {
        received: now,
        responded: 0,
        remoteAddress: req.connection.remoteAddress,
        remotePort: req.connection.remotePort || '',
        referrer: req.headers.referrer || req.headers.referer || '',
        host: req.headers.host ? req.headers.host.replace(/\s/g, '') : ''
    };

    info.hostname = info.host.split(':')[0];
    return info;
};


// Generate unique request ID
internals.generateRequestId = function (now, connection) {

    const id = now + ':' + connection.info.id + ':' + connection._requestCounter.value++;
    if (connection._requestCounter.value > connection._requestCounter.max) {
        connection._requestCounter.value = connection._requestCounter.min;
    }
    return id;
};


// Initialize auth object
internals.initializeAuth = function (options) {

    return {
        isAuthenticated: false,
        credentials: options.credentials || null,       // Special keys: 'app', 'user', 'scope'
        artifacts: options.artifacts || null,           // Scheme-specific artifacts
        strategy: null,
        mode: null,
        error: null
    };
};


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

    url = (typeof url === 'string' ? Url.parse(url, true) : Hoek.clone(url));

    // Apply path modifications

    let path = this.connection._router.normalize(url.pathname || '');        // pathname excludes query

    if (stripTrailingSlash &&
        path.length > 1 &&
        path[path.length - 1] === '/') {

        path = path.slice(0, -1);
    }

    // Update derived url properties

    if (path !== url.pathname) {
        url.pathname = path;
        url.path = url.search ? path + url.search : path;
        url.href = Url.format(url);
    }

    // Store request properties

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
    timestamp = (timestamp ? (timestamp instanceof Date ? timestamp.getTime() : timestamp) : Date.now());
    const internal = !!_internal;

    let update = (typeof data !== 'function' ? [this, { request: this.id, timestamp, tags, data, internal }] : () => {

        return [this, { request: this.id, timestamp, tags, data: data(), internal }];
    });

    if (this.route.settings.log) {
        if (typeof data === 'function') {
            update = update();
        }

        this._logger.push(update[1]);       // Add to request array
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
    if (!tags.length &&
        internal === undefined) {

        return this._logger;
    }

    return internals.filterLogEvents(this._logger, tags, internal);
};


// Filter log events by tags and internal flag
internals.filterLogEvents = function (events, tags, internal) {

    const filter = tags.length ? Hoek.mapToObject(tags) : null;
    const result = [];

    for (let i = 0; i < events.length; ++i) {
        const event = events[i];
        if (internal === undefined || event.internal === internal) {
            if (filter) {
                if (internals.eventMatchesTags(event, filter)) {
                    result.push(event);
                }
            }
            else {
                result.push(event);
            }
        }
    }

    return result;
};


// Check if event tags match filter
internals.eventMatchesTags = function (event, filter) {

    for (let j = 0; j < event.tags.length; ++j) {
        const tag = event.tags[j];
        if (filter[tag]) {
            return true;
        }
    }
    return false;
};


internals.Request.prototype._execute = function () {

    // Execute onRequest extensions (can change request method and url)

    if (!this.connection._extensions.onRequest.nodes) {
        return this._match();
    }

    this._invoke(this.connection._extensions.onRequest, (err) => {

        return this._match(err);
    });
};


internals.Request.prototype._match = function (err) {

    // Undecorate request

    this.setUrl = undefined;
    this.setMethod = undefined;

    if (err) {
        return this._reply(err);
    }

    if (!this.path ||
        this.path[0] !== '/') {

        return this._reply(Boom.badRequest('Invalid path'));
    }

    // Lookup route

    const match = this.connection._router.route(this.method, this.path, this.info.hostname);
    if (!match.route.settings.isInternal ||
        this._allowInternals) {

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

        if (this._isReplied ||
            this._isBailed) {

            return next(Boom.internal('Already closed'));                       // Error is not used
        }

        if (typeof func !== 'function') {                                       // Extension point
            return this._invoke(func, next);                                    // next() called with response object which ends processing (treated like error)
        }

        return func(this, next);
    };

    return Items.serial(this._route._cycle, each, (err) => this._reply(err));
};


internals.Request.prototype._setTimeouts = function () {

    if (this.raw.req.socket &&
        this.route.settings.timeout.socket !== undefined) {

        this.raw.req.socket.setTimeout(this.route.settings.timeout.socket || 0);    // Value can be false or positive
    }

    let serverTimeout = this.route.settings.timeout.server;
    if (serverTimeout) {
        serverTimeout = Math.floor(serverTimeout - this._bench.elapsed());          // Calculate the timeout from when the request was constructed
        const timeoutReply = () => {

            this._log(['request', 'server', 'timeout', 'error'], { timeout: serverTimeout, elapsed: this._bench.elapsed() });
            this._reply(Boom.serverUnavailable());
        };

        if (serverTimeout <= 0) {
            return timeoutReply();
        }

        this._serverTimeoutId = setTimeout(timeoutReply, serverTimeout);
    }
};


internals.Request.prototype._invoke = function (event, callback) {

    this._protect.run(callback, (exit) => {

        const each = (ext, next) => {

            const finalize = (result, override) => {

                if (override) {
                    this._setResponse(override);
                }

                return next(result);            // next() called with response object which ends processing (treated like error)
            };

            const options = { postHandler: (event.type === 'onPostHandler' || event.type === 'onPreResponse') };
            const reply = this.server._replier.interface(this, ext.plugin.realm, options, finalize);
            const bind = (ext.bind || ext.plugin.realm.settings.bind);

            ext.func.call(bind, this, reply);
        };

        Items.serial(event.nodes, each, exit);
    });
};


internals.Request.prototype._reply = function (exit) {

    if (this._isReplied) {                                  // Prevent any future responses to this request
        return;
    }

    this._isRepl