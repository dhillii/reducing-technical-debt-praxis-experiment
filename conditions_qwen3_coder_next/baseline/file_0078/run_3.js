internals.access = function (request, config, credentials, name) {

    if (!config.access) {
        return null;
    }

    const requestEntity = (credentials.user ? 'user' : 'app');
    const hasEntityAccess = (access) => {
        const entity = access.entity;
        if (!entity || entity === 'any' || entity === requestEntity) {
            if (!access.scope) {
                return true;
            }

            const scope = access.scope;
            if (!credentials.scope) {
                return false;
            }

            const validatedScope = internals.expandScope(request, scope);
            return internals.validateScope(credentials, validatedScope, 'required') &&
                   internals.validateScope(credentials, validatedScope, 'selection') &&
                   !internals.validateScope(credentials, validatedScope, 'forbidden');
        }
        return false;
    };

    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];
        if (hasEntityAccess(access)) {
            return null;
        }
    }

    // Scope error
    const scopeErrors = [];
    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];
        if (access.scope && credentials.scope) {
            const scope = internals.expandScope(request, access.scope);
            if (!internals.validateScope(credentials, scope, 'required') ||
                !internals.validateScope(credentials, scope, 'selection') ||
                !internals.validateScope(credentials, scope, 'forbidden')) {
                scopeErrors.push(access.scope);
            }
        }
        else if (access.scope && !credentials.scope) {
            scopeErrors.push(access.scope);
        }
    }

    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    // Entity error
    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};