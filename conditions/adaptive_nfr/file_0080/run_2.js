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

    this.info = {
        received: now,
        responded: 0,
        remoteAddress: req.connection.remoteAddress,
        remotePort: req.connection.remotePort || '',
        referrer: req.headers.referrer || req.headers.referer || '',
        host: req.headers.host ? req.headers.host.replace(/\s/g, '') : ''
    };

    this.info.hostname = this.info.host.split(':')[0];

    this.setUrl = this._setUrl;             // Decoration removed after 'onRequest'
    this.setMethod = this._setMethod;

    this._setUrl(req.url, this.connection.settings.router.stripTrailingSlash);      // Sets: this.url, this.path, this.query
    this._setMethod(req.method);                                                    // Sets: this.method

    this.id = now + ':' + connection.info.id + ':' + connection._requestCounter.value++;
    if (connection._requestCounter.value > connection._requestCounter.max) {
        connection._requestCounter.value = connection._requestCounter.min;
    }

    this.app = (options.app ? Hoek.shallow(options.app) : {});              // Place for application-specific state without conflicts with hapi, should not be used by plugins
    this.plugins = (options.plugins ? Hoek.shallow(options.plugins) : {});  // Place for plugins to store state without conflicts with hapi, should be namespaced using plugin name

    this._route = this.connection._router.specials.notFound.route;    // Used prior to routing (only settings are used, not the handler)
    this.route = this._route.public;

    this.auth = {
        isAuthenticated: false,
        credentials: options.credentials || null,       // Special keys: 'app', 'user', 'scope'
        artifacts: options.artifacts || null,           // Scheme-specific artifacts
        strategy: null,
        mode: null,
        error: null
    };

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


/**
 * Determines if data is a function for deferred evaluation
 * @param {*} data - The data to check
 * @returns {boolean} True if data is a function
 */
internals.isDataFunction = function (data) {

    return typeof data === 'function';
};


/**
 * Creates a log update entry for immediate or deferred data
 * @param {*} request - The request object
 * @param {string} id - The request ID
 * @param {Array} tags - Log tags
 * @param {*} data - Log data (function or value)
 * @param {boolean} internal - Whether this is an internal log
 * @returns {Array|Function} Update entry or function returning update entry
 */
internals.createLogUpdate = function (request, id, tags, data, internal) {

    if (!internals.isDataFunction(data)) {
        return [request, { request: id, timestamp: Date.now(), tags, data, internal }];
    }

    return () => {

        return [request, { request: id, timestamp: Date.now(), tags, data: data(), internal }];
    };
};


internals.Request.prototype.log = function (tags, data, timestamp, _internal) {

    tags = [].concat(tags);
    timestamp = (timestamp ? (timestamp instanceof Date ? timestamp.getTime() : timestamp) : Date.now());
    const internal = !!_internal;

    const update = (typeof data !== 'function' ? [this, { request: this.id, timestamp, tags, data, internal }] : () => {

        return [this, { request: this.id, timestamp, tags, data: data(), internal }];
    });

    if (this.route.settings.log) {
        const logEntry = (typeof data === 'function' ? update() : update);
        this._logger.push(logEntry[1]);       // Add to request array
    }

    this.connection.emit({ name: internal ? 'request-internal' : 'request', tags }, update);
};


internals.Request.prototype._log = function (tags, data) {

    return this.log(tags, data, null, true);
};


/**
 * Filters logger entries by tags and internal status
 * @param {Array} events - Logger events to filter
 * @param {Object} filter - Tag filter map (null for no tag filtering)
 * @param {boolean} internal - Internal status filter (undefined for no filtering)
 * @returns {Array} Filtered events
 */
internals.filterLogEvents = function (events, filter, internal) {

    const result = [];

    for (let i = 0; i < events.length; ++i) {
        const event = events[i];
        if (internal === undefined || event.internal === internal) {
            if (filter) {
                for (let j = 0; j < event.tags.length; ++j) {
                    if (filter[event.tags[j]]) {
                        result.push(event);
                        break;
                    }
                }
            }
            else {
                result.push(event);
            }
        }
    }

    return result;
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

    const filter = tags.length ? Hoek.mapToObject(tags) : null;
    return internals.filterLogEvents(this._logger, filter, internal);
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


/**
 * Validates path format
 * @param {string} path - The path to validate
 * @returns {boolean} True if path is valid
 */
internals.isValidPath = function (path) {

    return path && path[0] === '/';
};


/**
 * Applies route matching and CORS configuration
 * @param {Object} request - The request object
 * @param {Object} match - Route match result
 */
internals.applyRouteMatch = function (request, match) {

    if (!match.route.settings.isInternal ||
        request._allowInternals) {

        request._route = match.route;
        request.route = request._route.public;
    }

    request.params = match.params || {};
    request.paramsArray = match.paramsArray || [];

    if (request.route.settings.cors) {
        request.info.cors = {
            isOriginMatch: Cors.matchOrigin(request.headers.origin, request.route.settings.cors)
        };
    }
};


internals.Request.prototype._match = function (err) {

    // Undecorate request

    this.setUrl = undefined;
    this.setMethod = undefined;

    if (err) {
        return this._reply(err);
    }

    if (!internals.isValidPath(this.path)) {
        return this._reply(Boom.badRequest('Invalid path'));
    }

    // Lookup route

    const match = this.connection._router.route(this.method, this.path, this.info.hostname);
    internals.applyRouteMatch(this, match);

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


/**
 * Calculates remaining server timeout
 * @param {number} timeout - Original timeout value
 * @param {Object} bench - Benchmark object with elapsed() method
 * @returns {number} Remaining timeout in milliseconds
 */
internals.calculateRemainingTimeout = function (timeout, bench) {

    return Math.floor(timeout - bench.elapsed());
};


/**
 * Sets socket timeout if configured
 * @param {Object} request - The request object
 */
internals.setSocketTimeout = function (request) {

    if (request.raw.req.socket &&
        request.route.settings.timeout.socket !== undefined) {

        request.raw.req.socket.setTimeout(request.route.settings.timeout.socket || 0);
    }
};


/**
 * Handles server timeout event
 * @param {Object} request - The request object
 * @param {number} serverTimeout - Timeout duration
 */
internals.handleServerTimeout = function (request, serverTimeout) {

    request._log(['request', 'server', 'timeout', 'error'], { timeout: serverTimeout, elapsed: request._bench.elapsed() });
    request._reply(Boom.serverUnavailable());
};


internals.Request.prototype._setTimeouts = function () {

    internals.setSocketTimeout(this);

    let serverTimeout = this.route.settings.timeout.server;
    if (serverTimeout) {
        serverTimeout = internals.calculateRemainingTimeout(serverTimeout, this._bench);

        if (serverTimeout <= 0) {
            return internals.handleServerTimeout(this, serverTimeout);
        }

        const timeoutReply = () => {

            internals.handleServerTimeout(this, serverTimeout);
        };

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


/**
 * Checks if response is already closed
 * @param {Object} response - The response object
 * @returns {boolean} True if response is closed
 */
internals.isResponseClosed = function (response) {

    return response && response.closed;
};


/**
 * Handles response closure
 * @param {Object} request - The request object
 */
internals.handleResponseClosed = function (request) {

    if (request.response.end) {
        request.raw.res.end();
    }
};


/**
 * Determines if response needs wrapping
 * @param {*} exit - Exit value (response or error)
 * @returns {boolean} True if exit should be wrapped
 */
internals.shouldWrapExit = function (exit) {

    return exit && (!exit.response || !exit.response.closed);
};


/**
 * Transmits response and finalizes request
 * @param {Object} request - The request object
 * @param {Function} transmit - Transmit callback
 */
internals.invokePreResponse = function (request, transmit) {

    if (!request._route._extensions.onPreResponse.nodes) {
        return transmit();
    }

    return request._invoke(request._route._extensions.onPreResponse, transmit);
};


internals.Request.prototype._reply = function (exit) {

    if (this._isReplied) {                                  // Prevent any future responses to this request
        return;
    }

    this._isReplied = true;

    clearTimeout(this._serverTimeoutId);

    if (this._isBailed) {
        return this._finalize();
    }

    if (internals.isResponseClosed(this.response)) {
        internals.handleResponseClosed(this);
        return this._finalize();
    }

    if (exit) {                                             // Can be a valid response or error (if returned from an ext, already handled because this.response is also set)
        this._setResponse(Response.wrap(exit, this));
    }

    this._protect.reset();

    const transmit = (err) => {

        if (err) {                                          // Can be valid response or error
            this._setResponse(Response.wrap(err, this));
        }

        return Transmit.send(this, () => this._finalize());
    };

    return internals.invokePreResponse(this, transmit);
};


/**
 * Logs error response if applicable
 * @param {Object} request - The request object
 */
internals.logErrorResponse = function (request) {

    if (request.response &&
        request.response.statusCode === 500 &&
        request.response._error) {

        request.connection.emit('request-error', [request, request.response._error]);
        const tags = request.response._error.isDeveloperError ? ['internal', 'implementation', 'error'] : ['internal', 'error'];
        request._log(tags, request.response._error);
    }
};


/**
 * Handles tail completion
 * @param {Object} request - The request object
 */
internals.handleTailCompletion = function (request) {

    if (Object.keys(request._tails).length === 0) {
        request.connection.emit('tail', request);
    }
};


/**
 * Cleans up request listeners
 * @param {Object} request - The request object
 */
internals.cleanupRequestListeners = function (request) {

    request.raw.req.removeListener('end', request._onEnd);
    request.raw.req.removeListener('close', request._onClose);
    request.raw.req.removeListener('error', request._onError);
    request.raw.req.removeListener('error', request._onAbort);
};


/**
 * Closes response if applicable
 * @param {Object} request - The request object
 */
internals.closeResponse = function (request) {

    if (request.response &&
        request.response._close) {

        request.response._close();
    }
};


internals.Request.prototype._finalize = function () {

    this.info.responded = Date.now();

    internals.logErrorResponse(this);
    this.connection.emit('response', this);

    this._isFinalized = true;
    this.addTail = undefined;
    this.tail = undefined;

    internals.handleTailCompletion(this);

    // Cleanup

    internals.cleanupRequestListeners(this);
    internals.closeResponse(this);

    this._protect.logger = this.server;
};


/**
 * Determines if response should be closed
 * @param {Object} currentResponse - Current response object
 * @param {Object} newResponse - New response object
 * @returns {boolean} True if current response should be closed
 */
internals.shouldCloseResponse = function (currentResponse, newResponse) {

    return currentResponse &&
        !currentResponse.isBoom &&
        currentResponse !== newResponse &&
        (newResponse.isBoom || currentResponse.source !== newResponse.source);
};


internals.Request.prototype._setResponse = function (response) {

    if (internals.shouldCloseResponse(this.response, response)) {
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
            this._log(['tail', 'remove', 'error'], { name, id: tailId });             // Already removed
            return;
        }

        delete this._tails[tailId];

        if (Object.keys(this._tails).length === 0 &&
            this._isFinalized) {

            this._log(['tail', 'remove', 'last'], { name, id: tailId });
            this.connection.emit('tail', this);
        }
        else {
            this._log(['tail', 'remove'], { name, id: tailId });
        }
    };

    return drop;
};


internals.Request.prototype._setState = function (name, value, options) {          // options: see Defaults.state

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