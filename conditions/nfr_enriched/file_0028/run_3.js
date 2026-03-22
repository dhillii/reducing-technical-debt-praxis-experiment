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
const MAX_RETRY_MS = 15_000;
const RETRY_PERIODS = [500, 1000];
const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

// ─── Utilities ───────────────────────────────────────────────────────────────

function isJSONContentType(header) {
    return !isNone(header) && header?.indexOf(JSON_CONTENT_TYPE) === 0;
}

function getJSONPayload(payload) {
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
    return get(payload || {}, 'errors.firstObject');
}

function getFirstErrorType(payload) {
    return get(getFirstError(payload) || {}, 'type');
}

// ─── Error Classes ───────────────────────────────────────────────────────────

const createAjaxError = (message) =>
    class extends AjaxError {
        constructor(payload) {
            super(payload, message);
        }
    };

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
        super(getJSONPayload(payload), '2nd factor verification is required to sign in.');
    }
}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

// ─── Error Type Checkers ─────────────────────────────────────────────────────

function createInstanceChecker(ErrorClass) {
    return (errorOrStatus) => isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof ErrorClass
        : false;
}

function createStatusChecker(ErrorClass, statusCode) {
    return (errorOrStatus) => isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof ErrorClass
        : errorOrStatus === statusCode;
}

function createPayloadTypeChecker(ErrorClass, errorType) {
    return (errorOrStatus, payload) => isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof ErrorClass
        : getFirstErrorType(payload) === errorType;
}

export const isVersionMismatchError = createPayloadTypeChecker(
    VersionMismatchError, 'VersionMismatchError'
);
export const isDataImportError = createPayloadTypeChecker(
    DataImportError, 'DataImportError'
);
export const isThemeValidationError = createPayloadTypeChecker(
    ThemeValidationError, 'ThemeValidationError'
);
export const isHostLimitError = createPayloadTypeChecker(
    HostLimitError, 'HostLimitError'
);
export const isEmailError = createPayloadTypeChecker(
    EmailError, 'EmailError'
);
export const isServerUnreachableError = (error) =>
    isAjaxError(error)
        ? error instanceof ServerUnreachableError
        : error === 0 || error === '0';

export const isRequestEntityTooLargeError = createStatusChecker(
    RequestEntityTooLargeError, 413
);
export const isUnsupportedMediaTypeError = createStatusChecker(
    UnsupportedMediaTypeError, 415
);
export const isMaintenanceError = createStatusChecker(MaintenanceError, 503);
export const isAcceptedResponse = (errorOrStatus) => errorOrStatus === 202;

export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors;
    return Array.isArray(errors) && errors.length > 0 ? errors[0].code ?? null : null;
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return (
            errorOrStatus instanceof TwoFactorTokenRequiredError ||
            TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus))
        );
    }
    return TWO_FACTOR_AUTH_CODES.includes(
        get(getJSONPayload(payload) || {}, 'errors.firstObject.code')
    );
}

// ─── Error Response Map ───────────────────────────────────────────────────────

const ERROR_RESPONSE_MAP = [
    { check: 'isTwoFactorTokenRequiredError', ErrorClass: TwoFactorTokenRequiredError },
    { check: 'isVersionMismatchError',        ErrorClass: VersionMismatchError },
    { check: 'isServerUnreachableError',      ErrorClass: ServerUnreachableError },
    { check: 'isRequestEntityTooLargeError',  ErrorClass: RequestEntityTooLargeError },
    { check: 'isUnsupportedMediaTypeError',   ErrorClass: UnsupportedMediaTypeError },
    { check: 'isMaintenanceError',            ErrorClass: MaintenanceError },
    { check: 'isThemeValidationError',        ErrorClass: ThemeValidationError },
    { check: 'isHostLimitError',              ErrorClass: HostLimitError },
    { check: 'isEmailError',                  ErrorClass: EmailError },
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
        let attempts = 0;
        let errorName = null;

        const getErrorData = () => ({
            errorName,
            attempts,
            totalSeconds: moment().diff(moment(startTime), 'seconds'),
            ...(this._responseServer && { server: this._responseServer }),
        });

        const isRetryableError = (error) =>
            [this.isServerUnreachableError, this.isMaintenanceError].some(
                (check) => check(error.response)
            );

        const getRetryDelay = (attempt) =>
            RETRY_PERIODS[attempt] ?? RETRY_PERIODS[RETRY_PERIODS.length - 1];

        while (true) {
            try {
                const result = await makeRequest(hash);

                if (attempts > 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {
                        extra: getErrorData(),
                    });
                }

                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;
                const retryingMs = Date.now() - startTime;

                if (this.isTesting) {
                    throw error;
                }

                const canRetry = isRetryableError(error) && retryingMs <= MAX_RETRY_MS;

                if (canRetry) {
                    await timeout(getRetryDelay(attempts));
                    attempts += 1;
                } else {
                    if (attempts > 0 && this.config.sentry_dsn) {
                        Sentry.captureMessage('Request failed after multiple attempts', {
                            extra: getErrorData(),
                        });
                    }
                    throw error;
                }
            }
        }
    }

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(status, request);
        this._checkVersionMismatch(headers);

        const matchedError = ERROR_RESPONSE_MAP.find(({ check }) =>
            this[check](status, headers, payload)
        );

        if (matchedError) {
            return new matchedError.ErrorClass(payload);
        }

        if (this.isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
        }

        const isGhostRequest = GHOST_REQUEST.test(request.url);
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);
        const isForbiddenAuthFailure =
            isForbidden && payload.errors?.[0]?.message === 'Authorization failed';

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        if (isAuthenticated && isGhostRequest && (isUnauthorized || isForbiddenAuthFailure)) {
            this.skipSessionDeletion = true;
            this.session.invalidate();
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
                payload.errors = errorsArray.map((error) =>
                    typeof error === 'string' ? { message: error } : error
                );
            }
        }

        return super.normalizeErrorResponse(status, headers, payload);
    }

    // ─── Delegating instance methods to module-level functions ───────────────

    isTwoFactorTokenRequiredError(status, _headers, payload) {
        return isTwoFactorTokenRequiredError(status, payload);
    }
    isVersionMismatchError(status, _headers, payload) {
        return isVersionMismatchError(status, payload);
    }
    isServerUnreachableError(status) { return isServerUnreachableError(status); }
    isRequestEntityTooLargeError(status) { return isRequestEntityTooLargeError(status); }
    isUnsupportedMediaTypeError(status) { return isUnsupportedMediaTypeError(status); }
    isDataImportError(status) { return isDataImportError(status); }
    isMaintenanceError(status, _headers, payload) { return isMaintenanceError(status, payload); }
    isThemeValidationError(status, _headers, payload) { return isThemeValidationError(status, payload); }
    isHostLimitError(status, _headers, payload) { return isHostLimitError(status, payload); }
    isEmailError(status, _headers, payload) { return isEmailError(status, payload); }
    isAcceptedResponse(status) { return isAcceptedResponse(status); }
}

ajaxService.reopen({ contentType: 'application/json; charset=UTF-8' });

export default ajaxService;
```

Key refactoring improvements:

1. **`createAjaxError` factory** — Eliminates 9 near-identical error class definitions, replacing them with a single factory function.

2. **Checker factories** (`createStatusChecker`, `createPayloadTypeChecker`) — Removes repetitive `if (isAjaxError) ... else ...` patterns across all error checkers.

3. **`ERROR_RESPONSE_MAP`** — Replaces the long `if/else if` chain in `handleResponse` with a declarative data-driven lookup, making it trivial to add/remove error types.

4. **`_makeRequestWithRetry`** — Extracts retry logic into its own method, simplifying `_makeRequest` and making the retry loop cleaner with a `while(true)` + explicit break conditions.

5. **`_setSentryContext` / `_checkVersionMismatch`** — Extracts two distinct responsibilities from `handleResponse` into focused private methods.

6. **`getFirstError` / `getFirstErrorType` helpers** — Removes repeated `get(payload || {}, 'errors.firstObject...')` expressions.

7. **`getJSONPayload`** — Simplified with an early return instead of mutation.

8. **Constants extracted** — `MAX_RETRY_MS`, `RETRY_PERIODS`, `TWO_FACTOR_AUTH_CODES` moved to module-level constants.