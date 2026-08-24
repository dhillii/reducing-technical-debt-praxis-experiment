internals.access = function (request, config, credentials, name) {

    if (!config.access) {
        return null;
    }

    const requestEntity = (credentials.user ? 'user' : 'app');

    for (let i = 0; i < config.access.length; ++i) {
        const result = internals.checkAccessEntry(request, config, credentials, name, i, requestEntity);
        if (!result) {
            return null;
        }

        if (typeof result === 'string') {
            return internals.buildScopeError(request, credentials, name, result);
        }

        return result;
    }

    return internals.buildEntityError(requestEntity, name);
};


internals.checkAccessEntry = function (request, config, credentials, name, index, requestEntity) {

    const access = config.access[index];

    // Check entity
    const entity = access.entity;
    if (entity &&
        entity !== 'any' &&
        entity !== requestEntity) {

        return 'scope';
    }

    // Check scope
    const scope = access.scope;
    if (scope) {
        return internals.validateScopeAccess(request, credentials, scope, name);
    }

    return null;
};


internals.validateScopeAccess = function (request, credentials, scope, name) {

    if (!credentials.scope) {
        return 'scope';
    }

    const expandedScope = internals.expandScope(request, scope);
    if (!internals.validateScope(credentials, expandedScope, 'required') ||
        !internals.validateScope(credentials, expandedScope, 'selection') ||
        !internals.validateScope(credentials, expandedScope, 'forbidden')) {

        return 'scope';
    }

    return null;
};


internals.buildScopeError = function (request, credentials, name, unusedType /*= 'scope'*/) {

    const scopeErrors = [];
    for (let i = 0; i < request.config.access.length; ++i) {
        const access = request.config.access[i];
        if (access.scope && (!credentials.scope || !internals.checkScope(access.scope, credentials, request))) {
            scopeErrors.push(access.scope);
        }
    }

    const data = { got: credentials.scope, need: scopeErrors };
    return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
};


internals.checkScope = function (scope, credentials, request) {

    const expandedScope = internals.expandScope(request, scope);
    return internals.validateScope(credentials, expandedScope, 'required') &&
           internals.validateScope(credentials, expandedScope, 'selection') &&
           !internals.validateScope(credentials, expandedScope, 'forbidden');
};


internals.buildEntityError = function (requestEntity, name) {

    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};