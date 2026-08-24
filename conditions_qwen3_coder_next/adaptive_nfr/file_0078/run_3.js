internals.access = function (request, config, credentials, name) {

    if (!config.access) {
        return null;
    }

    const requestEntity = (credentials.user ? 'user' : 'app');

    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];

        if (access.entity && !internals.isEntityMatch(access.entity, requestEntity)) {
            continue;
        }

        const scopeError = internals.checkScope(request, credentials, access, name);
        if (!scopeError) {
            return null;
        }
    }

    const scopeErrors = config.access.filter(access => access.scope && !internals.isScopeValid(credentials, access)).map(access => access.scope);
    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};

internals.isEntityMatch = function (entity, requestEntity) {

    return entity === 'any' || entity === requestEntity;
};

internals.checkScope = function (request, credentials, access, name) {

    const scope = access.scope;
    if (!scope) {
        return null;
    }

    if (!credentials.scope) {
        return true;
    }

    const expandedScope = internals.expandScope(request, scope);
    const hasRequired = internals.validateScope(credentials, expandedScope, 'required');
    const hasSelection = internals.validateScope(credentials, expandedScope, 'selection');
    const hasForbidden = !internals.validateScope(credentials, expandedScope, 'forbidden');

    if (!hasRequired || !hasSelection || hasForbidden) {
        return true;
    }

    return null;
};

internals.isScopeValid = function (credentials, access) {

    if (!access.scope) {
        return true;
    }

    if (!credentials.scope) {
        return false;
    }

    return false;
};