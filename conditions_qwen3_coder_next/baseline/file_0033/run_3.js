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

    // Check for known error types and return appropriate error instances
    const errorChecks = [
        {check: () => this.isTwoFactorTokenRequiredError(status, headers, payload), error: () => new TwoFactorTokenRequiredError(payload)},
        {check: () => this.isVersionMismatchError(status, headers, payload), error: () => new VersionMismatchError(payload)},
        {check: () => this.isServerUnreachableError(status, headers, payload), error: () => new ServerUnreachableError(payload)},
        {check: () => this.isRequestEntityTooLargeError(status, headers, payload), error: () => new RequestEntityTooLargeError(payload)},
        {check: () => this.isUnsupportedMediaTypeError(status, headers, payload), error: () => new UnsupportedMediaTypeError(payload)},
        {check: () => this.isMaintenanceError(status, headers, payload), error: () => new MaintenanceError(payload)},
        {check: () => this.isThemeValidationError(status, headers, payload), error: () => new ThemeValidationError(payload)},
        {check: () => this.isHostLimitError(status, headers, payload), error: () => new HostLimitError(payload)},
        {check: () => this.isEmailError(status, headers, payload), error: () => new EmailError(payload)},
        {check: () => this.isAcceptedResponse(status), error: () => new AcceptedResponse(payload)}
    ];

    for (const {check, error} of errorChecks) {
        if (check()) {
            return error();
        }
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