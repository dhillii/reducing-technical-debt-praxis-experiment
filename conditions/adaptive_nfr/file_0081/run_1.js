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

    const validationError = this._getStartValidationError();
    if (validationError) {
        return nextTickCallback(validationError);
    }

    this._executeStart(callback, nextTickCallback);
};


/**
 * Get validation error for start operation if applicable
 */
internals.Server.prototype._getStartValidationError = function () {

    const isInitializedOrStarted = this._state === 'initialized' || this._state === 'started';

    if (!isInitializedOrStarted) {
        return null;
    }

    return this._validateDeps();
};


/**
 * Execute start operation based on current state
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

    const initError = this._getInitializeError();
    if (initError) {
        return nextTickCallback(initError);
    }

    this._state = 'initializing';
    this._performInitialization(callback);
};


/**
 * Get validation error for initialize operation if applicable
 */
internals.Server.prototype._getInitializeError = function () {

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
 * Perform server initialization steps
 */
internals.Server.prototype._performInitialization = function (callback) {

    const caches = Object.keys(this._caches);
    const each = (cache, next) => this._caches[cache].client.start(next);
    
    Items.parallel(caches, each, (err) => {
        if (err) {
            this._state = 'invalid';
            return callback(err);
        }

        this._invokePreStartHooks(callback);
    });
};


/**
 * Invoke onPreStart hooks during initialization
 */
internals.Server.prototype._invokePreStartHooks = function (callback) {

    this._invoke('onPreStart', (err) => {
        if (err) {
            this._state = 'invalid';
            return callback(err);
        }

        this._heavy.start();
        this._state = 'initialized';
        return callback();
    });
};


/**
 * Check if dependency is registered in connection
 */
internals.Server.prototype._isDependencyRegisteredInConnection = function (connection, dep) {

    return !!connection.registrations[dep];
};


/**
 * Check if dependency version matches requirement
 */
internals.Server.prototype._isDependencyVersionValid = function (registeredVersion, requiredVersion) {

    if (requiredVersion === '*') {
        return true;
    }

    return Somever.match(registeredVersion, requiredVersion);
};


/**
 * Validate dependency for connection
 */
internals.Server.prototype._validateConnectionDependency = function (dependency, connection, dep, version) {

    if (!this._isDependencyRegisteredInConnection(connection, dep)) {
        return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep + ' in connection: ' + connection.info.uri);
    }

    if (!this._isDependencyVersionValid(connection.registrations[dep].version, version)) {
        return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + connection.registrations[dep].version + ' in connection: ' + connection.info.uri);
    }

    return null;
};


/**
 * Validate dependency for server
 */
internals.Server.prototype._validateServerDependency = function (dependency, dep, version) {

    if (!this._registrations[dep]) {
        return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep);
    }

    if (!this._isDependencyVersionValid(this._registrations[dep].version, version)) {
        return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + this._registrations[dep].version);
    }

    return null;
};


/**
 * Validate all dependencies for a single dependency entry
 */
internals.Server.prototype._validateDependencyEntry = function (dependency) {

    if (dependency.connections) {
        return this._validateConnectionDependencies(dependency);
    }

    return this._validateServerDependencies(dependency);
};


/**
 * Validate dependencies across all connections
 */
internals.Server.prototype._validateConnectionDependencies = function (dependency) {

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
 * Validate all deps for a specific connection
 */
internals.Server.prototype._validateConnectionDeps = function (dependency, connection) {

    const deps = Object.keys(dependency.deps);
    for (let k = 0; k < deps.length; ++k) {
        const dep = deps[k];
        const version = dependency.deps[dep];
        const error = this._validateConnectionDependency(dependency, connection, dep, version);
        if (error) {
            return error;
        }
    }

    return null;
};


/**
 * Validate server-level dependencies
 */
internals.Server.prototype._validateServerDependencies = function (dependency) {

    const deps = Object.keys(dependency.deps);
    for (let j = 0; j < deps.length; ++j) {
        const dep = deps[j];
        const version = dependency.deps[dep];
        const error = this._validateServerDependency(dependency, dep, version);
        if (error) {
            return error;
        }
    }

    return null;
};


internals.Server.prototype._validateDeps = function () {

    for (let i = 0; i < this._dependencies.length; ++i) {
        const error = this._validateDependencyEntry(this._dependencies[i]);
        if (error) {
            return error;
        }
    }

    return null;
};


internals.Server.prototype._start = function (callback) {

    this._state = 'starting';

    const each = (connection, next) => connection._start(next);
    Items.parallel(this.connections, each, (err) => {

        if (err) {
            this._state = 'invalid';
            return Hoek.nextTick(callback)(err);
        }

        this._events.emit('start', null, () => {
            this._invokePostStartHooks(callback);
        });
    });
};


/**
 * Invoke onPostStart hooks after server start
 */
internals.Server.prototype._invokePostStartHooks = function (callback) {