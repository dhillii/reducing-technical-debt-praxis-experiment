handleResponse(status, headers, payload, request) {
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

    const errorHandlers = [
        { check: this.isTwoFactorTokenRequiredError, error: TwoFactorTokenRequiredError },
        { check: this.isVersionMismatchError, error: VersionMismatchError },
        { check: this.isServerUnreachableError, error: ServerUnreachableError },
        { check: this.isRequestEntityTooLargeError, error: RequestEntityTooLargeError },
        { check: this.isUnsupportedMediaTypeError, error: UnsupportedMediaTypeError },
        { check: this.isMaintenanceError, error: MaintenanceError },
        { check: this.isThemeValidationError, error: ThemeValidationError },
        { check: this.isHostLimitError, error: HostLimitError },
        { check: this.isEmailError, error: EmailError },
        { check: this.isAcceptedResponse, error: AcceptedResponse }
    ];

    for (const { check, error } of errorHandlers) {
        if (check(status, headers, payload)) {
            return new error(payload);
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