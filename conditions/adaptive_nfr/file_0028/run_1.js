## Refactoring Analysis

The main complexity issues are:
1. **Repetitive error class/checker patterns** - 9 nearly identical error class + checker function pairs
2. **Long if-else chain** in `handleResponse`
3. **Redundant wrapper methods** in the service class that just delegate to module-level functions
4. **Verbose `getErrorCode`** function

## Refactored Code

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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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

export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors;
    return (Array.isArray(errors) && errors.length > 0 && errors[0].code) || null;
}

// ---------------------------------------------------------------------------
// Error factory — eliminates the repetitive class + checker boilerplate
// ---------------------------------------------------------------------------

/**
 * Creates an AjaxError subclass and its corresponding type-checker.
 *
 * @param {string} name        - Class name (also used as the payload `type` key)
 * @param {string} message     - Human-readable error message
 * @param {number|null} status - HTTP status code for numeric checks (optional)
 * @returns {{ ErrorClass, isError }}
 */
function createAjaxError(name, message, status = null) {
    const ErrorClass = class extends AjaxError {
        constructor(payload) {
            super(payload, message);
        }
    };
    Object.defineProperty(ErrorClass, 'name', {value: name});

    const isError = (errorOrStatus, payload) => {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof ErrorClass;
        }
        if (status !== null) {
            return errorOrStatus === status;
        }
        return get(payload || {}, 'errors.firstObject.type') === name;
    };

    return {ErrorClass, isError};
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

const {ErrorClass: VersionMismatchError, isError: isVersionMismatchError} =
    createAjaxError('VersionMismatchError', 'API server is running a newer version of Ghost, please upgrade.');

const {ErrorClass: DataImportError, isError: isDataImportError} =
    createAjaxError('DataImportError', 'The server encountered an error whilst importing data.');

const {ErrorClass: ServerUnreachableError, isError: _isServerUnreachableError} =
    createAjaxError('ServerUnreachableError', 'Server was unreachable');

const {ErrorClass: RequestEntityTooLargeError, isError: isRequestEntityTooLargeError} =
    createAjaxError('RequestEntityTooLargeError', 'Request is larger than the maximum file size the server allows', 413);

const {ErrorClass: UnsupportedMediaTypeError, isError: isUnsupportedMediaTypeError} =
    createAjaxError('UnsupportedMediaTypeError', 'Request contains an unknown or unsupported file type.', 415);

const {ErrorClass: MaintenanceError, isError: _isMaintenanceError} =
    createAjaxError('MaintenanceError', 'Ghost is currently undergoing maintenance, please wait a moment then retry.', 503);

const {ErrorClass: ThemeValidationError, isError: isThemeValidationError} =
    createAjaxError('ThemeValidationError', 'Theme is not compatible or contains errors.');

const {ErrorClass: HostLimitError, isError: isHostLimitError} =
    createAjaxError('HostLimitError', 'A hosting plan limit was reached or exceeded.');

const {ErrorClass: EmailError, isError: isEmailError} =
    createAjaxError('EmailError', 'Please verify your email settings');

export {
    VersionMismatchError, isVersionMismatchError,
    DataImportError, isDataImportError,
    ServerUnreachableError,
    RequestEntityTooLargeError, isRequestEntityTooLargeError,
    UnsupportedMediaTypeError, isUnsupportedMediaTypeError,
    MaintenanceError,
    ThemeValidationError, isThemeValidationError,
    HostLimitError, isHostLimitError,
    EmailError, isEmailError,
};

// Custom checkers that deviate from the factory pattern
export function isServerUnreachableError(error) {
    return _isServerUnreachableError(error) || error === 0 || error === '0';
}

export function isMaintenanceError(errorOrStatus) {
    return _isMaintenanceError(errorOrStatus);
}

// ---------------------------------------------------------------------------
// 2FA error (custom payload handling)
// ---------------------------------------------------------------------------

export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        super(getJSONPayload(payload), '2nd factor verification is required to sign in.');
    }
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError
            || TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus));
    }
    return TWO_FACTOR_AUTH_CODES.includes(
        get(getJSONPayload(payload) || {}, 'errors.firstObject.code')
    );
}

// ---------------------------------------------------------------------------
// Accepted response (202)
// ---------------------------------------------------------------------------

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

export function isAcceptedResponse(status) {
    return status === 202;
}

// ---------------------------------------------------------------------------
// Response error map — drives handleResponse without a long if-else chain
// ---------------------------------------------------------------------------

const RESPONSE_ERROR_MAP = [
    [status => isTwoFactorTokenRequiredError(status),  payload => new TwoFactorTokenRequiredError(payload)],
    [status => isVersionMismatchError(status),         payload => new VersionMismatchError(payload)],
    [status => isServerUnreachableError(status),       payload => new ServerUnreachableError(payload)],
    [status => isRequestEntityTooLargeError(status),   payload => new RequestEntityTooLargeError(payload)],
    [status => isUnsupportedMediaTypeError(status),    payload => new UnsupportedMediaTypeError(payload)],
    [status => isMaintenanceError(status),             payload => new MaintenanceError(payload)],
    [(s, h, p) => isThemeValidationError(s, h, p),    payload => new ThemeValidationError(payload)],
    [(s, h, p) => isHostLimitError(s, h, p),          payload => new HostLimitError(payload)],
    [(s, h, p) => isEmailError(s, h, p),              payload => new EmailError(payload)],
    [status => isAcceptedResponse(status),             payload => new AcceptedResponse(payload)],
];

// ---------------------------------------------------------------------------
// Ajax service
// ---------------------------------------------------------------------------

@classic
class ajaxService extends AjaxService {
    @service session;
    @service upgradeStatus;
    @service feature;

    @inject config;

    // Flag to tell our ESA authenticator not to try an invalidate DELETE request
    // because it's been triggered by this service's 401 handling which means the
    // DELETE would fail and get stuck in an infinite loop.
    skipSessionDeletion = false;

    get headers() {
        const headers = {'App-Pragma': 'no-cache'};

        // Omit the version header when running in forward admin to avoid issues
        // with the server triggering a version mismatch error.
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
        const maxRetryingMs = 15_000;
        const retryPeriods = [500, 1000];
        const retryErrorChecks = [isServerUnreachableError, isMaintenanceError];
        const makeRequest = super._makeRequest.bind(this);

        let attempts = 0;
        let errorName = null;
        const startTime = new Date();

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
                const canRetry = retryErrorChecks.some(check => check(error.response))
                    && retryingMs <= maxRetryingMs;

                if (this.isTesting) {
                    throw error;
                }

                if (canRetry) {
                    await timeout(retryPeriods[attempts] ?? retryPeriods.at(-1));
                    attempts += 1;
                } else {
                    if (attempts > 0 && this.config.sentry_dsn) {
                        Sentry.captureMessage('Request failed after multiple attempts', {extra: getErrorData()});
                    }
                    throw error;
                }
            }
        }
    }

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(status, request);
        this._checkVersionMismatch(headers);

        const matched = RESPONSE_ERROR_MAP.find(([check]) => check(status, headers, payload));
        if (matched) {
            return matched[1](payload);
        }

        const isGhostRequest = GHOST_REQUEST.test(request.url);

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        if (this._shouldInvalidateSession(status, headers, payload, isGhostRequest)) {
            this.skipSessionDeletion = true;
            this.session.invalidate();
        }

        return super.handleResponse(...arguments);
    }

    _setSentryContext(status, request) {
        Sentry.setContext('ajax', {url: request.url, method: request.method, status});
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

    _shouldInvalidateSession(status, headers, payload, isGhostRequest) {
        if (!isGhostRequest || !this.get('session.isAuthenticated')) {
            return false;
        }
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload)
            && payload.errors?.[0].message === 'Authorization failed';

        return isUnauthorized || isForbidden;
    }

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            const rawErrors = payload.error || payload.errors || payload.message;

            if (rawErrors) {
                const errorsArray = isEmberArray(rawErrors) ? rawErrors : [rawErrors];
                payload.errors = errorsArray.map(
                    error => (typeof error === 'string' ? {message: error} : error)
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

## Key Changes

| Issue | Before | After |
|---|---|---|
| **Repetitive error classes** | 9 × identical class + checker pairs (~90 lines) | `createAjaxError()` factory (~15 lines) |
| **Long if-else chain** in `handleResponse` | 10-branch if-else | `RESPONSE_ERROR_MAP` lookup table |
| **Redundant wrapper methods** | 10 pass-through methods in the class | Removed; module-level functions used directly |
| **`_makeRequest` complexity** | Mixed retry logic with request setup | Split into `_makeRequest` + `_makeRequestWithRetry` |
| **`handleResponse` complexity** | Monolithic method | Extracted `_setSentryContext`, `_checkVersionMismatch`, `_shouldInvalidateSession` |
| **Infinite retry loop** | `while (condition)` with complex exit logic | `while (true)` with clear early-exit paths |