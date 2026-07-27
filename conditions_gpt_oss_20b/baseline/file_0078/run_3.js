internals.access = function (request, config, credentials, name) {
    if (!config.access) {
        return null;
    }

    const requestEntity = credentials.user ? 'user' : 'app';
    const scopeErrors = [];

    const allowed = config.access.find((access) => {
        if (!isEntityAllowed(access, requestEntity)) {
            return false;
        }

        if (!access.scope) {
            return true;
        }

        if (!credentials.scope) {
            scopeErrors.push(access.scope);
            return false;
        }

        const expanded = internals.expandScope(request, access.scope);
        return internals.validateScope(credentials, expanded, 'required') &&
               internals.validateScope(credentials, expanded, 'selection') &&
               internals.validateScope(credentials, expanded, 'forbidden');
    });

    if (allowed) {
        return null;
    }

    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return {
            err: Boom.forbidden('Insufficient scope', data),
            tags: ['auth', 'scope', 'error', name],
            data
        };
    }

    if (requestEntity === 'app') {
        return {
            err: Boom.forbidden('Application credentials cannot be used on a user endpoint'),
            tags: ['auth', 'entity', 'user', 'error', name]
        };
    }

    return {
        err: Boom.forbidden('User credentials cannot be used on an application endpoint'),
        tags: ['auth', 'entity', 'app', 'error', name]
    };
};

function isEntityAllowed(access, requestEntity) {
    const entity = access.entity;
    return !entity || entity === 'any' || entity === requestEntity;
}