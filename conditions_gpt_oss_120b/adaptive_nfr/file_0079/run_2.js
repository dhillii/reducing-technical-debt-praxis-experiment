'use strict';

const Catbox = require('catbox');
const Hoek = require('hoek');
const Items = require('items');
const Podium = require('podium');
const Somever = require('somever');

const Connection = require('./connection');
const Ext = require('./ext');
const Package = require('../package.json');
const Promises = require('./promises');
const Schema = require('./schema');

const internals = {};

exports = module.exports = internals.Plugin = function (server, connections, env, parent) { // env can be a realm or plugin name

    Podium.call(this, [connections && connections.length ? connections : Connection._events, server._events]);

    this._parent = parent;

    // Public interface
    this.root = server;
    this.app = this.root._app;
    this.connections = connections;
    this.load = this.root._heavy.load;
    this.methods = this.root._methods.methods;
    this.mime = this.root._mime;
    this.plugins = this.root._plugins;
    this.settings = this.root._settings;
    this.version = Package.version;

    this.realm = typeof env !== 'string' ? env : {
        _extensions: {
            onPreAuth: new Ext('onPreAuth', this.root),
            onPostAuth: new Ext('onPostAuth', this.root),
            onPreHandler: new Ext('onPreHandler', this.root),
            onPostHandler: new Ext('onPostHandler', this.root),
            onPreResponse: new Ext('onPreResponse', this.root)
        },
        modifiers: {
            route: {}
        },
        plugin: env,
        pluginOptions: {},
        plugins: {},
        settings: {
            bind: undefined,
            files: {
                relativeTo: undefined
            }
        }
    };

    this.auth = {
        default: (opts) => this._applyChild('auth.default', 'auth', 'default', [opts]),
        scheme: (name, scheme) => this._applyChild('auth.scheme', 'auth', 'scheme', [name, scheme]),
        strategy: (name, scheme, mode, opts) => this._applyChild('auth.strategy', 'auth', 'strategy', [name, scheme, mode, opts]),
        test: (name, request, next) => request.connection.auth.test(name, request, next)
    };

    this.cache = internals.cache(this);
    this._single();

    // Decorations
    const methods = Object.keys(this.root._decorations);
    for (let i = 0; i < methods.length; ++i) {
        const method = methods[i];
        this[method] = this.root._decorations[method];
    }
};

Hoek.inherits(internals.Plugin, Podium);

internals.Plugin.prototype._single = function () {

    if (this.connections && this.connections.length === 1) {
        this.info = this.connections[0].info;
        this.listener = this.connections[0].listener;
        this.registrations = this.connections[0].registrations;
        this.auth.api = this.connections[0].auth.api;
    } else {
        this.info = null;
        this.listener = null;
        this.registrations = null;
        this.auth.api = null;
    }
};

internals.Plugin.prototype.select = function () {
    const labels = Hoek.flatten(Array.prototype.slice.call(arguments));
    return this._select(labels);
};

internals.Plugin.prototype._select = function (labels, plugin) {
    const connections = this._filterConnectionsByLabels(labels);
    const env = (plugin !== undefined ? plugin : this.realm);
    return new internals.Plugin(this.root, connections, env, this);
};

/**
 * Filters connections based on provided labels.
 * @param {Array} labels
 * @returns {Array|null}
 */
internals.Plugin.prototype._filterConnectionsByLabels = function (labels) {
    if (!labels || !labels.length) {
        return this.connections;
    }

    Hoek.assert(this.connections, 'Cannot select inside a connectionless plugin');

    const filtered = [];
    for (let i = 0; i < this.connections.length; ++i) {
        const connection = this.connections[i];
        if (Hoek.intersect(connection.settings.labels, labels).length) {
            filtered.push(connection);
        }
    }

    if (filtered.length === this.connections.length) {
        return this.connections;
    }

    return filtered;
};

internals.Plugin.prototype._clone = function (connections, plugin) {
    const env = (plugin !== undefined ? plugin : this.realm);
    return new internals.Plugin(this.root, connections, env, this);
};

internals.Plugin.prototype.register = function (plugins /*, [options], callback */) {
    const options = typeof arguments[1] === 'object' ? arguments[1] : {};
    const callback = typeof arguments[1] === 'object' ? arguments[2] : arguments[1];

    if (!callback) {
        return Promises.wrap(this, this.register, [plugins, options]);
    }

    const finalOptions = this._prepareRegisterOptions(options);
    const registrations = this._normalizeRegistrations(plugins, finalOptions);

    this.root._registring = true;

    Items.serial(registrations, (item, next) => this._processRegistration(item, next), (err) => {
        this.root._registring = false;
        return Hoek.nextTick(callback)(err);
    });
};

/**
 * Prepares registration options, applying route prefixes/vhosts from the realm.
 * @param {Object} options
 * @returns {Object}
 */
internals.Plugin.prototype._prepareRegisterOptions = function (options) {
    let opts = options;
    if (this.realm.modifiers.route.prefix || this.realm.modifiers.route.vhost) {
        opts = Hoek.clone(opts);
        opts.routes = opts.routes || {};

        opts.routes.prefix = (this.realm.modifiers.route.prefix || '') + (opts.routes.prefix || '') || undefined;
        opts.routes.vhost = this.realm.modifiers.route.vhost || opts.routes.vhost;
    }
    return Schema.apply('register', opts);
};

/**
 * Normalizes plugin definitions into a uniform registration object.
 * @param {Array|Object|Function} plugins
 * @param {Object} defaultOptions
 * @returns {Array}
 */
internals.Plugin.prototype._normalizeRegistrations = function (plugins, defaultOptions) {
    const registrations = [];
    const list = [].concat(plugins);

    for (let i = 0; i < list.length; ++i) {
        const reg = this._buildRegistration(list[i], defaultOptions);
        registrations.push(reg);
    }

    return registrations;
};

/**
 * Builds a single registration entry from a plugin definition.
 * @param {*} plugin
 * @param {Object} defaultOptions
 * @returns {Object}
 */
internals.Plugin.prototype._buildRegistration = function (plugin, defaultOptions) {
    let p = plugin;

    if (typeof p === 'function') {
        p = p.register ? Hoek.shallow(p) : { register: p };
    }

    if (p.register && p.register.register) {
        p.register = p.register.register;
    }

    p = Schema.apply('plugin', p);
    const attrs = p.register.attributes;

    return {
        register: p.register,
        name: attrs.name || attrs.pkg.name,
        version: attrs.version || attrs.pkg.version,
        multiple: attrs.multiple,
        pluginOptions: p.options,
        dependencies: attrs.dependencies,
        connections: attrs.connections,
        requirements: attrs.requirements,
        options: {
            once: attrs.once || (p.once !== undefined ? p.once : defaultOptions.once),
            routes: {
                prefix: p.routes.prefix || defaultOptions.routes.prefix,
                vhost: p.routes.vhost || defaultOptions.routes.vhost
            },
            select: p.select || defaultOptions.select
        }
    };
};

/**
 * Processes a single registration entry.
 * @param {Object} item
 * @param {Function} next
 */
internals.Plugin.prototype._processRegistration = function (item, next) {
    const selection = this._select(item.options.select, item.name);
    this._applySelectionOptions(selection, item);

    this._validateRequirements(item);
    this._handleMultipleRegistrations(selection, item, next);
};

/**
 * Applies route prefix/vhost and plugin options to a selection.
 * @param {internals.Plugin} selection
 * @param {Object} item
 */
internals.Plugin.prototype._applySelectionOptions = function (selection, item) {
    selection.realm.modifiers.route.prefix = item.options.routes.prefix;
    selection.realm.modifiers.route.vhost = item.options.routes.vhost;
    selection.realm.pluginOptions = item.pluginOptions || {};
};

/**
 * Validates node and hapi version requirements.
 * @param {Object} item
 */
internals.Plugin.prototype._validateRequirements = function (item) {
    const req = item.requirements;
    Hoek.assert(!req.node || Somever.match(process.version, req.node), 'Plugin', item.name, 'requires node version', req.node, 'but found', process.version);
    Hoek.assert(!req.hapi || Somever.match(this.version, req.hapi), 'Plugin', item.name, 'requires hapi version', req.hapi, 'but found', this.version);
};

/**
 * Handles registration logic, including connectionless plugins and duplicate checks.
 * @param {internals.Plugin} selection
 * @param {Object} item
 * @param {Function} next
 */
internals.Plugin.prototype._handleMultipleRegistrations = function (selection, item, next) {
    const registrationData = {
        version: item.version,
        name: item.name,
        options: item.pluginOptions,
        attributes: item.register.attributes
    };

    const connectionless = (item.connections === 'conditional' ? selection.connections.length === 0 : !item.connections);
    if (connectionless) {
        if (this.root._registrations[item.name]) {
            if (item.options.once) {
                return next();
            }
            Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered');
        } else {
            this.root._registrations[item.name] = registrationData;
        }
    }

    const connections = this._registerOnConnections(selection, item, registrationData, connectionless);
    if (item.options.once && !connectionless && connections.length === 0) {
        return next(); // All connections already have the plugin
    }

    selection.connections = connectionless ? null : connections;
    selection._single();

    if (item.dependencies) {
        selection.dependency(item.dependencies);
    }

    if (connectionless) {
        selection.connection = this.root.connection;
    }

    item.register(selection, item.pluginOptions || {}, next);
};

/**
 * Registers the plugin on each applicable connection.
 * @param {internals.Plugin} selection
 * @param {Object} item
 * @param {Object} registrationData
 * @param {boolean} connectionless
 * @returns {Array}
 */
internals.Plugin.prototype._registerOnConnections = function (selection, item, registrationData, connectionless) {
    const conns = [];

    if (!selection.connections) {
        return conns;
    }

    for (let i = 0; i < selection.connections.length; ++i) {
        const connection = selection.connections[i];
        if (connection.registrations[item.name]) {
            if (item.options.once) {
                continue;
            }
            Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered in:', connection.info.uri);
        } else {
            connection.registrations[item.name] = registrationData;
        }
        conns.push(connection);
    }

    return conns;
};

internals.Plugin.prototype.bind = function (context) {
    Hoek.assert(typeof context === 'object', 'bind must be an object');
    this.realm.settings.bind = context;
};

internals.cache = (plugin) => {
    const policy = function (options, _segment) {
        options = Schema.apply('cachePolicy', options);
        const segment = options.segment || _segment || (plugin.realm.plugin ? '!' + plugin.realm.plugin : '');
        Hoek.assert(segment, 'Missing cache segment name');

        const cacheName = options.cache || '_default';
        const cache = plugin.root._caches[cacheName];
        Hoek.assert(cache, 'Unknown cache', cacheName);
        Hoek.assert(!cache.segments[segment] || cache.shared || options.shared, 'Cannot provision the same cache segment more than once');
        cache.segments[segment] = true;

        return new Catbox.Policy(options, cache.client, segment);
    };

    policy.provision = (opts, callback) => {
        if (!callback) {
            return Promises.wrap(null, plugin.cache.provision, [opts]);
        }
        return plugin.root._createCache(opts, callback);
    };

    return policy;
};

internals.Plugin.prototype.decoder = function (encoding, decoder) {
    this._apply('decoder', Connection.prototype.decoder, [encoding, decoder]);
};

internals.Plugin.prototype.decorate = function (type, property, method, options) {
    Hoek.assert(['reply', 'request', 'server'].indexOf(type) !== -1, 'Unknown decoration type:', type);
    Hoek.assert(property, 'Missing decoration property name');
    Hoek.assert(typeof property === 'string', 'Decoration property must be a string');
    Hoek.assert(property[0] !== '_', 'Property name cannot begin with an underscore:', property);

    if (type === 'request') {
        this.root._requestor.decorate(property, method, options);
        this.root.decorations.request.push(property);
        return;
    }

    Hoek.assert(!options, 'Cannot specify options for non-request decoration');

    if (type === 'reply') {
        this.root._replier.decorate(property, method);
        this.root.decorations.reply.push(property);
        return;
    }

    Hoek.assert(!this.root._decorations[property], 'Server decoration already defined:', property);
    Hoek.assert(this[property] === undefined && this.root[property] === undefined, 'Cannot override the built-in server interface method:', property);

    this.root._decorations[property] = method;
    this.root.decorations.server.push(property);
    this[property] = method;

    let parent = this._parent;
    while (parent) {
        parent[property] = method;
        parent = parent._parent;
    }
};

internals.Plugin.prototype.dependency = function (dependencies, after) {
    Hoek.assert(this.realm.plugin, 'Cannot call dependency() outside of a plugin');
    Hoek.assert(!after || typeof after === 'function', 'Invalid after method');

    const normalized = this._normalizeDependencies(dependencies);
    this.root._dependencies.push({ plugin: this.realm.plugin, connections: this.connections, deps: normalized });

    if (after) {
        this.ext('onPreStart', after, { after: Object.keys(normalized) });
    }
};

/**
 * Normalizes dependency input to an object map.
 * @param {string|Array|string[]} dependencies
 * @returns {Object}
 */
internals.Plugin.prototype._normalizeDependencies = function (dependencies) {
    if (typeof dependencies === 'string') {
        return { [dependencies]: '*' };
    }
    if (Array.isArray(dependencies)) {
        const map = {};
        for (const dep of dependencies) {
            map[dep] = '*';
        }
        return map;
    }
    return dependencies;
};

internals.Plugin.prototype.emit = function (criteria, data, callback) {
    this.root._events.emit(criteria, data, callback);
};

internals.Plugin.prototype.encoder = function (encoding, encoder) {
    this._apply('encoder', Connection.prototype.encoder, [encoding, encoder]);
};

internals.Plugin.prototype.event = function (event) {
    this.root._events.registerEvent(event);
};

internals.Plugin.prototype.expose = function (key, value) {
    Hoek.assert(this.realm.plugin, 'Cannot call expose() outside of a plugin');

    const plugin = this.realm.plugin;
    this.root.plugins[plugin] = this.root.plugins[plugin] || {};

    if (typeof key === 'string') {
        this.root.plugins[plugin][key] = value;
    } else {
        Hoek.merge(this.root.plugins[plugin], key);
    }
};

internals.Plugin.prototype.ext = function (events) {
    if (typeof events === 'string') {
        events = { type: arguments[0], method: arguments[1], options: arguments[2] };
    }

    events = Schema.apply('exts', events);
    for (let i = 0; i < events.length; ++i) {
        this._ext(events[i]);
    }
};

internals.Plugin.prototype._ext = function (event) {
    event = Hoek.shallow(event);
    event.plugin = this;
    const type = event.type;

    if (!this.root._extensions[type]) {
        if (event.options && event.options.sandbox === 'plugin') {
            Hoek.assert(this.realm._extensions[type], 'Unknown event type', type);
            return this.realm._extensions[type].add(event);
        }
        return this._apply('ext', Connection.prototype._ext, [event]);
    }

    Hoek.assert(!event.options.sandbox, 'Cannot specify sandbox option for server extension');
    Hoek.assert(type !== 'onPreStart' || this.root._state === 'stopped', 'Cannot add onPreStart (after) extension after the server was initialized');
    this.root._extensions[type].add(event);
};

internals.Plugin.prototype.handler = function (name, method) {
    Hoek.assert(typeof name === 'string', 'Invalid handler name');
    Hoek.assert(!this.root._handlers[name], 'Handler name already exists:', name);
    Hoek.assert(typeof method === 'function', 'Handler must be a function:', name);
    Hoek.assert(!method.defaults || typeof method.defaults === 'object' || typeof method.defaults === 'function', 'Handler defaults property must be an object or function');
    this.root._handlers[name] = method;
};

internals.Plugin.prototype.inject = function (options, callback) {
    Hoek.assert(this.connections.length === 1, 'Method not available when the selection has more than one connection or none');
    return this.connections[0].inject(options, callback);
};

internals.Plugin.prototype.log = function (tags, data, timestamp, _internal) {
    tags = [].concat(tags);
    timestamp = timestamp ? (timestamp instanceof Date ? timestamp.getTime() : timestamp) : Date.now();
    const internal = !!_internal;

    const update = typeof data !== 'function' ? { timestamp, tags, data, internal } : () => ({
        timestamp,
        tags,
        data: data(),
        internal
    });

    this.root._events.emit({ name: 'log', tags }, update);
};

internals.Plugin.prototype._log = function (tags, data) {
    return this.log(tags, data, null, true);
};

internals.Plugin.prototype.lookup = function (id) {
    Hoek.assert(this.connections.length === 1, 'Method not available when the selection has more than one connection or none');
    return this.connections[0].lookup(id);
};

internals.Plugin.prototype.match = function (method, path, host) {
    Hoek.assert(this.connections.length === 1, 'Method not available when the selection has more than one connection or none');
    return this.connections[0].match(method, path, host);
};

internals.Plugin.prototype.method = function (name, method, options) {
    return this.root._methods.add(name, method, options, this.realm);
};

internals.Plugin.prototype.path = function (relativeTo) {
    Hoek.assert(relativeTo && typeof relativeTo === 'string', 'relativeTo must be a non-empty string');
    this.realm.settings.files.relativeTo = relativeTo;
};

internals.Plugin.prototype.route = function (options) {
    Hoek.assert(arguments.length === 1, 'Method requires a single object argument or a single array of objects');
    Hoek.assert(typeof options === 'object', 'Invalid route options');
    Hoek.assert(this.connections, 'Cannot add route from a connectionless plugin');
    Hoek.assert(this.connections.length, 'Cannot add a route without any connections');

    this._apply('route', Connection.prototype._route, [options, this]);
};

internals.Plugin.prototype.state = function (name, options) {
    this._applyChild('state', 'states', 'add', [name, options]);
};

internals.Plugin.prototype.table = function (host) {
    Hoek.assert(this.connections, 'Cannot request routing table from a connectionless plugin');

    const table = [];
    for (let i = 0; i < this.connections.length; ++i) {
        const connection = this.connections[i];
        table.push({ info: connection.info, labels: connection.settings.labels, table: connection.table(host) });
    }

    return table;
};

internals.Plugin.prototype._apply = function (type, func, args) {
    Hoek.assert(this.connections, 'Cannot add ' + type + ' from a connectionless plugin');
    Hoek.assert(this.connections.length, 'Cannot add ' + type + ' without a connection');

    for (let i = 0; i < this.connections.length; ++i) {
        func.apply(this.connections[i], args);
    }
};

internals.Plugin.prototype._applyChild = function (type, child, func, args) {
    Hoek.assert(this.connections, 'Cannot add ' + type + ' from a connectionless plugin');
    Hoek.assert(this.connections.length, 'Cannot add ' + type + ' without a connection');

    for (let i = 0; i < this.connections.length; ++i) {
        const obj = this.connections[i][child];
        obj[func].apply(obj, args);
    }
};