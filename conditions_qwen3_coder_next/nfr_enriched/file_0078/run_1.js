internals.access = function (request, config, credentials, name) {

    if (!config.access) {
        return null;
    }

    const requestEntity = (credentials.user ? 'user' : 'app');

    for (let i = 0; i < config.access.length; ++i) {
        const error = internals.checkAccessEntry(request, config.access[i], credentials, requestEntity, name);
        if (!error) {
            return null;
        }
    }

    return internals.buildAccessError(requestEntity, credentials, config.access, name);
};


internals.checkAccessEntry = function (request, access, credentials, requestEntity, name) {

    // Check entity
    const entity = access.entity;
    if (entity &&
        entity !== 'any' &&
        entity !== requestEntity) {

        return { skipped: true };
    }

    // Check scope
    const scope = access.scope;
    if (scope) {
        if (!credentials.scope) {
            return { scopeError: scope };
        }

        const expandedScope = internals.expandScope(request, scope);
        if (!internals.validateScope(credentials, expandedScope, 'required') ||
            !internals.validateScope(credentials, expandedScope, 'selection') ||
            !internals.validateScope(credentials, expandedScope, 'forbidden')) {

            return { scopeError: scope };
        }
    }

    return null;
};


internals.buildAccessError = function (requestEntity, credentials, accessRules, name) {

    const scopeErrors = [];
    for (let i = 0; i < accessRules.length; ++i) {
        if (accessRules[i].scope && credentials.scope) {
            scopeErrors.push(accessRules[i].scope);
        }
    }

    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};