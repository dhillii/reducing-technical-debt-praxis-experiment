handleResponse(status, headers, payload, request) {
        // set some context variables for Sentry in case there is an error
        Sentry.setContext('ajax', {
            url: request.url,
            method: request.method,
            status
        });
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200)); // the max length of a tag value is 200 characters
        Sentry.setTag('ajax_method', request.method);

        if (headers['content-version']) {
            const contentVersion = semverCoerce(headers['content-version']);
            const appVersion = semverCoerce(config.APP.version);

            if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
                this.upgradeStatus.refreshRequired = true;
            }
        }

        // Use lookup table for error type checks to reduce conditional branching
        const error Checkers = [
            {
                isMatch: (s, h, p) => this.isTwoFactorTokenRequiredError(s, h, p),
                factory: () => new TwoFactorTokenRequiredError(payload)
            },
            {
                isMatch: (s, h, p) => this.isVersionMismatchError(s, h, p),
                factory: () => new VersionMismatchError(payload)
            },
            {
                isMatch: (s, h, p) => this.isServerUnreachableError(s, h, p),
                factory: () => new ServerUnreachableError(payload)
            },
            {
                isMatch: (s, h, p) => this.isRequestEntityTooLargeError(s, h, p),
                factory: () => new RequestEntityTooLargeError(payload)
            },
            {
                isMatch: (s, h, p) => this.isUnsupportedMediaTypeError(s, h, p),
                factory: () => new UnsupportedMediaTypeError(payload)
            },
            {
                isMatch: (s, h, p) => this.isMaintenanceError(s, h, p),
                factory: () => new MaintenanceError(payload)
            },
            {
                isMatch: (s, h, p) => this.isThemeValidationError(s, h, p),
                factory: () => new ThemeValidationError(payload)
            },
            {
                isMatch: (s, h, p) => this.isHostLimitError(s, h, p),
                factory: () => new HostLimitError(payload)
            },
            {
                isMatch: (s, h, p) => this.isEmailError(s, h, p),
                factory: () => new EmailError(payload)
            },
            {
                isMatch: (s) => this.isAcceptedResponse(s),
                factory: () => new AcceptedResponse(payload)
            }
        ];

        for (const checker of errorCheckers) {
            if (checker.isMatch(status, headers, payload)) {
                return checker.factory();
            }
        }

        let isGhostRequest = GHOST_REQUEST.test(request.url);
        let isAuthenticated = this.get('session.isAuthenticated');
        let isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        let isForbidden = isForbiddenError(status, headers, payload);

        // used when reporting connection errors, helps distinguish CDN
        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        if (isAuthenticated && isGhostRequest && (isUnauthorized || (isForbidden && payload.errors?.[0].message === 'Authorization failed'))) {
            this.skipSessionDeletion = true;
            this.session.invalidate();
        }

        return super.handleResponse(...arguments);
    }