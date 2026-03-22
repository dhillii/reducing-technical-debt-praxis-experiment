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

// ─── Utilities ───────────────────────────────────────────────────────────────

function isJSONContentType(header) {
    return Boolean(header) && !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0;
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

const ERROR_DEFINITIONS = [
    {
        name: 'VersionMismatchError',
        message: 'API server is running a newer version of Ghost, please upgrade.',
        matchType: 'VersionMismatchError',
    },
    {
        name: 'DataImportError',
        message: 'The server encountered an error whilst importing data.',
        matchType: 'DataImportError',
    },
    {
        name: 'ThemeValidationError',
        message: 'Theme is not compatible or contains errors.',
        matchType: 'ThemeValidationError',
    },
    {
        name: 'HostLimitError',
        message: 'A hosting plan limit was reached or exceeded.',
        matchType: 'HostLimitError',
    },
    {
        name: 'EmailError',
        message: 'Please verify your email settings',
        matchType: 'EmailError',
    },
];

const STATUS_CODE_ERRORS = [
    { name: 'ServerUnreachableError', message: 'Server was unreachable', codes: [0, '0'] },
    { name: 'RequestEntityTooLargeError', message: 'Request is larger than the maximum file size the server allows', codes: [413] },
    { name: 'UnsupportedMediaTypeError', message: 'Request contains an unknown or unsupported file type.', codes: [415] },
    { name: 'MaintenanceError', message: 'Ghost is currently undergoing maintenance, please wait a moment then retry.', codes: [503] },
];

// Factory to create AjaxError subclasses
function createAjaxError(message) {
    return class extends AjaxError {
        constructor(payload) {
            super(payload, message);
        }
    };
}

// Build and export error classes from definitions
export const VersionMismatchError = createAjaxError(ERROR_DEFINITIONS[0].message);
export const DataImportError = createAjaxError(ERROR_DEFINITIONS[1].message);
export const ThemeValidationError = createAjaxError(ERROR_DEFINITIONS[2].message);
export const HostLimitError = createAjaxError(ERROR_DEFINITIONS[3].message);
export const EmailError = createAjaxError(ERROR_DEFINITIONS[4].message);
export const ServerUnreachableError = createAjaxError(STATUS_CODE_ERRORS[0].message);
export const RequestEntityTooLargeError = createAjaxError(STATUS_CODE_ERRORS[1].message);
export const UnsupportedMediaTypeError = createAjaxError(STATUS_CODE_ERRORS[2].message);
export const MaintenanceError = createAjaxError(STATUS_CODE_ERRORS[3].message);

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

function createTypeChecker(ErrorClass, matchType) {
    return function isError(errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof ErrorClass;
        }
        return getFirstErrorType(payload) === matchType;
    };
}

function createStatusChecker(ErrorClass, codes) {
    return function isError(errorOrStatus) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof ErrorClass;
        }
        return codes.includes(errorOrStatus);
    };
}

export const isVersionMismatchError = createTypeChecker(VersionMismatchError, 'VersionMismatchError');
export const isDataImportError = createTypeChecker(DataImportError, 'DataImportError');
export const isThemeValidationError = createTypeChecker(ThemeValidationError, 'ThemeValidationError');
export const isHostLimitError = createTypeChecker(HostLimitError, 'HostLimitError');
export const isEmailError = createTypeChecker(EmailError, 'EmailError');
export const isServerUnreachableError = createStatusChecker(ServerUnreachableError, [0, '0']);
export const isRequestEntityTooLargeError = createStatusChecker(RequestEntityTooLargeError, [413]);
export const isUnsupportedMediaTypeError = createStatusChecker(UnsupportedMediaTypeError, [415]);
export const isMaintenanceError = createStatusChecker(MaintenanceError, [503]);

export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus?.payload?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
        return errors[0].code ?? null;
    }
    return null;
}

const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return (
            errorOrStatus instanceof TwoFactorTokenRequiredError ||
            TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus))
        );
    }
    return TWO_FACTOR_AUTH_CODES.includes(get(getJSONPayload(payload) || {}, 'errors.firstObject.code'));
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
        if (isJSONContentType(hash.contentType) && hash.type !== 'GET' && typeof hash.data === 'object') {
            hash.data = JSON.stringify(hash.data);
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

        const shouldRetry = (error, elapsedMs) =>
            retryChecks.some(check => check(error.response)) && elapsedMs <= MAX_RETRY_MS;

        while (true) {
            try {
                const result = await makeRequest(hash);

                if (attempts > 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', { extra: getErrorData() });
                }

                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;
                const elapsedMs = Date.now() - startTime;

                if (this.isTesting) {
                    throw error;
                }

                if (shouldRetry(error, elapsedMs)) {
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

        for (const [checker, ErrorClass] of ERROR_RESPONSE_MAP) {
            if (checker(status, payload)) {
                return new ErrorClass(payload);
            }
        }

        if (isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
        }

        const isGhostRequest = GHOST_REQUEST.test(request.url);
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);
        const isForbiddenAuthFailure = isForbidden && payload.errors?.[0]?.message === 'Authorization failed';

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
                payload.errors = errorsArray.map(error =>
                    typeof error === 'string' ? { message: error } : error
                );
            }
        }
        return super.normalizeErrorResponse(status, headers, payload);
    }

    // Delegate instance methods to module-level functions
    isTwoFactorTokenRequiredError(status, _headers, payload) { return isTwoFactorTokenRequiredError(status, payload); }
    isVersionMismatchError(status, _headers, payload) { return isVersionMismatchError(status, payload); }
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

ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;
```

Key improvements made:

1. **Factory functions** (`createAjaxError`, `createTypeChecker`, `createStatusChecker`) eliminate repetitive error class and checker definitions, reducing ~150 lines of boilerplate.

2. **`ERROR_RESPONSE_MAP`** replaces the long `if/else if` chain in `handleResponse` with a data-driven loop.

3. **Extracted `_makeRequestWithRetry`** separates retry logic from request preparation in `_makeRequest`, improving single-responsibility.

4. **Extracted `_setSentryContext` and `_checkVersionMismatch`** private methods reduce `handleResponse` complexity.

5. **Simplified conditionals**: `isJSONContentType`, `getJSONPayload`, `isAcceptedResponse`, and `getErrorCode` are simplified using early returns and modern syntax.

6. **Constants** (`MAX_RETRY_MS`, `RETRY_PERIODS`, `TWO_FACTOR_AUTH_CODES`) are extracted to the module level.

7. **`getFirstError`/`getFirstErrorType`** helpers eliminate repeated `get(payload || {}, 'errors.firstObject...')` patterns.