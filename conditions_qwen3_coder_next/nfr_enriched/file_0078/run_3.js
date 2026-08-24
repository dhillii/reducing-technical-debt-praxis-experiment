internals.access = function (request, config, credentials, name) {

    const accessRules = config.access;
    if (!accessRules) {
        return null;
    }

    const requestEntity = (credentials.user ? 'user' : 'app');

    for (let i = 0; i < accessRules.length; ++i) {
        const error = internals.checkAccessRule(request, accessRules[i], requestEntity, credentials, name);
        if (!error) {
            return null;
        }
    }

    return internals.createAccessError(requestEntity, credentials, accessRules, name);
};


internals.checkAccessRule = function (request, access, requestEntity, credentials, name) {

    // Check entity

    const entity = access.entity;
    if (entity && entity !== 'any' && entity !== requestEntity) {
        return internals.accessRuleFailed(); // Continue to next rule
    }

    // Check scope

    const scope = access.scope;
    if (!scope) {
        return null;
    }

    if (!credentials.scope) {
        return internals.accessRuleFailed();
    }

    const expandedScope = internals.expandScope(request, scope);
    const isValidRequired = internals.validateScope(credentials, expandedScope, 'required');
    const isValidSelection = internals.validateScope(credentials, expandedScope, 'selection');
    const isValidForbidden = internals.validateScope(credentials, expandedScope, 'forbidden');

    if (!isValidRequired || !isValidSelection || !isValidForbidden) {
        return internals.accessRuleFailed();
    }

    return null;
};


internals.accessRuleFailed = function () {

    return { err: true }; // Placeholder to signal rule did not match
};


internals.createAccessError = function (requestEntity, credentials, accessRules, name) {

    const scopeErrors = internals.collectScopeErrors(accessRules, credentials);
    if (scopeErrors.length) {
        const data = { got: credentials.scope, need: scopeErrors };
        return { err: Boom.forbidden('Insufficient scope', data), tags: ['auth', 'scope', 'error', name], data };
    }

    if (requestEntity === 'app') {
        return { err: Boom.forbidden('Application credentials cannot be used on a user endpoint'), tags: ['auth', 'entity', 'user', 'error', name] };
    }

    return { err: Boom.forbidden('User credentials cannot be used on an application endpoint'), tags: ['auth', 'entity', 'app', 'error', name] };
};


internals.collectScopeErrors = function (accessRules, credentials) {

    const errors = [];
    for (let i = 0; i < accessRules.length; ++i) {
        const scope = accessRules[i].scope;
        if (scope && !credentials.scope) {
            errors.push(scope);
        }
    }
    return errors;
};