internals.access = function (request, config, credentials, name) {

    if (!config.access) {
        return null;
    }

    const requestEntity = (credentials.user ? 'user' : 'app');
    const scopeErrors = [];

    for (let i = 0; i < config.access.length; ++i) {
        const access = config.access[i];

        if (access.entity && access.entity !== 'any' && access.entity !== requestEntity) {
            continue;
        }

        let scope = access.scope;
        if (scope) {
            if (!credentials.scope) {
                scopeErrors.push(scope);
                continue;
            }

            scope = internals.expandScope(request, scope);
            if (!isValidScope(credentials, scope)) {
                scopeErrors.push(scope);
                continue;
            }
        }

        return null;
    }

    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};

function isValidScope(credentials, scope) {
    return internals.validateScope(credentials, scope, 'required') &&
           internals.validateScope(credentials, scope, 'selection') &&
           internals.validateScope(credentials, scope, 'forbidden');
}