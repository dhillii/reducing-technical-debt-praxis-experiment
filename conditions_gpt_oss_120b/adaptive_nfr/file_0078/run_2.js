'use strict';

const Boom = require('boom');
const Hoek = require('hoek');

const Schema = require('./schema');

const internals = {};

exports = module.exports = internals.Auth = function (connection) {

    this.connection = connection;
    this._schemes = {};
    this._strategies = {};
    this.settings = {
        default: null // Strategy used as default if route has no auth settings
    };

    this.api = {};
};

internals.Auth.prototype.scheme = function (name, scheme) {

    Hoek.assert(name, 'Authentication scheme must have a name');
    Hoek.assert(!this._schemes[name], 'Authentication scheme name already exists:', name);
    Hoek.assert(typeof scheme === 'function', 'scheme must be a function:', name);

    this._schemes[name] = scheme;
};

internals.Auth.prototype.strategy = function (name, scheme /*, mode, options */) {

    const hasMode = (typeof arguments[2] === 'string' || typeof arguments[2] === 'boolean');
    const mode = (hasMode ? arguments[2] : false);
    const options = (hasMode ? arguments[3] : arguments[2]) || null;

    Hoek.assert(name, 'Authentication strategy must have a name');
    Hoek.assert(name !== 'bypass', 'Cannot use reserved strategy name: bypass');
    Hoek.assert(!this._strategies[name], 'Authentication strategy name already exists');
    Hoek.assert(scheme, 'Authentication strategy', name, 'missing scheme');
    Hoek.assert(this._schemes[scheme], 'Authentication strategy', name, 'uses unknown scheme:', scheme);

    const server = this.connection.server._clone([this.connection], '');
    const strategy = this._schemes[scheme](server, options);

    Hoek.assert(strategy.authenticate, 'Invalid scheme:', name, 'missing authenticate() method');
    Hoek.assert(typeof strategy.authenticate === 'function', 'Invalid scheme:', name, 'invalid authenticate() method');
    Hoek.assert(!strategy.payload || typeof strategy.payload === 'function', 'Invalid scheme:', name, 'invalid payload() method');
    Hoek.assert(!strategy.response || typeof strategy.response === 'function', 'Invalid scheme:', name, 'invalid response() method');
    strategy.options = strategy.options || {};
    Hoek.assert(strategy.payload || !strategy.options.payload, 'Cannot require payload validation without a payload method');

    this._strategies[name] = {
        methods: strategy,
        realm: server.realm
    };

    if (strategy.api) {
        this.api[name] = strategy.api;
    }

    if (mode) {
        this.default({ strategies: [name], mode: mode === true ? 'required' : mode });
    }
};

internals.Auth.prototype.default = function (options) {

    Hoek.assert(!this.settings.default, 'Cannot set default strategy more than once');
    options = Schema.apply('auth', options, 'default strategy');

    this.settings.default = this._setupRoute(Hoek.clone(options));
};

internals.Auth.prototype.test = function (name, request, next) {

    Hoek.assert(name, 'Missing authentication strategy name');
    const strategy = this._strategies[name];
    Hoek.assert(strategy, 'Unknown authentication strategy:', name);

    const reply = request.server._replier.interface(request, strategy.realm, { data: true }, (response) => next(response, reply._data && reply._data.credentials));
    strategy.methods.authenticate(request, reply);
};

internals.Auth.prototype._setupRoute = function (options, path) {

    if (!options) {
        return options; // Preserve the difference between undefined and false
    }

    const normalized = internals.normalizeOptions(options);
    const merged = internals.mergeWithDefault(this, normalized, path);
    internals.validateAccessAndPayload(this, merged, path);

    return merged;
};

/**
 * Normalizes various option shapes into a canonical object.
 */
internals.normalizeOptions = function (options) {

    if (typeof options === 'string') {
        return { strategies: [options] };
    }

    if (options.strategy) {
        const copy = Hoek.clone(options);
        copy.strategies = [copy.strategy];
        delete copy.strategy;
        return copy;
    }

    return Hoek.clone(options);
};

/**
 * Merges route specific options with the default strategy when needed.
 */
internals.mergeWithDefault = function (authInstance, options, path) {

    if (path && !options.strategies) {
        Hoek.assert(authInstance.settings.default, 'Route missing authentication strategy and no default defined:', path);
        return Hoek.applyToDefaults(authInstance.settings.default, options);
    }

    const routePath = path || 'default strategy';
    Hoek.assert(options.strategies && options.strategies.length, 'Missing authentication strategy:', routePath);

    options.mode = options.mode || 'required';

    internals.applyLegacyAccess(options);
    internals.normalizeAccessScope(options);
    internals.normalizePayloadOption(options);

    return options;
};

/**
 * Handles legacy `entity` and `scope` properties.
 */
internals.applyLegacyAccess = function (options) {

    if (options.entity !== undefined || options.scope !== undefined) {
        options.access = [{ entity: options.entity, scope: options.scope }];
        delete options.entity;
        delete options.scope;
    }
};

/**
 * Expands each access object's scope using the setupScope helper.
 */
internals.normalizeAccessScope = function (options) {

    if (!options.access) {
        return;
    }

    for (let i = 0; i < options.access.length; ++i) {
        const access = options.access[i];
        access.scope = internals.setupScope(access);
    }
};

/**
 * Normalizes the payload option.
 */
internals.normalizePayloadOption = function (options) {

    if (options.payload === true) {
        options.payload = 'required';
    }
};

/**
 * Validates that all referenced strategies exist and that payload requirements are compatible.
 */
internals.validateAccessAndPayload = function (authInstance, options, path) {

    let hasAuthenticatePayload = false;

    for (let i = 0; i < options.strategies.length; ++i) {
        const name = options.strategies[i];
        const strategy = authInstance._strategies[name];
        Hoek.assert(strategy, 'Unknown authentication strategy', name, 'in', path);

        Hoek.assert(strategy.methods.payload || options.payload !== 'required',
            'Payload validation can only be required when all strategies support it in', path);
        hasAuthenticatePayload = hasAuthenticatePayload || !!strategy.methods.payload;
        Hoek.assert(!strategy.methods.options.payload ||
            options.payload === undefined ||
            options.payload === 'required',
            'Cannot set authentication payload to', options.payload, 'when a strategy requires payload validation in', path);
    }

    Hoek.assert(!options.payload || hasAuthenticatePayload,
        'Payload authentication requires at least one strategy with payload support in', path);
};

internals.setupScope = function (access) {

    if (!access.scope) {
        return false;
    }

    const scope = {};
    for (let i = 0; i < access.scope.length; ++i) {
        const value = access.scope[i];
        const prefix = value[0];
        const type = (prefix === '+' ? 'required' : (prefix === '!' ? 'forbidden' : 'selection'));
        const clean = (type === 'selection' ? value : value.slice(1));
        scope[type] = scope[type] || [];
        scope[type].push(clean);

        if ((!scope._parameters || !scope._parameters[type]) && /{([^}]+)}/.test(clean)) {
            scope._parameters = scope._parameters || {};
            scope._parameters[type] = true;
        }
    }

    return scope;
};

internals.Auth.prototype.lookup = function (route) {

    if (route.settings.auth === false) {
        return false;
    }

    return route.settings.auth || this.settings.default;
};

internals.Auth.authenticate = function (request, next) {

    const auth = request.connection.auth;
    return auth._authenticate(request, next);
};

internals.Auth.access = function (request, route) {

    const auth = request.connection.auth;
    const config = auth.lookup(route);
    if (!config) {
        return true;
    }

    const credentials = request.auth.credentials;
    if (!credentials) {
        return false;
    }

    return !internals.access(request, config, credentials, 'bypass');
};

internals.Auth.prototype._authenticate = function (request, next) {

    const config = this.lookup(request.route);
    if (!config) {
        return next();
    }

    const authenticator = new internals.Authenticator(config, request, this);
    authenticator.authenticate(next);
};

internals.Auth.payload = function (request, next) {

    if (!request.auth.isAuthenticated || request.auth.strategy === 'bypass') {
        return next();
    }

    const auth = request.connection.auth;
    const strategy = auth._strategies[request.auth.strategy];

    if (!strategy.methods.payload) {
        return next();
    }

    const config = auth.lookup(request.route);
    const setting = config.payload || (strategy.methods.options.payload ? 'required' : false);
    if (!setting) {
        return next();
    }

    const finalize = (response) => {

        if (response && response.isBoom && response.isMissing) {
            return next(setting === 'optional' ? null : Boom.unauthorized('Missing payload authentication'));
        }

        return next(response);
    };

    request._protect.run(finalize, (exit) => {

        const reply = request.server._replier.interface(request, strategy.realm, {}, exit);
        strategy.methods.payload(request, reply);
    });
};

internals.Auth.response = function (request, next) {

    const auth = request.connection.auth;
    const config = auth.lookup(request.route);
    if (!config || !request.auth.isAuthenticated || request.auth.strategy === 'bypass') {
        return next();
    }

    const strategy = auth._strategies[request.auth.strategy];
    if (!strategy.methods.response) {
        return next();
    }

    request._protect.run(next, (exit) => {

        const reply = request.server._replier.interface(request, strategy.realm, {}, exit);
        strategy.methods.response(request, reply);
    });
};

internals.Authenticator = class {
    constructor(config, request, manager) {

        this.config = config;
        this.request = request;
        this.manager = manager;

        this.errors = [];
        this.current = -1;
    }

    authenticate(next) {

        this.request.auth.mode = this.config.mode;

        if (this.request.auth.credentials) {
            return this.validate(null, { credentials: this.request.auth.credentials, artifacts: this.request.auth.artifacts }, next);
        }

        return this.execute(next);
    }

    execute(next) {

        ++this.current;
        if (this.current < this.config.strategies.length) {
            this._runStrategy(next);
            return;
        }

        this._handleExhaustedStrategies(next);
    }

    _runStrategy(next) {

        const name = this.config.strategies[this.current];
        const after = (err, data) => this.validate(err, data, next);
        this.request._protect.run(after, (exit) => {

            const strategy = this.manager._strategies[name];
            const reply = this.request.server._replier.interface(this.request, strategy.realm, { data: true }, (err) => exit(err, reply._data));
            strategy.methods.authenticate(this.request, reply);
        });
    }

    _handleExhaustedStrategies(next) {

        const err = Boom.unauthorized('Missing authentication', this.errors);

        if (this.config.mode === 'optional' || this.config.mode === 'try') {
            this.request.auth.isAuthenticated = false;
            this.request.auth.credentials = null;
            this.request.auth.error = err;
            this.request._log(['auth', 'unauthenticated']);
            return next();
        }

        return next(err);
    }

    validate(err, result, next) {

        if (internals.isInvalidResult(err, result)) {
            return next(Boom.badImplementation('Authentication response missing both error and credentials'));
        }

        if (err) {
            return this._handleError(err, result, next);
        }

        return this._handleSuccess(result, next);
    }

    _handleError(err, result, next) {

        const name = this.config.strategies[this.current] || 'bypass';

        if (!(err instanceof Error)) {
            this.request._log(['auth', 'unauthenticated', 'response', name], err.statusCode);
            return next(err);
        }

        if (err.isMissing) {
            this.request._log(['auth', 'unauthenticated', 'missing', name], err);
            this.errors.push(err.output.headers['WWW-Authenticate']);
            return this.execute(next);
        }

        if (this.config.mode === 'try') {
            this._populateUnauthenticatedState(name, result, err);
            this.request._log(['auth', 'unauthenticated', 'try', name], err);
            return next();
        }

        this.request._log(['auth', 'unauthenticated', 'error', name], err);
        return next(err);
    }

    _populateUnauthenticatedState(name, result, err) {

        this.request.auth.isAuthenticated = false;
        this.request.auth.strategy = name;
        this.request.auth.credentials = result && result.credentials;
        this.request.auth.artifacts = result && result.artifacts;
        this.request.auth.error = err;
    }

    _handleSuccess(result, next) {

        const name = this.config.strategies[this.current] || 'bypass';
        const credentials = result.credentials;

        this.request.auth.strategy = name;
        this.request.auth.credentials = credentials;
        this.request.auth.artifacts = result.artifacts;

        const error = internals.access(this.request, this.config, credentials, name);
        if (!error) {
            this.request._log(['auth', name]);
            this.request.auth.isAuthenticated = true;
            return next();
        }

        this.request._log(error.tags, error.data);
        return next(error.err);
    }
};

/**
 * Determines if the authentication result is malformed.
 */
internals.isInvalidResult = function (err, result) {

    return !err && (!result || !result.credentials);
};

internals.access = function (request, config, credentials, name) {

    if (!config.access) {
        return null;
    }

    const requestEntity = credentials.user ? 'user' : 'app';
    const scopeErrors = [];

    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];

        if (!internals.isEntityAllowed(access, requestEntity)) {
            continue;
        }

        if (internals.isScopeInvalid(request, credentials, access, scopeErrors)) {
            continue;
        }

        return null;
    }

    return internals.buildAccessError(requestEntity, credentials, scopeErrors, name);
};

internals.isEntityAllowed = function (access, requestEntity) {

    const entity = access.entity;
    return !entity || entity === 'any' || entity === requestEntity;
};

internals.isScopeInvalid = function (request, credentials, access, scopeErrors) {

    const scope = access.scope;
    if (!scope) {
        return false;
    }

    if (!credentials.scope) {
        scopeErrors.push(scope);
        return true;
    }

    const expanded = internals.expandScope(request, scope);
    const invalid = !internals.validateScope(credentials, expanded, 'required') ||
        !internals.validateScope(credentials, expanded, 'selection') ||
        !internals.validateScope(credentials, expanded, 'forbidden');

    if (invalid) {
        scopeErrors.push(scope);
    }

    return invalid;
};

internals.buildAccessError = function (requestEntity, credentials, scopeErrors, name) {

    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};

internals.expandScope = function (request, scope) {

    if (!scope._parameters) {
        return scope;
    }

    return {
        required: internals.expandScopeType(request, scope, 'required'),
        selection: internals.expandScopeType(request, scope, 'selection'),
        forbidden: internals.expandScopeType(request, scope, 'forbidden')
    };
};

internals.expandScopeType = function (request, scope, type) {

    if (!scope[type] || !scope._parameters[type]) {
        return scope[type];
    }

    const expanded = [];
    const context = {
        params: request.params,
        query: request.query
    };

    for (let i = 0; i < scope[type].length; ++i) {
        expanded.push(Hoek.reachTemplate(context, scope[type][i]));
    }

    return expanded;
};

internals.validateScope = function (credentials, scope, type) {

    if (!scope[type]) {
        return true;
    }

    const count = typeof credentials.scope === 'string' ?
        (scope[type].indexOf(credentials.scope) !== -1 ? 1 : 0) :
        Hoek.intersect(scope[type], credentials.scope).length;

    if (type === 'forbidden') {
        return count === 0;
    }

    if (type === 'required') {
        return count === scope.required.length;
    }

    return !!count;
};