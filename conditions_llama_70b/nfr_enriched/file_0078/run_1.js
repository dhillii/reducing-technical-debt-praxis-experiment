internals.access = function (request, config, credentials, name) {
    // Check if access configuration is present
    if (!config.access) {
        return null;
    }

    // Determine the entity type
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
        return internals.handleScopeError(credentials, scopeErrors, name);
    }

    // Handle entity errors
    return internals.handleEntityError(requestEntity, name);
};

// Check if entity matches
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
    return internals.validateScope(credentials, expandedScope);
};

// Validate scope
internals.validateScope = function (credentials, scope) {
    // Check required scope
    if (!internals.validateScopeType(credentials, scope, 'required')) {
        return false;
    }

    // Check selection scope
    if (!internals.validateScopeType(credentials, scope, 'selection')) {
        return false;
    }

    // Check forbidden scope
    if (!internals.validateScopeType(credentials, scope, 'forbidden')) {
        return false;
    }

    // If all scope types are valid, return true
    return true;
};

// Validate scope type
internals.validateScopeType = function (credentials, scope, type) {
    // If scope type is not defined, return true
    if (!scope[type]) {
        return true;
    }

    // Count matching scopes
    const count = typeof credentials.scope === 'string' ?
        (scope[type].indexOf(credentials.scope) !== -1 ? 1 : 0) :
        Hoek.intersect(scope[type], credentials.scope).length;

    // Check scope type
    if (type === 'forbidden') {
        return count === 0;
    }

    if (type === 'required') {
        return count === scope.required.length;
    }

    return !!count;
};

// Handle scope error
internals.handleScopeError = function (credentials, scopeErrors, name) {
    // Create error data
    const data = { got: credentials.scope, need: scopeErrors };

    // Return error
    return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
};

// Handle entity error
internals.handleEntityError = function (requestEntity, name) {
    // Check entity type
    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};