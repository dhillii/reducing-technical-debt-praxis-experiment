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

exports = module.exports = internals.Plugin = function (server, connections, env, parent) {
    Podium.call(this, [connections && connections.length ? connections : Connection._events, server._events]);

    this._parent = parent;
    this.root = server;
    this.app = this.root._app;
    this.connections = connections;
    this.load = this.root._heavy.load;
    this.methods = this.root._methods.methods;
    this.mime = this.root._mime;
    this.plugins = this.root._plugins;
    this.settings = this.root._settings;
    this.version = Package.version;

    this.realm = internals.createRealm(env);
    this.auth = internals.createAuth(this);
    this.cache = internals.cache(this);

    this._single();
    this._applyDecorations();
};

Hoek.inherits(internals.Plugin, Podium);

internals.createRealm = (env) => {
    if (typeof env !== 'string') {
        return env;
    }

    return {
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
        settings: {
            bind: undefined,
            files: { relativeTo: undefined }
        }
    };
};

internals.createAuth = (plugin) => ({
    default: (opts) => plugin._applyChild('auth.default', 'auth', 'default', [opts]),
    scheme: (name, scheme) => plugin._applyChild('auth.scheme', 'auth', 'scheme', [name, scheme]),
    strategy: (name, scheme, mode, opts) => plugin._applyChild('auth.strategy', 'auth', 'strategy', [name, scheme, mode, opts]),
    test: (name, request, next) => request.connection.auth.test(name, request, next)
});

internals.Plugin.prototype._applyDecorations = function () {
    const methods = Object.keys(this.root._decorations);
    for (let i = 0; i < methods.length; ++i) {
        this[methods[i]] = this.root._decorations[methods[i]];
    }
};

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

internals.Plugin.prototype.select = function (/* labels */) {
    const labels = Hoek.flatten(Array.from(arguments));
    return this._select(labels);
};

internals.Plugin.prototype._select = function (labels, plugin) {
    let connections = this.connections;

    if (labels && labels.length) {
        Hoek.assert(this.connections, 'Cannot select inside a connectionless plugin');
        connections = this.connections.filter((connection) => Hoek.intersect(connection.settings.labels, labels).length);

        if (!plugin && connections.length === this.connections.length) {
            return this;
        }
    }

    const env = (plugin !== undefined ? plugin : this.realm);
    return new internals.Plugin(this.root, connections, env, this);
};

internals.Plugin.prototype._clone = function (connections, plugin) {
    const env = (plugin !== undefined ? plugin : this.realm);
    return new internals.Plugin(this.root, connections, env, this);
};

internals.Plugin.prototype.register = function (plugins /*, [options], callback */) {
    let options = (typeof arguments[1] === 'object' ? arguments[1] : {});
    const callback = (typeof arguments[1] === 'object' ? arguments[2] : arguments[1]);

    if (!callback) {
        return Promises.wrap(this, this.register, [plugins, options]);
    }

    options = internals.applyRouteModifiers(this.realm, options);
    options = Schema.apply('register', options);

    const registrations = internals.normalizePlugins(plugins, options);
    this.root._registring = true;

    Items.serial(registrations, (item, next) => internals.registerPlugin(this, item, next), (err) => {
        this.root._registring = false;
        return Hoek.nextTick(callback)(err);
    });
};

internals.applyRouteModifiers = (realm, options) => {
    if (!realm.modifiers.route.prefix && !realm.modifiers.route.vhost) {
        return options;
    }

    options = Hoek.clone(options);
    options.routes = options.routes || {};
    options.routes.prefix = (realm.modifiers.route.prefix || '') + (options.routes.prefix || '') || undefined;
    options.routes.vhost = realm.modifiers.route.vhost || options.routes.vhost;
    return options;
};

internals.normalizePlugins = (plugins, options) => {
    const registrations = [];
    [].concat(plugins).forEach((plugin) => {
        let normalized = plugin;

        if (typeof normalized === 'function') {
            normalized = normalized.register ? Hoek.shallow(normalized) : { register: normalized };
        }

        if (normalized.register.register) {
            normalized.register = normalized.register.register;
        }

        normalized = Schema.apply('plugin', normalized);
        const attributes = normalized.register.attributes;

        registrations.push({
            register: normalized.register,
            name: attributes.name || attributes.pkg.name,
            version: attributes.version || attributes.pkg.version,
            multiple: attributes.multiple,
            pluginOptions: normalized.options,
            dependencies: attributes.dependencies,
            connections: attributes.connections,
            requirements: attributes.requirements,
            options: {
                once: attributes.once || (normalized.once !== undefined ? normalized.once : options.once),
                routes: {
                    prefix: normalized.routes.prefix || options.routes.prefix,
                    vhost: normalized.routes.vhost || options.routes.vhost
                },
                select: normalized.select || options.select
            }
        });
    });

    return registrations;
};

internals.registerPlugin = (plugin, item, next) => {
    const selection = plugin._select(item.options.select, item.name);
    selection.realm.modifiers.route.prefix = item.options.routes.prefix;
    selection.realm.modifiers.route.vhost = item.options.routes.vhost;
    selection.realm.pluginOptions = item.pluginOptions || {};

    internals.validateRequirements(item, plugin);
    internals.checkMultipleRegistrations(item, selection, plugin);

    const connections = internals.getRegisteredConnections(item, selection);

    if (item.options.once && !internals.isConnectionless(item, selection) && !connections.length) {
        return next();
    }

    selection.connections = (internals.isConnectionless(item, selection) ? null : connections);
    selection._single();

    if (item.dependencies) {
        selection.dependency(item.dependencies);
    }

    if (internals.isConnectionless(item, selection)) {
        selection.connection = plugin.root.connection;
    }

    item.register(selection, item.pluginOptions || {}, next);
};

internals.validateRequirements = (item, plugin) => {
    const requirements = item.requirements;
    Hoek.assert(!requirements.node || Somever.match(process.version, requirements.node), 'Plugin', item.name, 'requires node version', requirements.node, 'but found', process.version);
    Hoek.assert(!requirements.hapi || Somever.match(plugin.version, requirements.hapi), 'Plugin', item.name, 'requires hapi version', requirements.hapi, 'but found', plugin.version);
};

internals.isConnectionless = (item, selection) => {
    return (item.connections === 'conditional' ? selection.connections.length === 0 : !item.connections);
};

internals.checkMultipleRegistrations = (item, selection, plugin) => {
    const connectionless = internals.isConnectionless(item, selection);

    if (connectionless) {
        if (plugin.root._registrations[item.name]) {
            Hoek.assert(item.options.once || item.multiple, 'Plugin', item.name, 'already registered');
        } else {
            plugin.root._registrations[item.name] = {
                version: item.version,
                name: item.name,
                options: item.pluginOptions,
                attributes: item.register.attributes
            };
        }
    }
};

internals.getRegisteredConnections = (item, selection) => {
    const connections = [];

    if (selection.connections) {
        for (let i = 0; i < selection.connections.length; ++i) {
            const connection = selection.connections[i];
            if (!connection.registrations[item.name]) {
                connection.registrations[item.name] = {
                    version: item.version,
                    name: item.name,
                    options: item.pluginOptions,
                    attributes: item.register.attributes
                };
                connections.push(connection);
            } else if (!item.options.once) {
                Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered in:', connection.info.uri);
                connections.push(connection);
            }
        }
    }

    return connections;
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

internals.Plugin.prototype.bind = function (context) {
    Hoek.assert(typeof context === 'object', 'bind must be an object');
    this.realm.settings.bind = context;
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

    const normalized = internals.normalizeDependencies(dependencies);
    this.root._dependencies.push({ plugin: this.realm.plugin, connections: this.connections, deps: normalized });

    if (after) {
        this.ext('onPreStart', after, { after: Object.keys(normalized) });
    }
};

internals.normalizeDependencies = (dependencies) => {
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
    events.forEach((event) => this._ext(event));
};

internals.Plugin.prototype._ext = function (event) {
    event = Hoek.shallow(event);
    event.plugin = this;
    const type = event.type;

    if (!this.root._extensions[type]) {
        if (event.options.sandbox === 'plugin') {
            Hoek.assert(this.realm._extensions[type], 'Unknown event type', type);
            return this.realm._extensions[type].add(event);
        }

        return this._apply('ext', Connection.prototype._ext, [event