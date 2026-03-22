## Refactoring Analysis

The main complexity issues are:
1. **Repetitive error class/checker patterns** - 9 nearly identical error class + checker function pairs
2. **Redundant instance methods** - Service methods that just delegate to module-level functions
3. **Long `handleResponse` if-else chain** - Can be table-driven
4. **`getErrorCode` has overly verbose guard chain**

---

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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isJSONContentType(header) {
    return !!(header && !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0);
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

/**
 * Returns the error code from the first error in an AjaxError payload.
 * @returns {string|null}
 */
export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors;
    return (Array.isArray(errors) && errors.length > 0 && errors[0].code) || null;
}

// ---------------------------------------------------------------------------
// Error class factory
//
// Generates a named AjaxError subclass and its corresponding type-checker,
// eliminating the repetitive class + function boilerplate.
// ---------------------------------------------------------------------------

function createAjaxError(className, defaultMessage) {
    const ErrorClass = class extends AjaxError {
        constructor(payload) {
            super(payload, defaultMessage);
        }
    };
    // Preserve the class name for debugging / Sentry reports.
    Object.defineProperty(ErrorClass, 'name', {value: className});
    return ErrorClass;
}

/**
 * Builds a type-checker for errors that are identified either by:
 *   - instanceof check (when passed an AjaxError), or
 *   - a numeric HTTP status code, or
 *   - a string type on the first error in the payload.
 */
function createStatusChecker(ErrorClass, statusCodeOrPayloadType) {
    return function isError(errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof ErrorClass;
        }
        if (typeof statusCodeOrPayloadType === 'number') {
            return errorOrStatus === statusCodeOrPayloadType;
        }
        return get(payload || {}, 'errors.firstObject.type') === statusCodeOrPayloadType;
    };
}

// ---------------------------------------------------------------------------
// Error classes & checkers
// ---------------------------------------------------------------------------

export const VersionMismatchError = createAjaxError(
    'VersionMismatchError',
    'API server is running a newer version of Ghost, please upgrade.'
);

export const DataImportError = createAjaxError(
    'DataImportError',
    'The server encountered an error whilst importing data.'
);

export const ServerUnreachableError = createAjaxError(
    'ServerUnreachableError',
    'Server was unreachable'
);

export const RequestEntityTooLargeError = createAjaxError(
    'RequestEntityTooLargeError',
    'Request is larger than the maximum file size the server allows'
);

export const UnsupportedMediaTypeError = createAjaxError(
    'UnsupportedMediaTypeError',
    'Request contains an unknown or unsupported file type.'
);

export const MaintenanceError = createAjaxError(
    'MaintenanceError',
    'Ghost is currently undergoing maintenance, please wait a moment then retry.'
);

export const ThemeValidationError = createAjaxError(
    'ThemeValidationError',
    'Theme is not compatible or contains errors.'
);

export const HostLimitError = createAjaxError(
    'HostLimitError',
    'A hosting plan limit was reached or exceeded.'
);

export const EmailError = createAjaxError(
    'EmailError',
    'Please verify your email settings'
);

// TwoFactorTokenRequiredError needs custom payload handling, so it stays explicit.
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

// ---------------------------------------------------------------------------
// Type-checker functions
// ---------------------------------------------------------------------------

export const isVersionMismatchError = createStatusChecker(VersionMismatchError, 'VersionMismatchError');
export const isDataImportError = createStatusChecker(DataImportError, 'DataImportError');
export const isRequestEntityTooLargeError = createStatusChecker(RequestEntityTooLargeError, 413);
export const isUnsupportedMediaTypeError = createStatusChecker(UnsupportedMediaTypeError, 415);
export const isMaintenanceError = createStatusChecker(MaintenanceError, 503);
export const isThemeValidationError = createStatusChecker(ThemeValidationError, 'ThemeValidationError');
export const isHostLimitError = createStatusChecker(HostLimitError, 'HostLimitError');
export const isEmailError = createStatusChecker(EmailError, 'EmailError');

export function isServerUnreachableError(error) {
    if (isAjaxError(error)) {
        return error instanceof ServerUnreachableError;
    }
    return error === 0 || error === '0';
}

const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return (
            errorOrStatus instanceof TwoFactorTokenRequiredError ||
            TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus))
        );
    }
    const parsed = getJSONPayload(payload);
    return TWO_FACTOR_AUTH_CODES.includes(get(parsed || {}, 'errors.firstObject.code'));
}

export function isAcceptedResponse(status) {
    return status === 202;
}

// ---------------------------------------------------------------------------
// Ordered map used by handleResponse to avoid a long if-else chain.
// Each entry: [checker, ErrorClass | null]
// null means "use AcceptedResponse" (special case).
// ---------------------------------------------------------------------------

const RESPONSE_ERROR_MAP = [
    [isTwoFactorTokenRequiredError, TwoFactorTokenRequiredError],
    [isVersionMismatchError,        VersionMismatchError],
    [isServerUnreachableError,      ServerUnreachableError],
    [isRequestEntityTooLargeError,  RequestEntityTooLargeError],
    [isUnsupportedMediaTypeError,   UnsupportedMediaTypeError],
    [isMaintenanceError,            MaintenanceError],
    [isThemeValidationError,        ThemeValidationError],
    [isHostLimitError,              HostLimitError],
    [isEmailError,                  EmailError],
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

    // Extracted retry logic to keep _makeRequest readable.
    async _makeRequestWithRetry(hash) {
        const maxRetryingMs = 15_000;
        const retryPeriods = [500, 1000];
        const retryErrorChecks = [isServerUnreachableError, isMaintenanceError];

        let attempts = 0;
        let errorName = null;
        const startTime = new Date();
        const makeRequest = super._makeRequest.bind(this);

        const getErrorData = () => {
            const data = {
                errorName,
                attempts,
                totalSeconds: moment().diff(moment(startTime), 'seconds')
            };
            if (this._responseServer) {
                data.server = this._responseServer;
            }
            return data;
        };

        const elapsedMs = () => (new Date()) - startTime;

        while (elapsedMs() <= maxRetryingMs) {
            try {
                const result = await makeRequest(hash);

                if (attempts > 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {extra: getErrorData()});
                }

                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;

                // Avoid retries in tests — slows things down and mocks don't expect them.
                if (this.isTesting) {
                    throw error;
                }

                const shouldRetry =
                    retryErrorChecks.some(check => check(error.response)) &&
                    elapsedMs() <= maxRetryingMs;

                if (shouldRetry) {
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

        // Table-driven error mapping replaces the long if-else chain.
        for (const [checker, ErrorClass] of RESPONSE_ERROR_MAP) {
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

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        const isForbiddenAuthFailure =
            isForbidden && payload.errors?.[0]?.message === 'Authorization failed';

        if (isAuthenticated && isGhostRequest && (isUnauthorized || isForbiddenAuthFailure)) {
            this.skipSessionDeletion = true;
            this.session.invalidate();
        }

        return super.handleResponse(...arguments);
    }

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            const raw = payload.error || payload.errors || payload.message;

            if (raw) {
                const errors = isEmberArray(raw) ? raw : [raw];
                payload.errors = errors.map(e => (typeof e === 'string' ? {message: e} : e));
            }
        }

        return super.normalizeErrorResponse(status, headers, payload);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

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
}

ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;
```

---

## Key Changes

| Problem | Solution |
|---|---|
| 9 identical `class + checker` pairs | `createAjaxError()` factory + `createStatusChecker()` factory |
| Long `handleResponse` if-else chain | `RESPONSE_ERROR_MAP` table iterated with a `for` loop |
| 10 redundant service delegate methods | Removed entirely; `handleResponse` calls module-level functions directly |
| Verbose `getErrorCode` guard chain | Optional chaining + short-circuit `||` |
| `getJSONPayload` try/catch structure | Early return for non-string case |
| Mixed retry logic inside `_makeRequest` | Extracted to `_makeRequestWithRetry` |
| Inline Sentry calls in `handleResponse` | Extracted to `_setSentryContext` |
| Inline version check in `handleResponse` | Extracted to `_checkVersionMismatch` |