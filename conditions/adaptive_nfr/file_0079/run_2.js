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


exports = module.exports = internals.Plugin = function (server, connections, env, parent) {         // env can be a realm or plugin name

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
        labels.length) {            // Captures both empty arrays and empty strings

        Hoek.assert(this.connections, 'Cannot select inside a connectionless plugin');

        connections = [];
        for (let i = 0; i < this.connections.length; ++i) {
            const connection = this.connections[i];
            if (Hoek.intersect(connection.settings.labels, labels).length) {
                connections.push(connection);
            }
        }

        if (!plugin &&
            connections.length === this.connections.length) {

            return this;
        }
    }

    const env = (plugin !== undefined ? plugin : this.realm);                     // Allow empty string
    return new internals.Plugin(this.root, connections, env, this);
};


internals.Plugin.prototype._clone = function (connections, plugin) {

    const env = (plugin !== undefined ? plugin : this.realm);                     // Allow empty string
    return new internals.Plugin(this.root, connections, env, this);
};


/**
 * Normalizes plugin input to standard registration object format
 * @param {*} plugin - Plugin function, object, or required module
 * @returns {Object} Normalized plugin object
 */
internals.normalizePlugin = function (plugin) {

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

    return Schema.apply('plugin', plugin);
};


/**
 * Creates registration metadata from plugin attributes
 * @param {Object} plugin - Normalized plugin object
 * @param {Object} options - Registration options
 * @returns {Object} Registration metadata
 */
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


/**
 * Validates plugin requirements against current environment
 * @param {Object} requirements - Plugin requirements
 * @param {Object} item - Registration item
 * @param {string} version - Current hapi version
 */
internals.validateRequirements = function (requirements, item, version) {

    Hoek.assert(!requirements.node || Somever.match(process.version, requirements.node), 'Plugin', item.name, 'requires node version', requirements.node, 'but found', process.version);
    Hoek.assert(!requirements.hapi || Somever.match(version, requirements.hapi), 'Plugin', item.name, 'requires hapi version', requirements.hapi, 'but found', version);
};


/**
 * Determines if plugin is connectionless
 * @param {Object} item - Registration item
 * @param {Object} selection - Selected plugin instance
 * @returns {boolean} True if plugin is connectionless
 */
internals.isConnectionless = function (item, selection) {

    return (item.connections === 'conditional' ? selection.connections.length === 0 : !item.connections);
};


/**
 * Handles connectionless plugin registration state
 * @param {Object} item - Registration item
 * @param {Object} root - Root server instance
 * @returns {boolean} True if should skip registration
 */
internals.handleConnectionlessRegistration = function (item, root) {

    if (root._registrations[item.name]) {
        if (item.options.once) {
            return true;
        }

        Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered');
    }
    else {
        root._registrations[item.name] = {
            version: item.version,
            name: item.name,
            options: item.pluginOptions,
            attributes: item.register.attributes
        };
    }

    return false;
};


/**
 * Filters connections that haven't registered this plugin
 * @param {Object} item - Registration item
 * @param {Array} selectedConnections - Selected connections
 * @returns {Array} Filtered connections
 */
internals.filterUnregisteredConnections = function (item) {

    return function (connection) {

        if (connection.registrations[item.name]) {
            if (item.options.once) {
                return false;
            }

            Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered in:', connection.info.uri);
        }
        else {
            connection.registrations[item.name] = {
                version: item.version,
                name: item.name,
                options: item.pluginOptions,
                attributes: item.register.attributes
            };
        }

        return true;
    };
};


internals.Plugin.prototype.register = function (plugins /*, [options], callback */) {

    let options = (typeof arguments[1] === 'object' ? arguments[1] : {});
    const callback = (typeof arguments[1] === 'object' ? arguments[2] : arguments[1]);

    if (!callback) {
        return Promises.wrap(this, this.register, [plugins, options]);
    }

    if (this.realm.modifiers.route.prefix ||
        this.realm.modifiers.route.vhost) {

        options = Hoek.clone(options);
        options.routes = options.routes || {};

        options.routes.prefix = (this.realm.modifiers.route.prefix || '') + (options.routes.prefix || '') || undefined;
        options.routes.vhost = this.realm.modifiers.route.vhost || options.routes.vhost;
    }

    options = Schema.apply('register', options);

    const registrations = [];
    plugins = [].concat(plugins);
    for (let i = 0; i < plugins.length; ++i) {
        let plugin = internals.normalizePlugin(plugins[i]);
        const registration = internals.createRegistration(plugin, options);
        registrations.push(registration);
    }

    this.root._registring = true;

    const each = (item, next) => {

        this._registerItem(item, next);
    };

    Items.serial(registrations, each, (err) => {

        this.root._registring = false;
        return Hoek.nextTick(callback)(err);
    });
};


/**
 * Registers a single plugin item
 * @param {Object} item - Registration item
 * @param {Function} next - Callback function
 */
internals.Plugin.prototype._registerItem = function (item, next) {

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

    internals.validateRequirements(item.requirements, item, this.version);

    const connectionless = internals.isConnectionless(item, selection);
    if (connectionless) {
        if (internals.handleConnectionlessRegistration(item, this.root)) {
            return next();
        }
    }

    const connections = this._getRegistrationConnections(item, selection, registrationData, connectionless);

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
        selection.connection = this.root.connection;
    }

    item.register(selection, item.pluginOptions || {}, next);
};


/**
 * Gets connections for plugin registration
 * @param {Object} item - Registration item
 * @param {Object} selection - Selected plugin instance
 * @param {Object} registrationData - Registration metadata
 * @param {boolean} connectionless - Is connectionless plugin
 * @returns {Array} Connections to register
 */
internals.Plugin.prototype._getRegistrationConnections = function (item, selection, registrationData, connectionless) {

    const connections = [];
    if (selection.connections) {
        const filter = internals.filterUnregisteredConnections(item);
        for (let i = 0; i < selection.connections.length; ++i) {
            const connection = selection.connections[i];
            if (!connection.registrations[item.name]) {
                connection.registrations[item.name] = registrationData;
            }

            if (filter(connection)) {
                connections.push(connection);
            }
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


/**
 * Decoration type handlers
 */
internals.decorationHandlers = {
    request: (root, property, method, options) => {
        root._requestor.decorate(property, method, options);
        root.decorations.request.push(property);
    },
    reply: (root, property, method) => {
        root._replier.decorate(property, method);
        root.decorations.reply.push(property);
    },
    server: (root, property, method, plugin) => {
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
    }
};


internals.Plugin.prototype.decorate = function (type, property, method, options) {

    Hoek.assert(['reply', 'request', 'server'].indexOf(type) !== -1, 'Unknown decoration type:', type);
    Hoek.assert(property, 'Missing decoration property name');
    Hoek.assert(typeof property === 'string', 'Decoration property must be a string');
    Hoek.assert(property[0] !== '_', 'Property name cannot begin with an underscore:', property);

    const handler = internals.decorationHandlers[type];
    if (type ===