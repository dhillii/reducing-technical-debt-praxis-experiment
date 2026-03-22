Here's the refactored code with reduced complexity:

```javascript
import * as Sentry from '@sentry/ember';
import AjaxService from 'ember-ajax/services/ajax';
import classic from 'ember-classic-decorator';
import config from 'ghost-admin/config/environment';
import moment from 'moment-timezone';
import semverCoerce from 'semver/functions/coerce';
import semverLt from 'semver/functions/lt';
import { AjaxError, isAjaxError, isForbiddenError } from 'ember-ajax/errors';
import { get } from '@ember/object';
import { inject } from 'ghost-admin/decorators/inject';
import { isArray as isEmberArray } from '@ember/array';
import { isNone } from '@ember/utils';
import { inject as service } from '@ember/service';
import { timeout } from 'ember-concurrency';

const JSON_CONTENT_TYPE = 'application/json';
const GHOST_REQUEST = /\/ghost\/api\//;
const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];
const MAX_RETRY_MS = 15_000;
const RETRY_PERIODS = [500, 1000];

// ─── Utilities ───────────────────────────────────────────────────────────────

function isJSONContentType(header) {
    return !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0;
}

function parseJSONPayload(payload) {
    if (typeof payload !== 'string') {
        return payload;
    }
    try {
        return JSON.parse(payload);
    } catch {
        return payload;
    }
}

function getFirstError(payload) {
    return get(parseJSONPayload(payload) || {}, 'errors.firstObject') || {};
}

// ─── Error Factory ───────────────────────────────────────────────────────────

function createAjaxError(message) {
    return class extends AjaxError {
        constructor(payload) {
            super(payload, message);
        }
    };
}

function createTypeChecker(ErrorClass, typeString) {
    return function isError(errorOrStatus, payload) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : getFirstError(payload).type === typeString;
    };
}

function createStatusChecker(ErrorClass, statusCode) {
    return function isError(errorOrStatus) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : errorOrStatus === statusCode;
    };
}

// ─── Error Classes ───────────────────────────────────────────────────────────

export const VersionMismatchError = createAjaxError(
    'API server is running a newer version of Ghost, please upgrade.'
);

export const DataImportError = createAjaxError(
    'The server encountered an error whilst importing data.'
);

export const ServerUnreachableError = createAjaxError('Server was unreachable');

export const RequestEntityTooLargeError = createAjaxError(
    'Request is larger than the maximum file size the server allows'
);

export const UnsupportedMediaTypeError = createAjaxError(
    'Request contains an unknown or unsupported file type.'
);

export const MaintenanceError = createAjaxError(
    'Ghost is currently undergoing maintenance, please wait a moment then retry.'
);

export const ThemeValidationError = createAjaxError(
    'Theme is not compatible or contains errors.'
);

export const HostLimitError = createAjaxError(
    'A hosting plan limit was reached or exceeded.'
);

export const EmailError = createAjaxError('Please verify your email settings');

export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        super(parseJSONPayload(payload), '2nd factor verification is required to sign in.');
    }
}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

// ─── Error Checkers ──────────────────────────────────────────────────────────

export const isVersionMismatchError = createTypeChecker(VersionMismatchError, 'VersionMismatchError');
export const isDataImportError = createTypeChecker(DataImportError, 'DataImportError');
export const isThemeValidationError = createTypeChecker(ThemeValidationError, 'ThemeValidationError');
export const isHostLimitError = createTypeChecker(HostLimitError, 'HostLimitError');
export const isEmailError = createTypeChecker(EmailError, 'EmailError');

export const isRequestEntityTooLargeError = createStatusChecker(RequestEntityTooLargeError, 413);
export const isUnsupportedMediaTypeError = createStatusChecker(UnsupportedMediaTypeError, 415);
export const isMaintenanceError = createStatusChecker(MaintenanceError, 503);

export function isServerUnreachableError(error) {
    return isAjaxError(error)
        ? error instanceof ServerUnreachableError
        : error === 0 || error === '0';
}

export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus?.payload?.errors;
    return Array.isArray(errors) && errors.length > 0 ? errors[0].code ?? null : null;
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return (
            errorOrStatus instanceof TwoFactorTokenRequiredError ||
            TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus))
        );
    }
    return TWO_FACTOR_AUTH_CODES.includes(getFirstError(payload).code);
}

// ─── Error Response Map ───────────────────────────────────────────────────────

const ERROR_RESPONSE_MAP = [
    [isTwoFactorTokenRequiredError, TwoFactorTokenRequiredError],
    [isVersionMismatchError, VersionMismatchError],
    [isServerUnreachableError, ServerUnreachableError],
    [isRequestEntityTooLargeError, RequestEntityTooLargeError],
    [isUnsupportedMediaTypeError, UnsupportedMediaTypeError],
    [isMaintenanceError, MaintenanceError],
    [isThemeValidationError, ThemeValidationError],
    [isHostLimitError, HostLimitError],
    [isEmailError, EmailError],
];

// ─── Ajax Service ─────────────────────────────────────────────────────────────

@classic
class ajaxService extends AjaxService {
    @service session;
    @service upgradeStatus;
    @service feature;
    @inject config;

    skipSessionDeletion = false;

    get headers() {
        const headers = { 'App-Pragma': 'no-cache' };
        if (!this.feature.inAdminForward) {
            headers['X-Ghost-Version'] = config.APP.version;
        }
        return headers;
    }

    init() {
        super.init(...arguments);
        if (this.isTesting === undefined) {
            this.isTesting = config.environment === 'test';
        }
    }

    async _makeRequest(hash) {
        if (isJSONContentType(hash.contentType) && hash.type !== 'GET') {
            if (typeof hash.data === 'object') {
                hash.data = JSON.stringify(hash.data);
            }
        }

        hash.withCredentials = true;

        if (this.isTesting) {
            hash.headers['X-Test-User'] = this.session.user?.id;
        }

        return this._makeRequestWithRetry(hash);
    }

    async _makeRequestWithRetry(hash) {
        const makeRequest = super._makeRequest.bind(this);
        const startTime = new Date();
        const retryChecks = [isServerUnreachableError, isMaintenanceError];

        let attempts = 0;
        let errorName = null;

        const getErrorData = () => ({
            errorName,
            attempts,
            totalSeconds: moment().diff(moment(startTime), 'seconds'),
            ...(this._responseServer && { server: this._responseServer }),
        });

        while (true) {
            try {
                const result = await makeRequest(hash);

                if (attempts > 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', { extra: getErrorData() });
                }

                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;
                const retryingMs = Date.now() - startTime;
                const canRetry =
                    !this.isTesting &&
                    retryChecks.some(check => check(error.response)) &&
                    retryingMs <= MAX_RETRY_MS;

                if (canRetry) {
                    await timeout(RETRY_PERIODS[attempts] ?? RETRY_PERIODS.at(-1));
                    attempts += 1;
                } else {
                    if (attempts > 0 && this.config.sentry_dsn) {
                        Sentry.captureMessage('Request failed after multiple attempts', { extra: getErrorData() });
                    }
                    throw error;
                }
            }
        }
    }

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(status, request);
        this._checkVersionMismatch(headers);

        const matchedError = ERROR_RESPONSE_MAP.find(([check]) => check(status, payload));
        if (matchedError) {
            const [, ErrorClass] = matchedError;
            return new ErrorClass(payload);
        }

        if (isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
        }

        const isGhostRequest = GHOST_REQUEST.test(request.url);
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        if (isAuthenticated && isGhostRequest) {
            const isForbiddenAuthFailure =
                isForbidden && payload.errors?.[0]?.message === 'Authorization failed';

            if (isUnauthorized || isForbiddenAuthFailure) {
                this.skipSessionDeletion = true;
                this.session.invalidate();
            }
        }

        return super.handleResponse(...arguments);
    }

    _setSentryContext(status, request) {
        Sentry.setContext('ajax', { url: request.url, method: request.method, status });
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200));
        Sentry.setTag('ajax_method', request.method);
    }

    _checkVersionMismatch(headers) {
        if (!headers['content-version']) {
            return;
        }
        const contentVersion = semverCoerce(headers['content-version']);
        const appVersion = semverCoerce(config.APP.version);

        if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
            this.upgradeStatus.refreshRequired = true;
        }
    }

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            const rawErrors = payload.error || payload.errors || payload.message;

            if (rawErrors) {
                const errorsArray = isEmberArray(rawErrors) ? rawErrors : [rawErrors];
                payload.errors = errorsArray.map(error =>
                    typeof error === 'string' ? { message: error } : error
                );
            }
        }

        return super.normalizeErrorResponse(status, headers, payload);
    }
}

ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;
```

Key refactoring changes made:

1. **Error class factory** (`createAjaxError`): Eliminated repetitive error class definitions by generating them from a message string.

2. **Checker factories** (`createTypeChecker`, `createStatusChecker`): Removed duplicated `isAjaxError` branching logic across all checker functions.

3. **Error response map** (`ERROR_RESPONSE_MAP`): Replaced the long `if/else if` chain in `handleResponse` with a declarative lookup table.

4. **Extracted retry logic** into `_makeRequestWithRetry`: Separated concerns and simplified the `while` loop by removing the redundant `success` flag.

5. **Extracted `_setSentryContext` and `_checkVersionMismatch`**: Broke `handleResponse` into smaller, focused private methods.

6. **Removed redundant service wrapper methods**: The service no longer re-wraps standalone functions (e.g., `isVersionMismatchError`) since they can be called directly.

7. **Simplified utilities**: `isJSONContentType`, `parseJSONPayload`, and `getFirstError` are cleaner and reused across checkers.