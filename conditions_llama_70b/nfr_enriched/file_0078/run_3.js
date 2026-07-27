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

    // If the request entity is an application, return an error object
    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    // If the request entity is a user, return an error object
    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};

// Extracted function to check entity
internals.checkEntity = function (request, access, requestEntity) {
    // Check if the entity matches the request entity
    if (access.entity && access.entity !== 'any' && access.entity !== requestEntity) {
        return false;
    }
    return true;
};

// Extracted function to validate scope
internals.validateScopeRules = function (credentials, scope) {
    // Check if the scope is defined
    if (!scope) {
        return true;
    }

    // Check if the credentials have a scope
    if (!credentials.scope) {
        return false;
    }

    // Expand the scope
    const expandedScope = internals.expandScope(null, scope);

    // Validate the scope
    return internals.validateScope(credentials, expandedScope, 'required') &&
           internals.validateScope(credentials, expandedScope, 'selection') &&
           internals.validateScope(credentials, expandedScope, 'forbidden');
};

// Extracted function to handle scope errors
internals.handleScopeErrors = function (scopeErrors, credentials, name) {
    // If there are scope errors, return an error object
    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }
    return null;
};

// Extracted function to handle entity errors
internals.handleEntityErrors = function (requestEntity, name) {
    // If the request entity is an application, return an error object
    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    // If the request entity is a user, return an error object
    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};