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

    this._handleContentVersion(headers);

    const error = this._createErrorFromStatus(status, headers, payload);
    if (error) {
        return error;
    }

    this._handleAuthAndSession(request, status, headers, payload);

    return super.handleResponse(...arguments);
}

_handleContentVersion(headers) {
    if (!headers['content-version']) {
        return;
    }

    const contentVersion = semverCoerce(headers['content-version']);
    const appVersion = semverCoerce(config.APP.version);

    if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
        this.upgradeStatus.refreshRequired = true;
    }
}

_createErrorFromStatus(status, headers, payload) {
    if (this.isTwoFactorTokenRequiredError(status, headers, payload)) {
        return new TwoFactorTokenRequiredError(payload);
    }
    if (this.isVersionMismatchError(status, headers, payload)) {
        return new VersionMismatchError(payload);
    }
    if (this.isServerUnreachableError(status, headers, payload)) {
        return new ServerUnreachableError(payload);
    }
    if (this.isRequestEntityTooLargeError(status, headers, payload)) {
        return new RequestEntityTooLargeError(payload);
    }
    if (this.isUnsupportedMediaTypeError(status, headers, payload)) {
        return new UnsupportedMediaTypeError(payload);
    }
    if (this.isMaintenanceError(status, headers, payload)) {
        return new MaintenanceError(payload);
    }
    if (this.isThemeValidationError(status, headers, payload)) {
        return new ThemeValidationError(payload);
    }
    if (this.isHostLimitError(status, headers, payload)) {
        return new HostLimitError(payload);
    }
    if (this.isEmailError(status, headers, payload)) {
        return new EmailError(payload);
    }
    if (this.isAcceptedResponse(status)) {
        return new AcceptedResponse(payload);
    }
    return null;
}

_handleAuthAndSession(request, status, headers, payload) {
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