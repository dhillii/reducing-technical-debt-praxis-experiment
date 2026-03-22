Here's the refactored code with reduced complexity:

```javascript
import * as Sentry from '@sentry/ember';
import AjaxService from 'ember-ajax/services/ajax';
import classic from 'ember-classic-decorator';
import config from 'ghost-admin/config/environment';
import moment from 'moment-timezone';
import semverCoerce from 'semver/functions/coerce';
import semverLt from 'semver/functions/lt';
import {AjaxError, isAjaxError, isForbiddenError} from 'ember-ajax/errors';
import {get} from '@ember/object';
import {inject} from 'ghost-admin/decorators/inject';
import {isArray as isEmberArray} from '@ember/array';
import {isNone} from '@ember/utils';
import {inject as service} from '@ember/service';
import {timeout} from 'ember-concurrency';

const JSON_CONTENT_TYPE = 'application/json';
const GHOST_REQUEST = /\/ghost\/api\//;
const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];
const MAX_RETRY_MS = 15_000;
const RETRY_PERIODS = [500, 1000];

// ---- Utility Functions ----

function isJSONContentType(header) {
    return !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0;
}

function getJSONPayload(payload) {
    if (typeof payload !== 'string') {
        return payload;
    }
    try {
        return JSON.parse(payload);
    } catch (e) {
        return payload;
    }
}

function getFirstError(payload) {
    return get(payload || {}, 'errors.firstObject') || {};
}

// ---- Error Factory ----

function createAjaxError(ErrorClass, message) {
    return class extends AjaxError {
        constructor(payload) {
            super(payload, message);
        }
    };
}

function createTypeChecker(ErrorClass, typeName) {
    return function (errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof ErrorClass;
        }
        return getFirstError(payload).type === typeName;
    };
}

function createStatusChecker(ErrorClass, statusCode) {
    return function (errorOrStatus) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof ErrorClass;
        }
        return errorOrStatus === statusCode;
    };
}

// ---- Error Classes ----

export const VersionMismatchError = createAjaxError(AjaxError, 'API server is running a newer version of Ghost, please upgrade.');
export const DataImportError = createAjaxError(AjaxError, 'The server encountered an error whilst importing data.');
export const ServerUnreachableError = createAjaxError(AjaxError, 'Server was unreachable');
export const RequestEntityTooLargeError = createAjaxError(AjaxError, 'Request is larger than the maximum file size the server allows');
export const UnsupportedMediaTypeError = createAjaxError(AjaxError, 'Request contains an unknown or unsupported file type.');
export const MaintenanceError = createAjaxError(AjaxError, 'Ghost is currently undergoing maintenance, please wait a moment then retry.');
export const ThemeValidationError = createAjaxError(AjaxError, 'Theme is not compatible or contains errors.');
export const HostLimitError = createAjaxError(AjaxError, 'A hosting plan limit was reached or exceeded.');
export const EmailError = createAjaxError(AjaxError, 'Please verify your email settings');

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

// ---- Error Checkers ----

export const isVersionMismatchError = createTypeChecker(VersionMismatchError, 'VersionMismatchError');
export const isDataImportError = createTypeChecker(DataImportError, 'DataImportError');
export const isThemeValidationError = createTypeChecker(ThemeValidationError, 'ThemeValidationError');
export const isHostLimitError = createTypeChecker(HostLimitError, 'HostLimitError');
export const isEmailError = createTypeChecker(EmailError, 'EmailError');
export const isRequestEntityTooLargeError = createStatusChecker(RequestEntityTooLargeError, 413);
export const isUnsupportedMediaTypeError = createStatusChecker(UnsupportedMediaTypeError, 415);
export const isMaintenanceError = createStatusChecker(MaintenanceError, 503);

export function isServerUnreachableError(error) {
    if (isAjaxError(error)) {
        return error instanceof ServerUnreachableError;
    }
    return error === 0 || error === '0';
}

export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus?.payload?.errors;
    return (Array.isArray(errors) && errors.length > 0 && errors[0].code) || null;
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError
            || TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus));
    }
    return TWO_FACTOR_AUTH_CODES.includes(get(getJSONPayload(payload) || {}, 'errors.firstObject.code'));
}

export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

// ---- Error Response Map ----

const ERROR_RESPONSE_MAP = [
    {check: isTwoFactorTokenRequiredError, ErrorClass: TwoFactorTokenRequiredError},
    {check: isVersionMismatchError, ErrorClass: VersionMismatchError},
    {check: isServerUnreachableError, ErrorClass: ServerUnreachableError},
    {check: isRequestEntityTooLargeError, ErrorClass: RequestEntityTooLargeError},
    {check: isUnsupportedMediaTypeError, ErrorClass: UnsupportedMediaTypeError},
    {check: isMaintenanceError, ErrorClass: MaintenanceError},
    {check: isThemeValidationError, ErrorClass: ThemeValidationError},
    {check: isHostLimitError, ErrorClass: HostLimitError},
    {check: isEmailError, ErrorClass: EmailError},
];

// ---- Ajax Service ----

@classic
class ajaxService extends AjaxService {
    @service session;
    @service upgradeStatus;
    @service feature;

    @inject config;

    skipSessionDeletion = false;

    get headers() {
        const headers = {'App-Pragma': 'no-cache'};

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
            ...(this._responseServer && {server: this._responseServer}),
        });

        while (true) {
            try {
                const result = await makeRequest(hash);

                if (attempts > 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {extra: getErrorData()});
                }

                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;
                const retryingMs = Date.now() - startTime;
                const canRetry = retryChecks.some(check => check(error.response)) && retryingMs <= MAX_RETRY_MS;

                if (this.isTesting || !canRetry) {
                    if (attempts > 0 && this.config.sentry_dsn) {
                        Sentry.captureMessage('Request failed after multiple attempts', {extra: getErrorData()});
                    }
                    throw error;
                }

                await timeout(RETRY_PERIODS[attempts] ?? RETRY_PERIODS.at(-1));
                attempts += 1;
            }
        }
    }

    _setSentryContext(request, status) {
        Sentry.setContext('ajax', {url: request.url, method: request.method, status});
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200));
        Sentry.setTag('ajax_method', request.method);
    }

    _checkVersionUpgrade(headers) {
        if (!headers['content-version']) {
            return;
        }

        const contentVersion = semverCoerce(headers['content-version']);
        const appVersion = semverCoerce(config.APP.version);

        if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
            this.upgradeStatus.refreshRequired = true;
        }
    }

    _resolveErrorResponse(status, payload) {
        for (const {check, ErrorClass} of ERROR_RESPONSE_MAP) {
            if (check(status, payload)) {
                return new ErrorClass(payload);
            }
        }

        if (isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
        }

        return null;
    }

    _handleSessionInvalidation(status, headers, payload, request) {
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
    }

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(request, status);
        this._checkVersionUpgrade(headers);

        const errorResponse = this._resolveErrorResponse(status, payload);
        if (errorResponse) {
            return errorResponse;
        }

        this._handleSessionInvalidation(status, headers, payload, request);

        return super.handleResponse(...arguments);
    }

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            const rawErrors = payload.error || payload.errors || payload.message;

            if (rawErrors) {
                const errorsArray = isEmberArray(rawErrors) ? rawErrors : [rawErrors];
                payload.errors = errorsArray.map(error =>
                    typeof error === 'string' ? {message: error} : error
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

Key refactoring changes made:

1. **Error class factory** (`createAjaxError`): Eliminated repetitive error class definitions by generating them dynamically.

2. **Checker factories** (`createTypeChecker`, `createStatusChecker`): Replaced duplicated checker functions with factory functions that generate the appropriate checker based on the error type or status code.

3. **Error response map** (`ERROR_RESPONSE_MAP`): Replaced the long `if/else if` chain in `handleResponse` with a declarative data-driven lookup table iterated in `_resolveErrorResponse`.

4. **Extracted private methods**: Split `handleResponse` into focused helpers (`_setSentryContext`, `_checkVersionUpgrade`, `_resolveErrorResponse`, `_handleSessionInvalidation`) to reduce its complexity.

5. **Extracted retry logic**: Moved retry logic from `_makeRequest` into `_makeRequestWithRetry` for separation of concerns.

6. **Simplified conditionals**: Removed redundant checks (e.g., `!header || isNone(header)` → `!isNone(header)`), simplified `isAcceptedResponse`, and used optional chaining and nullish coalescing where appropriate.

7. **Extracted constants**: Moved magic values (`TWO_FACTOR_AUTH_CODES`, `MAX_RETRY_MS`, `RETRY_PERIODS`) to module-level constants.