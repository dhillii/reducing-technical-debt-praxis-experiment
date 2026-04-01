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
 * @param {internals.Request} request - The request object
 * @param {*} data - The data to log
 * @param {number} timestamp - The timestamp
 * @param {boolean} internal - Whether this is an internal log
 * @returns {Array|Function} Log update entry or function that returns it
 */
internals.createLogUpdate = function (request, data, timestamp, internal) {

    if (!internals.isDataFunction(data)) {
        return [request, { request: request.id, timestamp, tags: [], data, internal }];
    }

    return () => {

        return [request, { request: request.id, timestamp, tags: [], data: data(), internal }];
    };
};


internals.Request.prototype.log = function (tags, data, timestamp, _internal) {

    tags = [].concat(tags);
    timestamp = (timestamp ? (timestamp instanceof Date ? timestamp.getTime() : timestamp) : Date.now());
    const internal = !!_internal;

    let update = internals.createLogUpdate(this, data, timestamp, internal);

    if (this.route.settings.log) {
        if (internals.isDataFunction(data)) {
            update = update();
        }

        this._logger.push(update[1]);       // Add to request array
    }

    this.connection.emit({ name: internal ? 'request-internal' : 'request', tags }, update);
};


internals.Request.prototype._log = function (tags, data) {

    return this.log(tags, data, null, true);
};


/**
 * Filters logger events by tags and internal flag
 * @param {Array} events - The logger events to filter
 * @param {Object} filter - Tag filter map or null
 * @param {boolean} internal - Internal flag filter or undefined
 * @returns {Array} Filtered events
 */
internals.filterLogEvents = function (events, filter, internal) {

    const result = [];

    for (let i = 0; i < events.length; ++i) {
        const event = events[i];
        if (internal === undefined || event.internal === internal) {
            if (filter) {
                for (let j = 0; j < event.tags.length; ++j) {
                    const tag = event.tags[j];
                    if (filter[tag]) {
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
 * Validates the request path format
 * @param {string} path - The path to validate
 * @returns {boolean} True if path is valid
 */
internals.isValidPath = function (path) {

    return path && path[0] === '/';
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


/**
 * Applies socket timeout if configured
 * @param {internals.Request} request - The request object
 */
internals.applySocketTimeout = function (request) {

    if (request.raw.req.socket &&
        request.route.settings.timeout.socket !== undefined) {

        request.raw.req.socket.setTimeout(request.route.settings.timeout.socket || 0);
    }
};


/**
 * Applies server timeout if configured
 * @param {internals.Request} request - The request object
 */
internals.applyServerTimeout = function (request) {

    let serverTimeout = request.route.settings.timeout.server;
    if (!serverTimeout) {
        return;
    }

    serverTimeout = Math.floor(serverTimeout - request._bench.elapsed());
    const timeoutReply = () => {

        request._log(['request', 'server', 'timeout', 'error'], { timeout: serverTimeout, elapsed: request._bench.elapsed() });
        request._reply(Boom.serverUnavailable());
    };

    if (serverTimeout <= 0) {
        return timeoutReply();
    }

    request._serverTimeoutId = setTimeout(timeoutReply, serverTimeout);
};


internals.Request.prototype._setTimeouts = function () {

    internals.applySocketTimeout(this);
    internals.applyServerTimeout(this);
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
 * Checks if request is already replied or bailed
 * @param {internals.Request} request - The request object
 * @returns {boolean} True if request processing should stop
 */
internals.isRequestClosed = function (request) {

    return request._isBailed;
};


/**
 * Checks if response is closed
 * @param {internals.Request} request - The request object
 * @returns {boolean} True if response is closed
 */
internals.isResponseClosed = function (request) {

    return request.response && request.response.closed;
};


/**
 * Finalizes response if it's closed
 * @param {internals.Request} request - The request object
 * @returns {boolean} True if response was finalized
 */
internals.finalizeIfClosed = function (request) {

    if (!internals.isResponseClosed(request)) {
        return false;
    }

    if (request.response.end) {
        request.raw.res.end();
    }

    request._finalize();
    return true;
};


/**
 * Handles pre-response extensions or transmits response
 * @param {internals.Request} request - The request object
 * @param {Function} transmit - The transmit function
 */
internals.handlePreResponse = function (request, transmit) {

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

    if (internals.isRequestClosed(this)) {
        return this._finalize();
    }

    if (internals.finalizeIfClosed(this)) {
        return;
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

    internals.handlePreResponse(this, transmit);
};


/**
 * Checks if response has an error that should be logged
 * @param {internals.Request} request - The request object
 * @returns {boolean} True if error should be logged
 */
internals.shouldLogError = function (request) {

    return request.response &&
           request.response.statusCode === 500 &&
           request.response._error;
};


/**
 * Logs response error with appropriate tags
 * @param {internals.Request} request - The request object
 */
internals.logResponseError = function (request) {

    const error = request.response._error;
    const tags = error.isDeveloperError ? ['internal', 'implementation', 'error'] : ['internal', 'error'];
    request._log(tags, error);
};


/**
 * Emits tail event if no pending tails
 * @param {internals.Request} request - The request object
 */
internals.emitTailIfComplete = function (request) {

    if (Object.keys(request._tails).length === 0) {
        request.connection.emit('tail', request);
    }
};


/**
 * Removes all request event listeners
 * @param {internals.Request} request - The request object
 */
internals.removeRequestListeners = function (request) {

    request.raw.req.removeListener('end', request._onEnd);
    request.raw.req.removeListener('close', request._onClose);
    request.raw.req.removeListener('error', request._onError);
    request.raw.req.removeListener('error', request._onAbort);
};


internals.Request.prototype._finalize = function () {

    this.info.responded = Date.now();

    if (internals.shouldLogError(this)) {
        this.connection.emit('request-error', [this, this.response._error]);
        internals.logResponseError(this);
    }

    this.connection.emit('response', this);

    this._isFinalized = true;
    this.addTail = undefined;
    this.tail = undefined;

    internals.emitTailIfComplete(this);

    // Cleanup

    internals.removeRequestListeners(this);

    if (this.response &&
        this.response._close) {

        this.response._close();
    }

    this._protect.logger = this.server;
};


/**
 * Determines if old response should be closed before setting new one
 * @param {internals.Request} request - The request object
 * @param {Object} newResponse - The new response object
 * @returns {boolean} True if old response should be closed
 */
internals.shouldCloseOldResponse = function (request, newResponse) {

    return request.response &&
           !request.response.isBoom &&
           request.response !== newResponse &&
           (newResponse.isBoom || request.response.source !== newResponse.source);
};


internals.Request.prototype._setResponse = function (response) {

    if (internals.shouldCloseOldResponse(this, response)) {
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
```