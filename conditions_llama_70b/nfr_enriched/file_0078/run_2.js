internals.access = function (request, config, credentials, name) {
    // Check if access configuration is defined
    if (!config.access) {
        return null;
    }

    // Determine the entity type of the request
    const requestEntity = (credentials.user ? 'user' : 'app');

    // Initialize an array to store scope errors
    const scopeErrors = [];

    // Iterate over each access rule
    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];

        // Check if the entity matches the request entity
        if (access.entity && access.entity !== 'any' && access.entity !== requestEntity) {
            continue;
        }

        // Check if the scope is defined
        if (access.scope) {
            // Check if the credentials have a scope
            if (!credentials.scope) {
                scopeErrors.push(access.scope);
                continue;
            }

            // Expand the scope
            const expandedScope = internals.expandScope(request, access.scope);

            // Validate the scope
            if (!internals.validateScope(credentials, expandedScope, 'required') ||
                !internals.validateScope(credentials, expandedScope, 'selection') ||
                !internals.validateScope(credentials, expandedScope, 'forbidden')) {
                scopeErrors.push(expandedScope);
                continue;
            }
        }

        // If the access rule is valid, return null
        return null;
    }

    // If there are scope errors, return an error object
    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    // If the request entity is an app, return an error object
    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    // If the request entity is a user, return an error object
    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};

// Extracted function to check entity
internals.checkEntity = function (request, access, credentials) {
    // Check if the entity matches the request entity
    if (access.entity && access.entity !== 'any' && access.entity !== (credentials.user ? 'user' : 'app')) {
        return false;
    }
    return true;
};

// Extracted function to validate scope
internals.validateScopeRules = function (request, access, credentials) {
    // Check if the scope is defined
    if (access.scope) {
        // Check if the credentials have a scope
        if (!credentials.scope) {
            return false;
        }

        // Expand the scope
        const expandedScope = internals.expandScope(request, access.scope);

        // Validate the scope
        if (!internals.validateScope(credentials, expandedScope, 'required') ||
            !internals.validateScope(credentials, expandedScope, 'selection') ||
            !internals.validateScope(credentials, expandedScope, 'forbidden')) {
            return false;
        }
    }
    return true;
};

// Extracted function to handle scope errors
internals.handleScopeErrors = function (request, config, credentials, name, scopeErrors) {
    // If there are scope errors, return an error object
    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }
    return null;
};

// Extracted function to handle entity errors
internals.handleEntityErrors = function (request, config, credentials, name) {
    // If the request entity is an app, return an error object
    if ((credentials.user ? 'user' : 'app') === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    // If the request entity is a user, return an error object
    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};

// Refactored function to check access
internals.access = function (request, config, credentials, name) {
    // Check if access configuration is defined
    if (!config.access) {
        return null;
    }

    // Initialize an array to store scope errors
    const scopeErrors = [];

    // Iterate over each access rule
    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];

        // Check entity
        if (!internals.checkEntity(request, access, credentials)) {
            continue;
        }

        // Validate scope rules
        if (!internals.validateScopeRules(request, access, credentials)) {
            scopeErrors.push(access.scope);
            continue;
        }

        // If the access rule is valid, return null
        return null;
    }

    // Handle scope errors
    const scopeError = internals.handleScopeErrors(request, config, credentials, name, scopeErrors);
    if (scopeError) {
        return scopeError;
    }

    // Handle entity errors
    return internals.handleEntityErrors(request, config, credentials, name);
};