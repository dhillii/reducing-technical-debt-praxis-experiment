```javascript
'use strict';

const Catbox = require('catbox');
const CatboxMemory = require('catbox-memory');
const Heavy = require('heavy');
const Hoek = require('hoek');
const Items = require('items');
const Mimos = require('mimos');
const Podium = require('podium');
const Somever = require('somever');

const Connection = require('./connection');
const Defaults = require('./defaults');
const Ext = require('./ext');
const Methods = require('./methods');
const Plugin = require('./plugin');
const Promises = require('./promises');
const Reply = require('./reply');
const Request = require('./request');
const Schema = require('./schema');


const internals = {};


exports = module.exports = internals.Server = function (options) {

    Hoek.assert(this instanceof internals.Server, 'Server must be instantiated using new');

    options = Schema.apply('server', options || {});

    this._settings = Hoek.applyToDefaultsWithShallow(Defaults.server, options, ['connections.routes.bind']);
    this._settings.connections = Hoek.applyToDefaultsWithShallow(Defaults.connection, this._settings.connections || {}, ['routes.bind']);
    this._settings.connections.routes.cors = Hoek.applyToDefaults(Defaults.cors, this._settings.connections.routes.cors);
    this._settings.connections.routes.security = Hoek.applyToDefaults(Defaults.security, this._settings.connections.routes.security);

    this._caches = {};
    this._handlers = {};
    this._methods = new Methods(this);

    this._events = new Podium([{ name: 'log', tags: true }, 'start', 'stop']);
    this._dependencies = [];
    this._registrations = {};
    this._heavy = new Heavy(this._settings.load);
    this._mime = new Mimos(this._settings.mime);
    this._replier = new Reply();
    this._requestor = new Request();
    this._decorations = {};
    this.decorations = { request: [], reply: [], server: [] };
    this._plugins = {};
    this._app = {};
    this._registring = false;
    this._state = 'stopped';

    this._extensionsSeq = 0;
    this._extensions = {
        onPreStart: new Ext('onPreStart', this),
        onPostStart: new Ext('onPostStart', this),
        onPreStop: new Ext('onPreStop', this),
        onPostStop: new Ext('onPostStop', this)
    };

    if (options.cache) {
        this._createCache(options.cache);
    }

    if (!this._caches._default) {
        this._createCache([{ engine: CatboxMemory }]);
    }

    Plugin.call(this, this, [], '', null);

    this._setupDebugLogging();
};

Hoek.inherits(internals.Server, Plugin);


/**
 * Configure debug logging for server events
 */
internals.Server.prototype._setupDebugLogging = function () {

    if (!this._settings.debug) {
        return;
    }

    const debug = (request, event) => {
        const data = event.data;
        console.error('Debug:', event.tags.join(', '), (data ? '\n    ' + (data.stack || (typeof data === 'object' ? Hoek.stringify(data) : data)) : ''));
    };

    this._setupDebugLogEvents(debug);
    this._setupDebugRequestEvents(debug);
};


/**
 * Setup debug logging for server log events
 */
internals.Server.prototype._setupDebugLogEvents = function (debug) {

    if (!this._settings.debug.log) {
        return;
    }

    const filter = this._settings.debug.log.some((tag) => tag === '*') ? undefined : this._settings.debug.log;
    this._events.on({ name: 'log', filter }, (event) => debug(null, event));
};


/**
 * Setup debug logging for request events
 */
internals.Server.prototype._setupDebugRequestEvents = function (debug) {

    if (!this._settings.debug.request) {
        return;
    }

    const filter = this._settings.debug.request.some((tag) => tag === '*') ? undefined : this._settings.debug.request;
    this.on({ name: 'request', filter }, debug);
    this.on({ name: 'request-internal', filter }, debug);
};


internals.Server.prototype._createCache = function (options, _callback) {

    Hoek.assert(this._state !== 'initializing', 'Cannot provision server cache while server is initializing');

    options = Schema.apply('cache', options);

    const added = [];
    for (let i = 0; i < options.length; ++i) {
        const client = this._createCacheClient(options[i]);
        const name = options[i].name || '_default';
        
        Hoek.assert(!this._caches[name], 'Cannot configure the same cache more than once: ', name === '_default' ? 'default cache' : name);

        this._caches[name] = {
            client,
            segments: {},
            shared: options[i].shared || false
        };

        added.push(client);
    }

    if (!_callback) {
        return;
    }

    this._startCaches(added, _callback);
};


/**
 * Create a cache client from configuration
 */
internals.Server.prototype._createCacheClient = function (config) {

    if (typeof config === 'function') {
        return new Catbox.Client(config);
    }

    if (typeof config.engine === 'object') {
        return new Catbox.Client(config.engine);
    }

    const settings = Hoek.clone(config);
    settings.partition = settings.partition || 'hapi-cache';
    delete settings.name;
    delete settings.engine;
    delete settings.shared;

    return new Catbox.Client(config.engine, settings);
};


/**
 * Start cache clients if server is in appropriate state
 */
internals.Server.prototype._startCaches = function (added, _callback) {

    const shouldStartCaches = ['initialized', 'starting', 'started'].indexOf(this._state) !== -1;

    if (shouldStartCaches) {
        const each = (client, next) => client.start(next);
        return Items.parallel(added, each, _callback);
    }

    return Hoek.nextTick(_callback)();
};


internals.Server.prototype.connection = function (options) {

    const root = this.root;

    const connections = [];
    [].concat(options).forEach((item) => {

        let settings = Hoek.applyToDefaultsWithShallow(root._settings.connections, item || {}, ['listener', 'routes.bind']);
        settings.routes.cors = Hoek.applyToDefaults(root._settings.connections.routes.cors || Defaults.cors, settings.routes.cors) || false;
        settings.routes.security = Hoek.applyToDefaults(root._settings.connections.routes.security || Defaults.security, settings.routes.security);

        settings = Schema.apply('connection', settings);

        const connection = new Connection(root, settings);
        root.connections.push(connection);
        root.registerPodium(connection);
        root._single();

        this._registerConnectionPlugins(root, connection);
        connections.push(connection);
    });

    return this._clone(connections);
};


/**
 * Register existing plugins with a new connection
 */
internals.Server.prototype._registerConnectionPlugins = function (root, connection) {

    const registrations = Object.keys(root._registrations);
    for (let i = 0; i < registrations.length; ++i) {
        const name = registrations[i];
        connection.registrations[name] = root._registrations[name];
    }
};


internals.Server.prototype.start = function (callback) {

    if (!callback) {
        return Promises.wrap(this, this.start);
    }

    Hoek.assert(typeof callback === 'function', 'Missing required start callback function');
    const nextTickCallback = Hoek.nextTick(callback);

    if (!this.connections.length) {
        return nextTickCallback(new Error('No connections to start'));
    }

    const error = this._validateStartState();
    if (error) {
        return nextTickCallback(error);
    }

    this._executeStart(callback, nextTickCallback);
};


/**
 * Validate server state for starting
 */
internals.Server.prototype._validateStartState = function () {

    if (this._state === 'initialized' || this._state === 'started') {
        return this._validateDeps();
    }

    return null;
};


/**
 * Execute start based on current server state
 */
internals.Server.prototype._executeStart = function (callback, nextTickCallback) {

    if (this._state === 'initialized') {
        return this._start(callback);
    }

    if (this._state === 'started') {
        const each = (connection, next) => connection._start(next);
        return Items.parallel(this.connections, each, nextTickCallback);
    }

    if (this._state !== 'stopped') {
        return nextTickCallback(new Error('Cannot start server while it is in ' + this._state + ' state'));
    }

    this.initialize((err) => {
        if (err) {
            return callback(err);
        }
        this._start(callback);
    });
};


internals.Server.prototype.initialize = function (callback) {

    if (!callback) {
        return Promises.wrap(this, this.initialize);
    }

    Hoek.assert(typeof callback === 'function', 'Missing required start callback function');
    const nextTickCallback = Hoek.nextTick(callback);

    const validationError = this._validateInitializeState();
    if (validationError) {
        return nextTickCallback(validationError);
    }

    this._executeInitialize(callback);
};


/**
 * Validate server state for initialization
 */
internals.Server.prototype._validateInitializeState = function () {

    if (this._registring) {
        return new Error('Cannot start server before plugins finished registration');
    }

    if (this._state === 'initialized') {
        return null;
    }

    if (this._state !== 'stopped') {
        return new Error('Cannot initialize server while it is in ' + this._state + ' state');
    }

    return this._validateDeps();
};


/**
 * Execute initialization sequence
 */
internals.Server.prototype._executeInitialize = function (callback) {

    this._state = 'initializing';

    const caches = Object.keys(this._caches);
    const each = (cache, next) => this._caches[cache].client.start(next);
    
    Items.parallel(caches, each, (err) => {
        this._handleCacheStartResult(err, callback);
    });
};


/**
 * Handle cache startup result and continue initialization
 */
internals.Server.prototype._handleCacheStartResult = function (err, callback) {

    if (err) {
        this._state = 'invalid';
        return callback(err);
    }

    this._invoke('onPreStart', (err) => {
        this._handlePreStartResult(err, callback);
    });
};


/**
 * Handle onPreStart hook result
 */
internals.Server.prototype._handlePreStartResult = function (err, callback) {

    if (err) {
        this._state = 'invalid';
        return callback(err);
    }

    this._heavy.start();
    this._state = 'initialized';
    return callback();
};


/**
 * Validate dependency versions and registrations
 */
internals.Server.prototype._validateDeps = function () {

    for (let i = 0; i < this._dependencies.length; ++i) {
        const dependency = this._dependencies[i];
        const error = this._validateDependency(dependency);
        if (error) {
            return error;
        }
    }

    return null;
};


/**
 * Validate a single dependency
 */
internals.Server.prototype._validateDependency = function (dependency) {

    if (dependency.connections) {
        return this._validateConnectionDependency(dependency);
    }

    return this._validateServerDependency(dependency);
};


/**
 * Validate dependency for specific connections
 */
internals.Server.prototype._validateConnectionDependency = function (dependency) {

    for (let j = 0; j < dependency.connections.length; ++j) {
        const connection = dependency.connections[j];
        const error = this._validateConnectionDeps(dependency, connection);
        if (error) {
            return error;
        }
    }

    return null;
};


/**
 * Validate dependencies for a specific connection
 */
internals.Server.prototype._validateConnectionDeps = function (dependency, connection) {

    const deps = Object.keys(dependency.deps);
    for (let k = 0; k < deps.length; ++k) {
        const dep = deps[k];
        const version = dependency.deps[dep];

        if (!connection.registrations[dep]) {
            return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep + ' in connection: ' + connection.info.uri);
        }

        if (!this._isVersionMatch(version, connection.registrations[dep].version)) {
            return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + connection.registrations[dep].version + ' in connection: ' + connection.info.uri);
        }
    }

    return null;
};


/**
 * Validate server-level dependency
 */
internals.Server.prototype._validateServerDependency = function (dependency) {

    const deps = Object.keys(dependency.deps);
    for (let j = 0; j < deps.length; ++j) {
        const dep = deps[j];
        const version = dependency.deps[dep];

        if (!this._registrations[dep]) {
            return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep);
        }

        if (!this._isVersionMatch(version, this._registrations[dep].version)) {
            return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + this._registrations[dep].version);
        }
    }

    return null;
};


/**
 * Check if version matches requirement
 */
internals.Server.prototype._isVersionMatch = function (required, actual) {

    if (required === '*') {
        return true;
    }

    return Somever.match(actual, required);
};


internals.Server.prototype._start = function (callback) {

    this._state = 'starting';

    const each = (connection, next) => connection._start(next);
    Items.parallel(this.connections, each, (err) => {
        this._handleConnectionsStartResult(err, callback);
    });
};


/**
 * Handle connections startup result
 */
internals.Server.prototype._handleConnectionsStartResult = function (err, callback) {

    if (err) {
        this._state = 'invalid';
        return Hoek.nextTick(callback)(err);
    }

    this._events.emit('start', null, () => {
        this._invoke('onPostStart', (err) => {
            this._handlePostStartResult(err, callback);
        });
    });
};


/**
 * Handle onPostStart hook result
 */
internals.Server.prototype._handlePostStartResult = function (err, callback) {

    if (err) {
        this._state = 'invalid';
        return callback(err);
    }

    this._state = 'started';
    return callback();
};


internals.Server.prototype.stop = function (/* [options], callback */) {

    const args = arguments.length;
    const lastArg = arguments[args - 1];
    const callback = (!args ? null : (typeof lastArg === 'function' ? lastArg : null));
    const options = (!args ? {} : (args === 1 ? (callback ? {} : arguments[0]) : arguments[0]));

    if (!callback) {
        return Promises.wrap(this, this.stop, [options]);
    }

    options.timeout = options.timeout || 5000;

    if (!this._isValidStopState()) {
        return Hoek.nextTick(callback)(new Error('Cannot stop server while in ' + this._state + ' state'));
    }

    this._executeStop(options, callback);
};


/**
 * Check if server is in valid state for stopping
 */
internals.Server.prototype._isValidStopState = function () {

    const validStates = ['stopped', 'initialized', 'started', 'invalid'];
    return validStates.indexOf(this._state) !== -1;
};


/**
 * Execute stop sequence
 */
internals.Server.prototype._executeStop = function (options, callback) {

    this._state = 'stopping';

    this._invoke('onPreStop', (err) => {
        this._handlePreStopResult(err, options, callback);
    });
};


/**
 * Handle onPreStop hook result
 */
internals.Server.prototype._handlePreStopResult = function (err, options, callback) {

    if (err) {
        this._state = 'invalid';
        return callback(err);
    }

    const each = (connection, next) => connection._stop(options, next);
    Items.parallel(this.connections, each, (err) => {
        this._handleConnectionsStopResult(err, callback);
    });
};


/**
 * Handle connections stop result
 */
internals.Server.prototype._handleConnectionsStopResult = function (err, callback) {

    if (err) {
        this._state = 'invalid';
        return callback(err);
    }

    this._stopCaches();

    this._events.emit('stop', null, () => {
        this._heavy.stop();
        this._invoke('onPostStop', (err) => {
            this._handlePostStopResult(err, callback);
        });
    });
};


/**
 * Stop all cache clients
 */
internals.Server.prototype._stopCaches = function () {

    const caches = Object.keys(this._caches);
    for (let i = 0; i < caches.length; ++i) {
        this._caches[caches[i]].client.stop();
    }
};


/**
 * Handle onPostStop hook result
 */
internals.Server.prototype._handlePostStopResult = function (err, callback) {

    if (err) {
        this._state = 'invalid';
        return callback(err);
    }

    this._state = 'stopped';
    return callback();
};


internals.Server.prototype._invoke = function (type, next) {

    const exts = this._extensions[type];
    if (!exts.nodes) {
        return next();
    }

    Items.serial(exts.nodes, (ext, nextExt) => {

        const bind = (ext.bind || ext.plugin.realm.settings.bind);
        ext.func.call(bind, ext.plugin._select(), nextExt);
    }, next);
};
```