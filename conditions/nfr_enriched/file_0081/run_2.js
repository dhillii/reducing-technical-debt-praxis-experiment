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


internals.Server.prototype._setupDebugLogging = function () {

    if (!this._settings.debug) {
        return;
    }

    const debug = (request, event) => {
        const data = event.data;
        console.error('Debug:', event.tags.join(', '), (data ? '\n    ' + (data.stack || (typeof data === 'object' ? Hoek.stringify(data) : data)) : ''));
    };

    if (this._settings.debug.log) {
        this._setupDebugLogFilter(debug);
    }

    if (this._settings.debug.request) {
        this._setupDebugRequestFilter(debug);
    }
};


internals.Server.prototype._setupDebugLogFilter = function (debug) {

    const filter = this._settings.debug.log.some((tag) => tag === '*') ? undefined : this._settings.debug.log;
    this._events.on({ name: 'log', filter }, (event) => debug(null, event));
};


internals.Server.prototype._setupDebugRequestFilter = function (debug) {

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


internals.Server.prototype._startCaches = function (added, callback) {

    if (['initialized', 'starting', 'started'].indexOf(this._state) !== -1) {
        const each = (client, next) => client.start(next);
        return Items.parallel(added, each, callback);
    }

    return Hoek.nextTick(callback)();
};


internals.Server.prototype.connection = function (options) {

    const root = this.root;

    const connections = [];
    [].concat(options).forEach((item) => {
        const connection = this._createConnection(root, item);
        connections.push(connection);
    });

    return this._clone(connections);
};


internals.Server.prototype._createConnection = function (root, item) {

    let settings = Hoek.applyToDefaultsWithShallow(root._settings.connections, item || {}, ['listener', 'routes.bind']);
    settings.routes.cors = Hoek.applyToDefaults(root._settings.connections.routes.cors || Defaults.cors, settings.routes.cors) || false;
    settings.routes.security = Hoek.applyToDefaults(root._settings.connections.routes.security || Defaults.security, settings.routes.security);

    settings = Schema.apply('connection', settings);

    const connection = new Connection(root, settings);
    root.connections.push(connection);
    root.registerPodium(connection);
    root._single();

    this._copyRegistrations(root, connection);

    return connection;
};


internals.Server.prototype._copyRegistrations = function (root, connection) {

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

    const validationError = this._validateStartState();
    if (validationError) {
        return nextTickCallback(validationError);
    }

    if (this._state === 'initialized') {
        return this._start(callback);
    }

    if (this._state === 'started') {
        return this._restartConnections(nextTickCallback);
    }

    this.initialize((err) => {
        if (err) {
            return callback(err);
        }
        this._start(callback);
    });
};


internals.Server.prototype._validateStartState = function () {

    if (!this.connections.length) {
        return new Error('No connections to start');
    }

    if (this._state === 'initialized' || this._state === 'started') {
        return this._validateDeps();
    }

    if (this._state !== 'stopped') {
        return new Error('Cannot start server while it is in ' + this._state + ' state');
    }

    return null;
};


internals.Server.prototype._restartConnections = function (callback) {

    const each = (connection, next) => connection._start(next);
    return Items.parallel(this.connections, each, callback);
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

    if (this._state === 'initialized') {
        return nextTickCallback();
    }

    this._state = 'initializing';
    this._initializeCaches(callback);
};


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


internals.Server.prototype._initializeCaches = function (callback) {

    const caches = Object.keys(this._caches);
    const each = (cache, next) => this._caches[cache].client.start(next);
    Items.parallel(caches, each, (err) => {
        if (err) {
            this._state = 'invalid';
            return callback(err);
        }

        this._invokePreStart(callback);
    });
};


internals.Server.prototype._invokePreStart = function (callback) {

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


internals.Server.prototype._validateDependency = function (dependency) {

    if (dependency.connections) {
        return this._validateConnectionDependency(dependency);
    }

    return this._validateServerDependency(dependency);
};


internals.Server.prototype._validateConnectionDependency = function (dependency) {

    for (let j = 0; j < dependency.connections.length; ++j) {
        const connection = dependency.connections[j];
        const error = this._validateDependencyVersions(dependency, connection.registrations, connection.info.uri);
        if (error) {
            return error;
        }
    }

    return null;
};


internals.Server.prototype._validateServerDependency = function (dependency) {

    return this._validateDependencyVersions(dependency, this._registrations, null);
};


internals.Server.prototype._validateDependencyVersions = function (dependency, registrations, connectionUri) {

    const deps = Object.keys(dependency.deps);
    for (let k = 0; k < deps.length; ++k) {
        const dep = deps[k];
        const version = dependency.deps[dep];

        if (!registrations[dep]) {
            const location = connectionUri ? ' in connection: ' + connectionUri : '';
            return new Error('Plugin ' + dependency.plugin + ' missing dependency ' + dep + location);
        }

        if (version !== '*' && !Somever.match(registrations[dep].version, version)) {
            const location = connectionUri ? ' in connection: ' + connectionUri : '';
            return new Error('Plugin ' + dependency.plugin + ' requires ' + dep + ' version ' + version + ' but found ' + registrations[dep].version + location);
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

        this._emitStartEvent(callback);
    });
};


internals.Server.prototype._emitStartEvent = function (callback) {

    this._events.emit('start', null, () => {
        this._invoke('onPostStart', (err) => {
            if (err) {
                this._state = 'invalid';
                return callback(err);
            }

            this._state = 'started';
            return callback();
        });
    });
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

    const validationError = this._validateStopState();
    if (validationError) {
        return Hoek.nextTick(callback)(validationError);
    }

    this._state = 'stopping';
    this._invokePreStop(options, callback);
};


internals.Server.prototype._validateStopState = function () {

    if (['stopped', 'initialized', 'started', 'invalid'].indexOf(this._state) === -1) {
        return new Error('Cannot stop server while in ' + this._state + ' state');
    }

    return null;
};


internals.Server.prototype._invokePreStop = function (options, callback) {

    this._invoke('onPreStop', (err) => {
        if (err) {
            this._state = 'invalid';
            return callback(err);
        }

        this._stopConnections(options, callback);
    });
};


internals.Server.prototype._stopConnections = function (options, callback) {

    const each = (connection, next) => connection._stop(options, next);
    Items.parallel(this.connections, each, (err) => {
        if (err) {
            this._state = 'invalid';
            return callback(err);
        }

        this._stopCaches(callback);
    });
};


internals.Server.prototype._stopCaches = function (callback) {

    const caches = Object.keys(this._caches);
    for (let i = 0; i < caches.length; ++i) {
        this._caches[caches[i]].client.stop();
    }

    this._emitStopEvent(callback);
};


internals.Server.prototype._emitStopEvent = function (callback) {

    this._events.emit('stop', null, () => {
        this._heavy.stop();
        this._invokePostStop(callback);
    });
};


internals.Server.prototype._invokePostStop = function (callback) {

    this._invoke('onPostStop', (err) => {
        if (err) {
            this._state = 'invalid';
            return callback(err);
        }

        this._state = 'stopped';
        return callback();
    });
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