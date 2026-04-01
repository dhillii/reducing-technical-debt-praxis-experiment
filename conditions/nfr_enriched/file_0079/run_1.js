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

    this.realm = internals.createRealm(env);

    this.auth = {
        default: (opts) => this._applyChild('auth.default', 'auth', 'default', [opts]),
        scheme: (name, scheme) => this._applyChild('auth.scheme', 'auth', 'scheme', [name, scheme]),
        strategy: (name, scheme, mode, opts) => this._applyChild('auth.strategy', 'auth', 'strategy', [name, scheme, mode, opts]),
        test: (name, request, next) => request.connection.auth.test(name, request, next)
    };

    this.cache = internals.cache(this);
    this._single();

    // Decorations

    internals.applyDecorations(this);
};

Hoek.inherits(internals.Plugin, Podium);


// Create realm object with extensions and settings
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
};


// Apply server decorations to plugin instance
internals.applyDecorations = (plugin) => {

    const methods = Object.keys(plugin.root._decorations);
    for (let i = 0; i < methods.length; ++i) {
        const method = methods[i];
        plugin[method] = plugin.root._decorations[method];
    }
};


internals.Plugin.prototype._single = function () {

    if (this.connections &&
        this.connections.length === 1) {

        this.info = this.connections[0].info;
        this.listener = this.connections[0].listener;
        this.registrations = this.connections[0].registrations;
        this.auth.api = this.connections[0].auth.api;
    }
    else {
        this.info = null;
        this.listener = null;
        this.registrations = null;
        this.auth.api = null;
    }
};


internals.Plugin.prototype.select = function (/* labels */) {

    let labels = [];
    for (let i = 0; i < arguments.length; ++i) {
        labels.push(arguments[i]);
    }

    labels = Hoek.flatten(labels);
    return this._select(labels);
};


internals.Plugin.prototype._select = function (labels, plugin) {

    let connections = this.connections;

    if (labels &&
        labels.length) {

        Hoek.assert(this.connections, 'Cannot select inside a connectionless plugin');

        connections = internals.filterConnectionsByLabels(this.connections, labels);

        if (!plugin &&
            connections.length === this.connections.length) {

            return this;
        }
    }

    const env = (plugin !== undefined ? plugin : this.realm);
    return new internals.Plugin(this.root, connections, env, this);
};


// Filter connections that match the provided labels
internals.filterConnectionsByLabels = (connections, labels) => {

    const filtered = [];
    for (let i = 0; i < connections.length; ++i) {
        const connection = connections[i];
        if (Hoek.intersect(connection.settings.labels, labels).length) {
            filtered.push(connection);
        }
    }
    return filtered;
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

    const registrations = internals.buildRegistrations(plugins, options);

    this.root._registring = true;

    Items.serial(registrations, (item, next) => {
        internals.registerPlugin(this, item, next);
    }, (err) => {

        this.root._registring = false;
        return Hoek.nextTick(callback)(err);
    });
};


// Apply route modifiers from realm to options
internals.applyRouteModifiers = (realm, options) => {

    if (!realm.modifiers.route.prefix &&
        !realm.modifiers.route.vhost) {

        return options;
    }

    options = Hoek.clone(options);
    options.routes = options.routes || {};

    options.routes.prefix = (realm.modifiers.route.prefix || '') + (options.routes.prefix || '') || undefined;
    options.routes.vhost = realm.modifiers.route.vhost || options.routes.vhost;

    return options;
};


// Build registration objects from plugin specifications
internals.buildRegistrations = (plugins, options) => {

    const registrations = [];
    plugins = [].concat(plugins);

    for (let i = 0; i < plugins.length; ++i) {
        let plugin = internals.normalizePlugin(plugins[i]);
        plugin = Schema.apply('plugin', plugin);

        const registration = internals.createRegistration(plugin, options);
        registrations.push(registration);
    }

    return registrations;
};


// Normalize plugin to standard object format
internals.normalizePlugin = (plugin) => {

    if (typeof plugin === 'function') {
        if (!plugin.register) {
            plugin = { register: plugin };
        }
        else {
            plugin = Hoek.shallow(plugin);
        }
    }

    if (plugin.register.register) {
        plugin.register = plugin.register.register;
    }

    return plugin;
};


// Create registration object from normalized plugin
internals.createRegistration = (plugin, options) => {

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


// Register a single plugin with validation and connection tracking
internals.registerPlugin = (plugin, item, next) => {

    const selection = plugin._select(item.options.select, item.name);
    selection.realm.modifiers.route.prefix = item.options.routes.prefix;
    selection.realm.modifiers.route.vhost = item.options.routes.vhost;
    selection.realm.pluginOptions = item.pluginOptions || {};

    const registrationData = {
        version: item.version,
        name: item.name,
        options: item.pluginOptions,
        attributes: item.register.attributes
    };

    internals.validateRequirements(item, plugin);

    const connectionless = internals.isConnectionless(item, selection);
    internals.checkMultipleRegistration(plugin.root, item, connectionless);

    const connections = internals.getRegisteredConnections(selection, item);

    if (item.options.once &&
        !connectionless &&
        !connections.length) {

        return next();
    }

    selection.connections = (connectionless ? null : connections);
    selection._single();

    if (item.dependencies) {
        selection.dependency(item.dependencies);
    }

    if (connectionless) {
        selection.connection = plugin.root.connection;
    }

    item.register(selection, item.pluginOptions || {}, next);
};


// Validate plugin requirements against current environment
internals.validateRequirements = (item, plugin) => {

    const requirements = item.requirements;
    Hoek.assert(!requirements.node || Somever.match(process.version, requirements.node), 'Plugin', item.name, 'requires node version', requirements.node, 'but found', process.version);
    Hoek.assert(!requirements.hapi || Somever.match(plugin.version, requirements.hapi), 'Plugin', item.name, 'requires hapi version', requirements.hapi, 'but found', plugin.version);
};


// Determine if plugin is connectionless
internals.isConnectionless = (item, selection) => {

    if (item.connections === 'conditional') {
        return selection.connections.length === 0;
    }

    return !item.connections;
};


// Check and enforce multiple registration rules
internals.checkMultipleRegistration = (root, item, connectionless) => {

    if (!connectionless) {
        return;
    }

    if (root._registrations[item.name]) {
        Hoek.assert(item.multiple || item.options.once, 'Plugin', item.name, 'already registered');
    }
    else {
        root._registrations[item.name] = {
            version: item.version,
            name: item.name,
            options: item.pluginOptions,
            attributes: item.register.attributes
        };
    }
};


// Get connections that should be registered with plugin
internals.getRegisteredConnections = (selection, item) => {

    const connections = [];

    if (!selection.connections) {
        return connections;
    }

    for (let i = 0; i < selection.connections.length; ++i) {
        const connection = selection.connections[i];

        if (connection.registrations[item.name]) {
            if (!item.options.once) {
                Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered in:', connection.info.uri);
            }
            continue;
        }

        connection.registrations[item.name] = {
            version: item.version,
            name: item.name,
            options: item.pluginOptions,
            attributes: item.register.attributes
        };

        connections.push(connection);
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
        internals.decorateRequest(this.root, property, method, options);
        return;
    }

    Hoek.assert(!options, 'Cannot specify options for non-request decoration');

    if (type === 'reply') {
        internals.decorateReply(this.root, property, method);
        return;
    }

    internals.decorateServer(this, property, method);
};


// Apply request decoration
internals.decorateRequest = (root, property, method, options) => {

    root._requestor.decorate(property, method, options);
    root.decorations.request.push(property);
};


// Apply reply decoration
internals.decorateReply = (root, property, method) => {

    root._replier.decorate(property, method);
    root.decorations.reply.push(property);
};


// Apply server decoration
internals.decorateServer = (plugin, property, method) => {

    const root = plugin.root;

    Hoek.assert(!root._decorations[property], 'Server decoration already defined:', property);
    Hoek.assert(plugin[property] === undefined && root[property] === undefined, 'Cannot override the built-in server interface method:', property);

    root._decorations[property] = method;
    root.decorations.server.push(property);

    plugin[property] = method;

    let parent = plugin._parent;
    while (parent) {
        parent[property] = method;
        parent = parent._parent;
    }
};


internals.Plugin.prototype.dependency = function (dependencies, after) {

    Hoek.assert(this.realm.plugin, 'Cannot call dependency() outside of a plugin');
    Hoek.assert(!after || typeof after === 'function', 'Invalid after method');

    dependencies = internals.normalizeDependencies(dependencies);

    this.root._dependencies.push({ plugin: this.realm.plugin, connections: this.connections, deps: dependencies });

    if (after) {
        this.ext('onPreStart', after, { after: Object.keys(dependencies) });
    }
};


// Normalize dependencies to { plugin: version } format
internals.normalizeDependencies = (dependencies) => {

    if (typeof dependencies === 'string') {
        return