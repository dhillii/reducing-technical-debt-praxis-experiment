handleResponse(status, headers, payload, request) {
        // set some context variables for Sentry in case there is an error
        this._setSentryContext(request, status);

        this._handleContentVersion(headers);

        if (this._isTwoFactorTokenRequiredError(status, payload)) {
            return new TwoFactorTokenRequiredError(payload);
        } else if (this._isVersionMismatchError(status, payload)) {
            return new VersionMismatchError(payload);
        } else if (this._isServerUnreachableError(status)) {
            return new ServerUnreachableError(payload);
        } else if (this._isRequestEntityTooLargeError(status)) {
            return new RequestEntityTooLargeError(payload);
        } else if (this._isUnsupportedMediaTypeError(status)) {
            return new UnsupportedMediaTypeError(payload);
        } else if (this._isMaintenanceError(status, payload)) {
            return new MaintenanceError(payload);
        } else if (this._isThemeValidationError(status, payload)) {
            return new ThemeValidationError(payload);
        } else if (this._isHostLimitError(status, payload)) {
            return new HostLimitError(payload);
        } else if (this._isEmailError(status, payload)) {
            return new EmailError(payload);
        } else if (this._isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
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
    },

    // private helpers with single responsibility and low complexity

    _setSentryContext(request, status) {
        Sentry.setContext('ajax', {
            url: request.url,
            method: request.method,
            status
        });
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200));
        Sentry.setTag('ajax_method', request.method);
    },

    _handleContentVersion(headers) {
        if (!headers['content-version']) {
            return;
        }
        const contentVersion = semverCoerce(headers['content-version']);
        const appVersion = semverCoerce(config.APP.version);

        if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
            this.upgradeStatus.refreshRequired = true;
        }
    },

    _isTwoFactorTokenRequiredError(status, payload) {
        return this.isTwoFactorTokenRequiredError(status, headers, payload);
    },

    _isVersionMismatchError(status, payload) {
        return this.isVersionMismatchError(status, payload);
    },

    _isServerUnreachableError(status) {
        return this.isServerUnreachableError(status);
    },

    _isRequestEntityTooLargeError(status) {
        return this.isRequestEntityTooLargeError(status);
    },

    _isUnsupportedMediaTypeError(status) {
        return this.isUnsupportedMediaTypeError(status);
    },

    _isMaintenanceError(status, payload) {
        return this.isMaintenanceError(status, payload);
    },

    _isThemeValidationError(status, payload) {
        return this.isThemeValidationError(status, payload);
    },

    _isHostLimitError(status, payload) {
        return this.isHostLimitError(status, payload);
    },

    _isEmailError(status, payload) {
        return this.isEmailError(status, payload);
    },

    _isAcceptedResponse(status) {
        return this.isAcceptedResponse(status);
    }