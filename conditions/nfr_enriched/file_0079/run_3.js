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

// Constants
internals.EXTENSION_TYPES = ['onPreAuth', 'onPostAuth', 'onPreHandler', 'onPostHandler', 'onPreResponse'];
internals.DECORATION_TYPES = ['reply', 'request', 'server'];
internals.DEFAULT_CACHE_NAME = '_default';

// Plugin Constructor
exports = module.exports = internals.Plugin = function (server, connections, env, parent) {
    Podium.call(this, [connections && connections.length ? connections : Connection._events, server._events]);

    this._parent = parent;
    this._initializePublicInterface(server);
    this._initializeRealm(env);
    this._initializeAuth();
    this.cache = internals.cache(this);
    this._single();
    this._applyDecorations();
};

Hoek.inherits(internals.Plugin, Podium);

internals.Plugin.prototype._initializePublicInterface = function (server) {
    this.root = server;
    this.app = this.root._app;
    this.connections = null;
    this.load = this.root._heavy.load;
    this.methods = this.root._methods.methods;
    this.mime = this.root._mime;
    this.plugins = this.root._plugins;
    this.settings = this.root._settings;
    this.version = Package.version;
};

internals.Plugin.prototype._initializeRealm = function (env) {
    this.realm = typeof env !== 'string' ? env : {
        _extensions: internals.createExtensions(this.root),
        modifiers: { route: {} },
        plugin: env,
        pluginOptions: {},
        plugins: {},
        settings: {
            bind: undefined,
            files: { relativeTo: undefined }
        }
    };
};

internals.createExtensions = function (root) {
    const extensions = {};
    internals.EXTENSION_TYPES.forEach((type) => {
        extensions[type] = new Ext(type, root);
    });
    return extensions;
};

internals.Plugin.prototype._initializeAuth = function () {
    this.auth = {
        default: (opts) => this._applyChild('auth.default', 'auth', 'default', [opts]),
        scheme: (name, scheme) => this._applyChild('auth.scheme', 'auth', 'scheme', [name, scheme]),
        strategy: (name, scheme, mode, opts) => this._applyChild('auth.strategy', 'auth', 'strategy', [name, scheme, mode, opts]),
        test: (name, request, next) => request.connection.auth.test(name, request, next)
    };
};

internals.Plugin.prototype._applyDecorations = function () {
    Object.keys(this.root._decorations).forEach((method) => {
        this[method] = this.root._decorations[method];
    });
};

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

internals.Plugin.prototype.select = function (/* labels */) {
    const labels = Hoek.flatten(Array.from(arguments));
    return this._select(labels);
};

internals.Plugin.prototype._select = function (labels, plugin) {
    let connections = this.connections;

    if (labels && labels.length) {
        Hoek.assert(this.connections, 'Cannot select inside a connectionless plugin');
        connections = this._filterConnectionsByLabels(labels);

        if (!plugin && connections.length === this.connections.length) {
            return this;
        }
    }

    const env = (plugin !== undefined ? plugin : this.realm);
    return new internals.Plugin(this.root, connections, env, this);
};

internals.Plugin.prototype._filterConnectionsByLabels = function (labels) {
    return this.connections.filter((connection) => {
        return Hoek.intersect(connection.settings.labels, labels).length > 0;
    });
};

internals.Plugin.prototype._clone = function (connections, plugin) {
    const env = (plugin !== undefined ? plugin : this.realm);
    return new internals.Plugin(this.root, connections, env, this);
};

internals.Plugin.prototype.register = function (plugins /*, [options], callback */) {
    const options = (typeof arguments[1] === 'object' ? arguments[1] : {});
    const callback = (typeof arguments[1] === 'object' ? arguments[2] : arguments[1]);

    if (!callback) {
        return Promises.wrap(this, this.register, [plugins, options]);
    }

    const processedOptions = this._processRegisterOptions(options);
    const registrations = this._buildRegistrations(plugins, processedOptions);

    this.root._registring = true;
    Items.serial(registrations, (item, next) => this._registerPlugin(item, next), (err) => {
        this.root._registring = false;
        return Hoek.nextTick(callback)(err);
    });
};

internals.Plugin.prototype._processRegisterOptions = function (options) {
    let processed = Hoek.clone(options);

    if (this.realm.modifiers.route.prefix || this.realm.modifiers.route.vhost) {
        processed.routes = processed.routes || {};
        processed.routes.prefix = (this.realm.modifiers.route.prefix || '') + (processed.routes.prefix || '') || undefined;
        processed.routes.vhost = this.realm.modifiers.route.vhost || processed.routes.vhost;
    }

    return Schema.apply('register', processed);
};

internals.Plugin.prototype._buildRegistrations = function (plugins, options) {
    const registrations = [];
    [].concat(plugins).forEach((plugin) => {
        const normalized = internals.normalizePlugin(plugin);
        const registration = internals.createRegistration(normalized, options);
        registrations.push(registration);
    });
    return registrations;
};

internals.normalizePlugin = function (plugin) {
    let normalized = plugin;

    if (typeof normalized === 'function') {
        if (!normalized.register) {
            normalized = { register: normalized };
        } else {
            normalized = Hoek.shallow(normalized);
        }
    }

    if (normalized.register.register) {
        normalized.register = normalized.register.register;
    }

    return Schema.apply('plugin', normalized);
};

internals.createRegistration = function (plugin, options) {
    const attributes = plugin.register.attributes;

    return {
        register: plugin.register,
        name: attributes.name || attributes.pkg.name,
        version: attributes.version || attributes.pkg.version,
        multiple: attributes.multiple,
        pluginOptions: plugin.options,
        dependencies: attributes.dependencies,
        connections: attributes.connections,
        requirements: attributes.requirements,
        options: {
            once: attributes.once || (plugin.once !== undefined ? plugin.once : options.once),
            routes: {
                prefix: plugin.routes.prefix || options.routes.prefix,
                vhost: plugin.routes.vhost || options.routes.vhost
            },
            select: plugin.select || options.select
        }
    };
};

internals.Plugin.prototype._registerPlugin = function (item, next) {
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

    internals.validateRequirements(item, this.version);

    const connectionless = internals.isConnectionless(item, selection);
    const shouldSkip = internals.checkRegistrationStatus(item, connectionless, this.root, selection);

    if (shouldSkip) {
        return next();
    }

    const connections = internals.getConnectionsForRegistration(item, selection, connectionless);
    selection.connections = (connectionless ? null : connections);
    selection._single();

    if (item.dependencies) {
        selection.dependency(item.dependencies);
    }

    if (connectionless) {
        selection.connection = this.root.connection;
    }

    item.register(selection, item.pluginOptions || {}, next);
};

internals.validateRequirements = function (item, version) {
    const requirements = item.requirements;
    Hoek.assert(!requirements.node || Somever.match(process.version, requirements.node),
        'Plugin', item.name, 'requires node version', requirements.node, 'but found', process.version);
    Hoek.assert(!requirements.hapi || Somever.match(version, requirements.hapi),
        'Plugin', item.name, 'requires hapi version', requirements.hapi, 'but found', version);
};

internals.isConnectionless = function (item, selection) {
    if (item.connections === 'conditional') {
        return selection.connections.length === 0;
    }
    return !item.connections;
};

internals.checkRegistrationStatus = function (item, connectionless, root, selection) {
    if (connectionless) {
        if (root._registrations[item.name]) {
            if (item.options.once) {
                return true;
            }
            Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered');
        } else {
            root._registrations[item.name] = {
                version: item.version,
                name: item.name,
                options: item.pluginOptions,
                attributes: item.register.attributes
            };
        }
    }
    return false;
};

internals.getConnectionsForRegistration = function (item, selection, connectionless) {
    const connections = [];

    if (selection.connections) {
        selection.connections.forEach((connection) => {
            if (connection.registrations[item.name]) {
                if (!item.options.once) {
                    Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered in:', connection.info.uri);
                }
            } else {
                connection.registrations[item.name] = {
                    version: item.version,
                    name: item.name,
                    options: item.pluginOptions,
                    attributes: item.register.attributes
                };
                connections.push(connection);
            }
        });

        if (item.options.once && !connectionless && !connections.length) {
            return [];
        }
    }

    return connections;
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

        const cacheName = options.cache || internals.DEFAULT_CACHE_NAME;
        const cache = plugin.root._caches[cacheName];
        Hoek.assert(cache, 'Unknown cache', cacheName);
        Hoek.assert(!cache.segments[segment] || cache.shared || options.shared,
            'Cannot provision the same cache segment more than once');
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
    Hoek.assert(internals.DECORATION_TYPES.indexOf(type) !== -1, 'Unknown decoration type:', type);
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

    this._decorateServer(property, method);
};

internals.Plugin.prototype._decorateServer = function (property, method) {
    Hoek.assert(!this.root._decorations[property], 'Server decoration already defined:', property);
    Hoek.assert(this[property] === undefined && this.root[property] === undefined,
        'Cannot override the built-in server interface method:', property);

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

    const normalized = internals.normalizeDependencies(dependencies);
    this.root._dependencies.push({ plugin: this.realm.plugin, connections: this.connections, deps: normalized });

    if (after) {
        this.ext('onPreStart', after, { after: Object.keys(normalized) });
    }
};

internals.normalizeDependencies = function (dependencies) {
    if (typeof dependencies === 'string') {
        return { [dependencies]: '*' };
    }

    if (Array.isArray(dependencies)) {
        const map = {};
        dependencies.forEach((dep) => {
            map[dep] = '*';
        });
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
    this.root.plugins[plugin] =