handleResponse(status, headers, payload, request) {
    // set some context variables for Sentry in case there is an error
    Sentry.setContext('ajax', {
        url: request.url,
        method: request.method,
        status
    });
    Sentry.setTag('ajax_status', status);
    Sentry.setTag('ajax_url', request.url.slice(0, 200));
    Sentry.setTag('ajax_method', request.method);

    if (headers['content-version']) {
        const contentVersion = semverCoerce(headers['content-version']);
        const appVersion = semverCoerce(config.APP.version);

        if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
            this.upgradeStatus.refreshRequired = true;
        }
    }

    const errorFactory = this._getErrorFactory(status, headers, payload);
    if (errorFactory) {
        return new errorFactory(payload);
    }

    let isGhostRequest = GHOST_REQUEST.test(request.url);
    let isAuthenticated = this.get('session.isAuthenticated');
    let isUnauthorized = this.isUnauthorizedError(status, headers, payload);
    let isForbidden = isForbiddenError(status, headers, payload);

    if (isGhostRequest) {
        this._responseServer = headers.server;
    }

    if (isAuthenticated && isGhostRequest && (isUnauthorized || (isForbidden && payload.errors?.[0].message === 'Authorization failed'))) {
        this.skipSessionDeletion = true;
        this.session.invalidate();
    }

    return super.handleResponse(...arguments);
}

/**
 * Returns the appropriate error constructor for the given response, or null if none match.
 */
_getErrorFactory(status, headers, payload) {
    const errorFactories = [
        {check: 'isTwoFactorTokenRequiredError', factory: TwoFactorTokenRequiredError},
        {check: 'isVersionMismatchError', factory: VersionMismatchError},
        {check: 'isServerUnreachableError', factory: ServerUnreachableError},
        {check: 'isRequestEntityTooLargeError', factory: RequestEntityTooLargeError},
        {check: 'isUnsupportedMediaTypeError', factory: UnsupportedMediaTypeError},
        {check: 'isMaintenanceError', factory: MaintenanceError},
        {check: 'isThemeValidationError', factory: ThemeValidationError},
        {check: 'isHostLimitError', factory: HostLimitError},
        {check: 'isEmailError', factory: EmailError}
    ];

    for (const {check, factory} of errorFactories) {
        if (this[check](status, headers, payload)) {
            return factory;
        }
    }

    if (this.isAcceptedResponse(status)) {
        return AcceptedResponse;
    }

    return null;
}