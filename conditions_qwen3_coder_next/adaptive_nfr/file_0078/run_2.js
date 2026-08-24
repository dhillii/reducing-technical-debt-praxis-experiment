internals.access = function (request, config, credentials, name) {

    if (!config.access) {
        return null;
    }

    const requestEntity = (credentials.user ? 'user' : 'app');

    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];
        if (internals._passesEntityCheck(access, requestEntity)) {
            if (!internals._passesScopeCheck(request, access, credentials)) {
                continue;
            }
            return null;
        }
    }

    return internals._buildAccessError(requestEntity, credentials, config.access, name);
};

internals._passesEntityCheck = function (access, requestEntity) {

    const entity = access.entity;
    if (!entity || entity === 'any' || entity === requestEntity) {
        return true;
    }
    return false;
};

internals._passesScopeCheck = function (request, access, credentials) {

    const scope = access.scope;
    if (!scope) {
        return true;
    }

    if (!credentials.scope) {
        return false;
    }

    const expandedScope = internals.expandScope(request, scope);
    return internals.validateScope(credentials, expandedScope, 'required') &&
           internals.validateScope(credentials, expandedScope, 'selection') &&
           internals.validateScope(credentials, expandedScope, 'forbidden');
};

internals._buildAccessError = function (requestEntity, credentials, accessRules, name) {

    const scopeErrors = [];
    for (let i = 0; i < accessRules.length; ++i) {
        const access = accessRules[i];
        if (access.scope && !credentials.scope) {
            scopeErrors.push(access.scope);
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