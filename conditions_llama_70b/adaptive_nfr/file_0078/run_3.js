internals.access = function (request, config, credentials, name) {
    if (!config.access) {
        return null;
    }

    const requestEntity = (credentials.user ? 'user' : 'app');
    const accessRules = config.access;

    const validateAccessRule = (accessRule) => {
        // Check entity
        if (accessRule.entity && accessRule.entity !== 'any' && accessRule.entity !== requestEntity) {
            return false;
        }

        // Check scope
        if (accessRule.scope) {
            if (!credentials.scope) {
                return false;
            }

            const expandedScope = internals.expandScope(request, accessRule.scope);
            if (!internals.validateScope(credentials, expandedScope, 'required') ||
                !internals.validateScope(credentials, expandedScope, 'selection') ||
                !internals.validateScope(credentials, expandedScope, 'forbidden')) {
                return false;
            }
        }

        return true;
    };

    const validAccessRules = accessRules.filter(validateAccessRule);

    if (validAccessRules.length > 0) {
        return null;
    }

    // Scope error
    const invalidAccessRules = accessRules.filter((accessRule) => !validateAccessRule(accessRule));
    if (invalidAccessRules.length > 0) {
        const data = { got: credentials.scope, need: invalidAccessRules.map((rule) => rule.scope) };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    // Entity error
    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};