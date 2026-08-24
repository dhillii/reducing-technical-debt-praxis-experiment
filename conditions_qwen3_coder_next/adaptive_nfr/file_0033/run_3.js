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
        this._handleContentVersion(headers, request);
    }

    const error = this._createErrorFromStatus(status, headers, payload);
    if (error) {
        return error;
    }

    this._handleAuthAndRequestErrors(status, headers, payload, request);
    return super.handleResponse(...arguments);
}

/**
 * Handles content version check and upgrade status
 */
_handleContentVersion(headers, request) {
    const contentVersion = semverCoerce(headers['content-version']);
    const appVersion = semverCoerce(config.APP.version);

    if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
        this.upgradeStatus.refreshRequired = true;
    }
}

/**
 * Creates error instance based on status, headers, and payload
 */
_createErrorFromStatus(status, headers, payload) {
    // Check error types in order of specificity
    const errorChecks = [
        {check: () => this.isTwoFactorTokenRequiredError(status, headers, payload), err: () => new TwoFactorTokenRequiredError(payload)},
        {check: () => this.isVersionMismatchError(status, headers, payload), err: () => new VersionMismatchError(payload)},
        {check: () => this.isServerUnreachableError(status, headers, payload), err: () => new ServerUnreachableError(payload)},
        {check: () => this.isRequestEntityTooLargeError(status, headers, payload), err: () => new RequestEntityTooLargeError(payload)},
        {check: () => this.isUnsupportedMediaTypeError(status, headers, payload), err: () => new UnsupportedMediaTypeError(payload)},
        {check: () => this.isMaintenanceError(status, headers, payload), err: () => new MaintenanceError(payload)},
        {check: () => this.isThemeValidationError(status, headers, payload), err: () => new ThemeValidationError(payload)},
        {check: () => this.isHostLimitError(status, headers, payload), err: () => new HostLimitError(payload)},
        {check: () => this.isEmailError(status, headers, payload), err: () => new EmailError(payload)},
        {check: () => this.isAcceptedResponse(status), err: () => new AcceptedResponse(payload)}
    ];

    for (const {check, err} of errorChecks) {
        if (check()) {
            return err();
        }
    }

    return null;
}

/**
 * Handles authentication and request-specific error conditions
 */
_handleAuthAndRequestErrors(status, headers, payload, request) {
    const isGhostRequest = GHOST_REQUEST.test(request.url);
    const isAuthenticated = this.get('session.isAuthenticated');
    const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
    const isForbidden = isForbiddenError(status, headers, payload);

    if (isGhostRequest) {
        this._responseServer = headers.server;
    }

    if (isAuthenticated && isGhostRequest && (isUnauthorized || (isForbidden && payload.errors?.[0].message === 'Authorization failed'))) {
        this.skipSessionDeletion = true;
        this.session.invalidate();
    }
}