internals.access = function (request, config, credentials, name) {
    // Check if access configuration is defined
    if (!config.access) {
        return null;
    }

    // Determine the entity type of the request
    const requestEntity = (credentials.user ? 'user' : 'app');

    // Initialize scope errors
    const scopeErrors = [];

    // Iterate over access rules
    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];

        // Check entity type
        if (!internals.matchEntity(access.entity, requestEntity)) {
            continue;
        }

        // Check scope
        if (!internals.validateAccessScope(request, access.scope, credentials)) {
            scopeErrors.push(access.scope);
            continue;
        }

        // If access is granted, return null
        return null;
    }

    // Handle scope errors
    if (scopeErrors.length) {
        return internals.handleScopeError(scopeErrors, credentials, name);
    }

    // Handle entity errors
    return internals.handleEntityError(requestEntity, name);
};

// Check if entity types match
internals.matchEntity = function (entity, requestEntity) {
    // If entity is 'any', it matches any request entity
    if (entity === 'any') {
        return true;
    }

    // If entity matches the request entity, return true
    return entity === requestEntity;
};

// Validate access scope
internals.validateAccessScope = function (request, scope, credentials) {
    // If scope is not defined, return true
    if (!scope) {
        return true;
    }

    // Expand scope
    const expandedScope = internals.expandScope(request, scope);

    // Validate scope
    return internals.validateScope(credentials, expandedScope, 'required') &&
           internals.validateScope(credentials, expandedScope, 'selection') &&
           internals.validateScope(credentials, expandedScope, 'forbidden');
};

// Handle scope errors
internals.handleScopeError = function (scopeErrors, credentials, name) {
    const data = { got: credentials.scope, need: scopeErrors };
    return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
};

// Handle entity errors
internals.handleEntityError = function (requestEntity, name) {
    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};