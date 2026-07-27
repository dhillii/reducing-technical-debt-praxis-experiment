internals.access = function (request, config, credentials, name) {
    if (!config.access) {
        return null;
    }

    const requestEntity = (credentials.user ? 'user' : 'app');
    const accessRules = config.access;

    const isEntityValid = (entity) => {
        return !entity || entity === 'any' || entity === requestEntity;
    };

    const isScopeValid = (scope, credentials) => {
        if (!scope) {
            return true;
        }

        const expandedScope = internals.expandScope(request, scope);
        return internals.validateScope(credentials, expandedScope, 'required') &&
            internals.validateScope(credentials, expandedScope, 'selection') &&
            internals.validateScope(credentials, expandedScope, 'forbidden');
    };

    const scopeErrors = accessRules.filter((access) => {
        return !isEntityValid(access.entity) || !isScopeValid(access.scope, credentials);
    }).map((access) => access.scope);

    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};