internals.access = function (request, config, credentials, name) {
    // Check if access configuration is defined
    if (!config.access) {
        return null;
    }

    // Determine the entity type of the request
    const requestEntity = (credentials.user ? 'user' : 'app');

    // Iterate over access rules and check entity and scope
    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];

        // Check entity
        if (isEntityMatch(access, requestEntity)) {
            // Check scope
            if (isScopeMatch(request, access, credentials)) {
                return null;
            }
        }
    }

    // Handle scope errors
    return handleScopeErrors(request, config, credentials, name);
};

// Check if entity matches
function isEntityMatch(access, requestEntity) {
    const entity = access.entity;
    return !entity || entity === 'any' || entity === requestEntity;
}

// Check if scope matches
function isScopeMatch(request, access, credentials) {
    const scope = access.scope;
    if (!scope) {
        return true;
    }

    const expandedScope = internals.expandScope(request, scope);
    return internals.validateScope(credentials, expandedScope, 'required') &&
           internals.validateScope(credentials, expandedScope, 'selection') &&
           internals.validateScope(credentials, expandedScope, 'forbidden');
}

// Handle scope errors
function handleScopeErrors(request, config, credentials, name) {
    const scopeErrors = config.access.filter((access) => {
        const entity = access.entity;
        if (entity && entity !== 'any' && entity !== (credentials.user ? 'user' : 'app')) {
            return false;
        }

        const scope = access.scope;
        if (!scope) {
            return false;
        }

        const expandedScope = internals.expandScope(request, scope);
        return !internals.validateScope(credentials, expandedScope, 'required') ||
               !internals.validateScope(credentials, expandedScope, 'selection') ||
               !internals.validateScope(credentials, expandedScope, 'forbidden');
    });

    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors.map((access) => access.scope) };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    // Handle entity errors
    if ((credentials.user ? 'user' : 'app') === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
}