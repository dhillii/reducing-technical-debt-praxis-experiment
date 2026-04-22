```javascript
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

/**
 * Plugin constructor – creates a new plugin instance.
 */
exports = module.exports = internals.Plugin = function (server, connections, env, parent) {
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
        modifiers: { route: {} },
        plugin: env,
        pluginOptions: {},
        plugins: {},
        settings: { bind: undefined, files: { relativeTo: undefined } }
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

/**
 * Populate single-connection shortcuts when only one connection exists.
 */
internals.Plugin.prototype._single = function () {
    if (this.connections && this.connections.length === 1) {
        const conn = this.connections[0];
        this.info = conn.info;
        this.listener = conn.listener;
        this.registrations = conn.registrations;
        this.auth.api = conn.auth.api;
    } else {
        this.info = null;
        this.listener = null;
        this.registrations = null;
        this.auth.api = null;
    }
};

/**
 * Select connections based on provided labels.
 */
internals.Plugin.prototype.select = function () {
    const labels = Hoek.flatten(Array.from(arguments));
    return this._select(labels);
};

/**
 * Internal select implementation – isolates label filtering.
 */
internals.Plugin.prototype._select = function (labels, plugin) {
    const connections = _filterConnectionsByLabels(this, labels);
    const env = plugin !== undefined ? plugin : this.realm;
    return new internals.Plugin(this.root, connections, env, this);
};

/**
 * Clone the plugin with a new set of connections.
 */
internals.Plugin.prototype._clone = function (connections, plugin) {
    const env = plugin !== undefined ? plugin : this.realm;
    return new internals.Plugin(this.root, connections, env, this);
};

/**
 * Register one or many plugins.
 */
internals.Plugin.prototype.register = function (plugins /*, [options], callback */) {
    const options = typeof arguments[1] === 'object' ? arguments[1] : {};
    const callback = typeof arguments[1] === 'object' ? arguments[2] : arguments[1];

    if (!callback) {
        return Promises.wrap(this, this.register, [plugins, options]);
    }

    const finalOptions = _applyRouteModifiers(this, options);
    const normalizedOptions = Schema.apply('register', finalOptions);
    const registrations = _prepareRegistrations(plugins, normalizedOptions);

    this.root._registring = true;

    Items.serial(registrations, _processRegistration.bind(this), (err) => {
        this.root._registring = false;
        return Hoek.nextTick(callback)(err);
    });
};

/**
 * Bind a context to the plugin realm.
 */
internals.Plugin.prototype.bind = function (context) {
    Hoek.assert(typeof context === 'object', 'bind must be an object');
    this.realm.settings.bind = context;
};

/**
 * Cache policy factory.
 */
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

/**
 * Decoder registration.
 */
internals.Plugin.prototype.decoder = function (encoding, decoder) {
    this._apply('decoder', Connection.prototype.decoder, [encoding, decoder]);
};

/**
 * Server decoration.
 */
internals.Plugin.prototype.decorate = function (type, property, method, options) {
    Hoek.assert(['reply', 'request', 'server'].includes(type), 'Unknown decoration type:', type);
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

/**
 * Declare plugin dependencies.
 */
internals.Plugin.prototype.dependency = function (dependencies, after) {
    Hoek.assert(this.realm.plugin, 'Cannot call dependency() outside of a plugin');
    Hoek.assert(!after || typeof after === 'function', 'Invalid after method');

    const normalized = _normalizeDependencies(dependencies);
    this.root._dependencies.push({ plugin: this.realm.plugin, connections: this.connections, deps: normalized });

    if (after) {
        this.ext('onPreStart', after, { after: Object.keys(normalized) });
    }
};

/**
 * Emit an event.
 */
internals.Plugin.prototype.emit = function (criteria, data, callback) {
    this.root._events.emit(criteria, data, callback);
};

/**
 * Encoder registration.
 */
internals.Plugin.prototype.encoder = function (encoding, encoder) {
    this._apply('encoder', Connection.prototype.encoder, [encoding, encoder]);
};

/**
 * Register a custom event.
 */
internals.Plugin.prototype.event = function (event) {
    this.root._events.registerEvent(event);
};

/**
 * Expose plugin values.
 */
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

/**
 * Register extensions.
 */
internals.Plugin.prototype.ext = function (events) {
    if (typeof events === 'string') {
        events = { type: arguments[0], method: arguments[1], options: arguments[2] };
    }

    events = Schema.apply('exts', events);
    for (let i = 0; i < events.length; ++i) {
        this._ext(events[i]);
    }
};

/**
 * Internal extension registration.
 */
internals.Plugin.prototype._ext = function (event) {
    event = Hoek.shallow(event);
    event.plugin = this;
    const type = event.type;

    if (!this.root._extensions[type]) {
        if (event.options.sandbox === 'plugin') {
            Hoek.assert(this.realm._extensions[type], 'Unknown event type', type);
            return this.realm._extensions[type].add(event);
        }
        return this._apply('ext', Connection.prototype._ext, [event]);
    }

    Hoek.assert(!event.options.sandbox, 'Cannot specify sandbox option for server extension');
    Hoek.assert(type !== 'onPreStart' || this.root._state === 'stopped', 'Cannot add onPreStart (after) extension after the server was initialized');
    this.root._extensions[type].add(event);
};

/**
 * Register a route handler.
 */
internals.Plugin.prototype.handler = function (name, method) {
    Hoek.assert(typeof name === 'string', 'Invalid handler name');
    Hoek.assert(!this.root._handlers[name], 'Handler name already exists:', name);
    Hoek.assert(typeof method === 'function', 'Handler must be a function:', name);
    Hoek.assert(!method.defaults || typeof method.defaults === 'object' || typeof method.defaults === 'function', 'Handler defaults property must be an object or function');
    this.root._handlers[name] = method;
};

/**
 * Inject a request into the server.
 */
internals.Plugin.prototype.inject = function (options, callback) {
    Hoek.assert(this.connections.length === 1, 'Method not available when the selection has more than one connection or none');
    return this.connections[0].inject(options, callback);
};

/**
 * Log an event.
 */
internals.Plugin.prototype.log = function (tags, data, timestamp, _internal) {
    tags = [].concat(tags);
    timestamp = timestamp ? (timestamp instanceof Date ? timestamp.getTime() : timestamp) : Date.now();
    const internal = !!_internal;

    const update = typeof data !== 'function'
        ? { timestamp, tags, data, internal }
        : () => ({ timestamp, tags, data: data(), internal });

    this.root._events.emit({ name: 'log', tags }, update);
};

/**
 * Internal log used by the framework.
 */
internals.Plugin.prototype._log = function (tags, data) {
    return this.log(tags, data, null, true);
};

/**
 * Lookup a request by id.
 */
internals.Plugin.prototype.lookup = function (id) {
    Hoek.assert(this.connections.length === 1, 'Method not available when the selection has more than one connection or none');
    return this.connections[0].lookup(id);
};

/**
 * Match a request to a route.
 */
internals.Plugin.prototype.match = function (method, path, host) {
    Hoek.assert(this.connections.length === 1, 'Method not available when the selection has more than one connection or none');
    return this.connections[0].match(method, path, host);
};

/**
 * Add a server method.
 */
internals.Plugin.prototype.method = function (name, method, options) {
    return this.root._methods.add(name, method, options, this.realm);
};

/**
 * Set the relative path for file handling.
 */
internals.Plugin.prototype.path = function (relativeTo) {
    Hoek.assert(relativeTo && typeof relativeTo === 'string', 'relativeTo must be a non-empty string');
    this.realm.settings.files.relativeTo = relativeTo;
};

/**
 * Add a route.
 */
internals.Plugin.prototype.route = function (options) {
    Hoek.assert(arguments.length === 1, 'Method requires a single object argument or a single array of objects');
    Hoek.assert(typeof options === 'object', 'Invalid route options');
    Hoek.assert(this.connections, 'Cannot add route from a connectionless plugin');
    Hoek.assert(this.connections.length, 'Cannot add a route without any connections');
    this._apply('route', Connection.prototype._route, [options, this]);
};

/**
 * Add a state cookie.
 */
internals.Plugin.prototype.state = function (name, options) {
    this._applyChild('state', 'states', 'add', [name, options]);
};

/**
 * Retrieve the routing table.
 */
internals.Plugin.prototype.table = function (host) {
    Hoek.assert(this.connections, 'Cannot request routing table from a connectionless plugin');
    const table = [];
    for (let i = 0; i < this.connections.length; ++i) {
        const connection = this.connections[i];
        table.push({ info: connection.info, labels: connection.settings.labels, table: connection.table(host) });
    }
    return table;
};

/**
 * Apply a function to all connections.
 */
internals.Plugin.prototype._apply = function (type, func, args) {
    Hoek.assert(this.connections, `Cannot add ${type} from a connectionless plugin`);
    Hoek.assert(this.connections.length, `Cannot add ${type} without a connection`);
    for (let i = 0; i < this.connections.length; ++i) {
        func.apply(this.connections[i], args);
    }
};

/**
 * Apply a child method to all connections.
 */
internals.Plugin.prototype._applyChild = function (type, child, func, args) {
    Hoek.assert(this.connections, `Cannot add ${type} from a connectionless plugin`);
    Hoek.assert(this.connections.length, `Cannot add ${type} without a connection`);
    for (let i = 0; i < this.connections.length; ++i) {
        const obj = this.connections[i][child];
        obj[func].apply(obj, args);
    }
};

/* -------------------- Helper Functions -------------------- */

/**
 * Filter connections based on label intersection.
 */
function _filterConnectionsByLabels(pluginInstance, labels) {
    if (!labels || !labels.length) {
        return pluginInstance.connections;
    }

    Hoek.assert(pluginInstance.connections, 'Cannot select inside a connectionless plugin');

    const filtered = [];
    for (let i = 0; i < pluginInstance.connections.length; ++i) {
        const connection = pluginInstance.connections[i];
        if (Hoek.intersect(connection.settings.labels, labels).length) {
            filtered.push(connection);
        }
    }

    // Return original plugin if all connections match (no effective filter)
    if (filtered.length === pluginInstance.connections.length) {
        return pluginInstance.connections;
    }

    return filtered;
}

/**
 * Apply route prefix/vhost modifiers from the current realm.
 */
function _applyRouteModifiers(pluginInstance, options) {
    if (pluginInstance.realm.modifiers.route.prefix || pluginInstance.realm.modifiers.route.vhost) {
        const cloned = Hoek.clone(options);
        cloned.routes = cloned.routes || {};

        cloned.routes.prefix = (pluginInstance.realm.modifiers.route.prefix || '') +
            (cloned.routes.prefix || '') || undefined;
        cloned.routes.vhost = pluginInstance.realm.modifiers.route.vhost || cloned.routes.vhost;

        return cloned;
    }
    return options;
}

/**
 * Prepare registration objects from raw plugin inputs.
 */
function _prepareRegistrations(rawPlugins, baseOptions) {
    const registrations = [];
    const plugins = [].concat(rawPlugins);

    for (let i = 0; i < plugins.length; ++i) {
        let plugin = plugins[i];

        // Normalize function plugins
        if (typeof plugin === 'function') {
            plugin = plugin.register ? Hoek.shallow(plugin) : { register: plugin };
        }

        // Unwrap required plugins
        if (plugin.register && plugin.register.register) {
            plugin.register = plugin.register.register;
        }

        plugin = Schema.apply('plugin', plugin);
        const attrs = plugin.register.attributes;

        const registration = {
            register: plugin.register,
            name: attrs.name || attrs.pkg.name,
            version: attrs.version || attrs.pkg.version,
            multiple: attrs.multiple,
            pluginOptions: plugin.options,
            dependencies: attrs.dependencies,
            connections: attrs.connections,
            requirements: attrs.requirements,
            options: {
                once: attrs.once || (plugin.once !== undefined ? plugin.once : baseOptions.once),
                routes: {
                    prefix: plugin.routes.prefix || baseOptions.routes.prefix,
                    vhost: plugin.routes.vhost || baseOptions.routes.vhost
                },
                select: plugin.select || baseOptions.select
            }
        };

        registrations.push(registration);
    }

    return registrations;
}

/**
 * Process a single registration entry.
 */
function _processRegistration(item, next) {
    const selection = this._select(item.options.select, item.name);
    selection.realm.modifiers.route.prefix = item.options.routes.prefix;
    selection.realm.modifiers.route.vhost = item.options.routes.vhost;
    selection.realm.pluginOptions = item.pluginOptions || {};

    const registrationData = {
        version: item.version,
        name: item.name,
        options: item.pluginOptions,
        attributes: item.register.attributes
    };

    _validateRequirements(this, item, registrationData);
    const connections = _registerInConnections(this, selection, item, registrationData);
    selection.connections = connections.length ? connections : null;
    selection._single();

    if (item.dependencies) {
        selection.dependency(item.dependencies);
    }

    if (!item.connections) {
        selection.connection = this.root.connection;
    }

    item.register(selection, item.pluginOptions || {}, next);
}

/**
 * Validate node and hapi version requirements.
 */
function _validateRequirements(pluginInstance, item, registrationData) {
    const req = item.requirements;
    Hoek.assert(!req.node || Somever.match(process.version, req.node), 'Plugin', item.name, 'requires node version', req.node, 'but found', process.version);
    Hoek.assert(!req.hapi || Somever.match(pluginInstance.version, req.hapi), 'Plugin', item.name, 'requires hapi version', req.hapi, 'but found', pluginInstance.version);

    const connectionless = (item.connections === 'conditional' ? selection.connections.length === 0 : !item.connections);
    if (connectionless) {
        if (pluginInstance.root._registrations[item.name]) {
            if (item.options.once) {
                return;
            }
            Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered');
        } else {
            pluginInstance.root._registrations[item.name] = registrationData;
        }
    }
}

/**
 * Register the plugin in each selected connection.
 */
function _registerInConnections(pluginInstance, selection, item, registrationData) {
    const connections = [];
    if (!selection.connections) {
        return connections;
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
        connections.push(connection);
    }

    const connectionless = (item.connections === 'conditional' ? selection.connections.length === 0 : !item.connections);
    if (item.options.once && !connectionless && connections.length === 0) {
        // All connections already have the plugin registered
        return [];
    }

    return connections;
}

/**
 * Normalize dependency input to an object map.
 */
function _normalizeDependencies(dependencies) {
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
}
```