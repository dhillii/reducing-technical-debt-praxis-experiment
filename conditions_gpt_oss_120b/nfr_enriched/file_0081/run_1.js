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
        this._createCache([{ engine: CatboxMemory }]); // default memory cache
    }

    Plugin.call(this, this, [], '', null);
    this._setupDebug();
};

Hoek.inherits(internals.Server, Plugin);

/* -------------------------------------------------------------------------- */
/* Debug setup                                                               */
/* -------------------------------------------------------------------------- */
internals.Server.prototype._setupDebug = function () {
    if (!this._settings.debug) return;

    const debug = (request, event) => {
        const data = event.data;
        console.error('Debug:', event.tags.join(', '), (data ? '\n    ' + (data.stack || (typeof data === 'object' ? Hoek.stringify(data) : data)) : ''));
    };

    if (this._settings.debug.log) {
        const filter = this._settings.debug.log.includes('*') ? undefined : this._settings.debug.log;
        this._events.on({ name: 'log', filter }, (event) => debug(null, event));
    }

    if (this._settings.debug.request) {
        const filter = this._settings.debug.request.includes('*') ? undefined : this._settings.debug.request;
        this.on({ name: 'request', filter }, debug);
        this.on({ name: 'request-internal', filter }, debug);
    }
};

/* -------------------------------------------------------------------------- */
/* Cache creation                                                             */
/* -------------------------------------------------------------------------- */
internals.Server.prototype._createCache = function (options, _callback) {
    Hoek.assert(this._state !== 'initializing', 'Cannot provision server cache while server is initializing');
    options = Schema.apply('cache', options);
    const added = [];

    for (let i = 0; i < options.length; ++i) {
        let config = typeof options[i] === 'function' ? { engine: options[i] } : options[i];
        const name = config.name || '_default';
        Hoek.assert(!this._caches[name], 'Cannot configure the same cache more than once: ', name === '_default' ? 'default cache' : name);
        const client = this._createCacheClient(config);
        this._caches[name] = { client, segments: {}, shared: config.shared || false };
        added.push(client);
    }

    if (!_callback) return;
    if (['initialized', 'starting', 'started'].includes(this._state)) {
        return Items.parallel(added, (c, n) => c.start(n), _callback);
    }
    return Hoek.nextTick(_callback)();
};

internals.Server.prototype._createCacheClient = function (config) {
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

/* -------------------------------------------------------------------------- */
/* Connection handling                                                        */
/* -------------------------------------------------------------------------- */
internals.Server.prototype.connection = function (options) {
    const root = this.root;
    const connections = [];

    [].concat(options).forEach((item) => {
        const settings = this._prepareConnectionSettings(root, item);
        const connection = new Connection(root, settings);
        root.connections.push(connection);
        root.registerPodium(connection);
        root._single();
        this._applyPendingRegistrations(connection);
        connections.push(connection);
    });

    return this._clone(connections);
};

internals.Server.prototype._prepareConnectionSettings = function (root, item) {
    let settings = Hoek.applyToDefaultsWithShallow(root._settings.connections, item || {}, ['listener', 'routes.bind']);
    settings.routes.cors = Hoek.applyToDefaults(root._settings.connections.routes.cors || Defaults.cors, settings.routes.cors) || false;
    settings.routes.security = Hoek.applyToDefaults(root._settings.connections.routes.security || Defaults.security, settings.routes.security);
    return Schema.apply('connection', settings);
};

internals.Server.prototype._applyPendingRegistrations = function (connection) {
    const registrations = Object.keys(this._registrations);
    for (let i = 0; i < registrations.length; ++i) {
        const name = registrations[i];
        connection.registrations[name] = this._registrations[name];
    }
};

/* -------------------------------------------------------------------------- */
/* Server start                                                               */
/* -------------------------------------------------------------------------- */
internals.Server.prototype.start = function (callback) {
    if (!callback) return Promises.wrap(this, this.start);
    Hoek.assert(typeof callback === 'function', 'Missing required start callback function');
    const nextTick = Hoek.nextTick(callback);

    if (!this.connections.length) return nextTick(new Error('No connections to start'));
    if (this._state === 'initialized' || this._state === 'started') return this._handleStartWhenReady(nextTick);
    if (this._state !== 'stopped') return nextTick(new Error('Cannot start server while it is in ' + this._state + ' state'));

    this.initialize((err) => {
        if (err) return callback(err);
        this._start(callback);
    });
};

internals.Server.prototype._handleStartWhenReady = function (nextTick) {
    const error = this._validateDeps();
    if (error) return nextTick(error);
    if (this._state === 'initialized') return this._start(nextTick);
    const each = (c, n) => c._start(n);
    return Items.parallel(this.connections, each, nextTick);
};

/* -------------------------------------------------------------------------- */
/* Server initialize                                                          */
/* -------------------------------------------------------------------------- */
internals.Server.prototype.initialize = function (callback) {
    if (!callback) return Promises.wrap(this, this.initialize);
    Hoek.assert(typeof callback === 'function', 'Missing required start callback function');
    const nextTick = Hoek.nextTick(callback);

    if (this._registring) return nextTick(new Error('Cannot start server before plugins finished registration'));
    if (this._state === 'initialized') return nextTick();
    if (this._state !== 'stopped') return nextTick(new Error('Cannot initialize server while it is in ' + this._state + ' state'));

    const depError = this._validateDeps();
    if (depError) return nextTick(depError);

    this._state = 'initializing';
    this._startAllCaches((err) => {
        if (err) {
            this._state = 'invalid';
            return callback(err);
        }
        this._invoke('onPreStart', (err) => {
            if (err) {
                this._state = 'invalid';
                return callback(err);
            }
            this._heavy.start();
            this._state = 'initialized';
            return callback();
        });
    });
};

internals.Server.prototype._startAllCaches = function (cb) {
    const caches = Object.keys(this._caches);
    Items.parallel(caches, (name, next) => this._caches[name].client.start(next), cb);
};

/* -------------------------------------------------------------------------- */
/* Dependency validation                                                      */
/* -------------------------------------------------------------------------- */
internals.Server.prototype._validateDeps = function () {
    for (let i = 0; i < this._dependencies.length; ++i) {
        const dep = this._dependencies[i];
        if (dep.connections) {
            const err = this._validateDepPerConnection(dep);
            if (err) return err;
        } else {
            const err = this._validateDepGlobal(dep);
            if (err) return err;
        }
    }
    return null;
};

internals.Server.prototype._validateDepPerConnection = function (dependency) {
    for (let i = 0; i < dependency.connections.length; ++i) {
        const connection = dependency.connections[i];
        const err = this._checkDependencyVersions(connection.registrations, dependency, connection.info.uri);
        if (err) return err;
    }
    return null;
};

internals.Server.prototype._validateDepGlobal = function (dependency) {
    return this._checkDependencyVersions(this._registrations, dependency);
};

internals.Server.prototype._checkDependencyVersions = function (registrations, dependency, uri) {
    const deps = Object.keys(dependency.deps);
    for (let i = 0; i < deps.length; ++i) {
        const name = deps[i];
        const required = dependency.deps[name];
        const registered = registrations[name];
        if (!registered) {
            return new Error(`Plugin ${dependency.plugin} missing dependency ${name}` + (uri ? ` in connection: ${uri}` : ''));
        }
        if (required !== '*' && !Somever.match(registered.version, required)) {
            return new Error(`Plugin ${dependency.plugin} requires ${name} version ${required} but found ${registered.version}` + (uri ? ` in connection: ${uri}` : ''));
        }
    }
    return null;
};

/* -------------------------------------------------------------------------- */
/* Server start internal                                                       */
/* -------------------------------------------------------------------------- */
internals.Server.prototype._start = function (callback) {
    this._state = 'starting';
    const each = (c, n) => c._start(n);
    Items.parallel(this.connections, each, (err) => {
        if (err) {
            this._state = 'invalid';
            return Hoek.nextTick(callback)(err);
        }
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
    });
};

/* -------------------------------------------------------------------------- */
/* Server stop                                                                */
/* -------------------------------------------------------------------------- */
internals.Server.prototype.stop = function () {
    const args = arguments.length;
    const lastArg = arguments[args - 1];
    const callback = (!args ? null : (typeof lastArg === 'function' ? lastArg : null));
    const options = (!args ? {} : (args === 1 ? (callback ? {} : arguments[0]) : arguments[0]));

    if (!callback) return Promises.wrap(this, this.stop, [options]);
    options.timeout = options.timeout || 5000;

    if (!['stopped', 'initialized', 'started', 'invalid'].includes(this._state)) {
        return Hoek.nextTick(callback)(new Error('Cannot stop server while in ' + this._state + ' state'));
    }

    this._state = 'stopping';
    this._invoke('onPreStop', (err) => {
        if (err) {
            this._state = 'invalid';
            return callback(err);
        }
        this._stopAllConnections(options, (err) => {
            if (err) {
                this._state = 'invalid';
                return callback(err);
            }
            this._stopAllCaches();
            this._events.emit('stop', null, () => {
                this._heavy.stop();
                this._invoke('onPostStop', (err) => {
                    if (err) {
                        this._state = 'invalid';
                        return callback(err);
                    }
                    this._state = 'stopped';
                    return callback();
                });
            });
        });
    });
};

internals.Server.prototype._stopAllConnections = function (options, cb) {
    const each = (c, n) => c._stop(options, n);
    Items.parallel(this.connections, each, cb);
};

internals.Server.prototype._stopAllCaches = function () {
    const caches = Object.keys(this._caches);
    for (let i = 0; i < caches.length; ++i) {
        this._caches[caches[i]].client.stop();
    }
};

/* -------------------------------------------------------------------------- */
/* Extension invocation                                                       */
/* -------------------------------------------------------------------------- */
internals.Server.prototype._invoke = function (type, next) {
    const exts = this._extensions[type];
    if (!exts.nodes) return next();

    Items.serial(exts.nodes, (ext, nextExt) => {
        const bind = ext.bind || ext.plugin.realm.settings.bind;
        ext.func.call(bind, ext.plugin._select(), nextExt);
    }, next);
};
```