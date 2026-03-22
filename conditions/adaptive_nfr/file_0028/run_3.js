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
    return !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0;
}

function getJSONPayload(payload) {
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (e) { /* noop */ }
    }
    return payload;
}

/**
 * Returns the first error code from an AjaxError payload, or null.
 */
export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors;
    return (Array.isArray(errors) && errors.length > 0 && errors[0].code) || null;
}

// ---------------------------------------------------------------------------
// Error factory — eliminates the repetitive class + checker boilerplate
// ---------------------------------------------------------------------------

/**
 * Creates an AjaxError subclass and its associated type-checker in one call.
 *
 * @param {string} message   - Human-readable error message
 * @param {string} [apiType] - `errors[0].type` value returned by the API, when
 *                             the checker should match on payload type rather
 *                             than a numeric HTTP status code.
 * @param {number} [code]    - HTTP status code to match when not an AjaxError.
 * @returns {{ ErrorClass, isError }}
 */
function createAjaxError(message, {apiType = null, statusCode = null} = {}) {
    class CustomError extends AjaxError {
        constructor(payload) {
            super(payload, message);
        }
    }

    function isError(errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof CustomError;
        }
        if (apiType !== null) {
            return get(payload || {}, 'errors.firstObject.type') === apiType;
        }
        return errorOrStatus === statusCode;
    }

    return {ErrorClass: CustomError, isError};
}

// ---------------------------------------------------------------------------
// Error classes & checkers
// ---------------------------------------------------------------------------

export const {ErrorClass: VersionMismatchError, isError: isVersionMismatchError} =
    createAjaxError('API server is running a newer version of Ghost, please upgrade.', {apiType: 'VersionMismatchError'});

export const {ErrorClass: DataImportError, isError: isDataImportError} =
    createAjaxError('The server encountered an error whilst importing data.', {apiType: 'DataImportError'});

export const {ErrorClass: ThemeValidationError, isError: isThemeValidationError} =
    createAjaxError('Theme is not compatible or contains errors.', {apiType: 'ThemeValidationError'});

export const {ErrorClass: HostLimitError, isError: isHostLimitError} =
    createAjaxError('A hosting plan limit was reached or exceeded.', {apiType: 'HostLimitError'});

export const {ErrorClass: EmailError, isError: isEmailError} =
    createAjaxError('Please verify your email settings', {apiType: 'EmailError'});

export const {ErrorClass: RequestEntityTooLargeError, isError: isRequestEntityTooLargeError} =
    createAjaxError('Request is larger than the maximum file size the server allows', {statusCode: 413});

export const {ErrorClass: UnsupportedMediaTypeError, isError: isUnsupportedMediaTypeError} =
    createAjaxError('Request contains an unknown or unsupported file type.', {statusCode: 415});

export const {ErrorClass: MaintenanceError, isError: isMaintenanceError} =
    createAjaxError('Ghost is currently undergoing maintenance, please wait a moment then retry.', {statusCode: 503});

// ServerUnreachableError has non-standard status matching (0 or '0'), so keep it manual.
export class ServerUnreachableError extends AjaxError {
    constructor(payload) {
        super(payload, 'Server was unreachable');
    }
}

export function isServerUnreachableError(error) {
    return isAjaxError(error) ? error instanceof ServerUnreachableError : error === 0 || error === '0';
}

// TwoFactorTokenRequiredError has extra code-based matching logic.
const TWO_FACTOR_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        super(getJSONPayload(payload), '2nd factor verification is required to sign in.');
    }
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError
            || TWO_FACTOR_CODES.includes(getErrorCode(errorOrStatus));
    }
    return TWO_FACTOR_CODES.includes(get(getJSONPayload(payload) || {}, 'errors.firstObject.code'));
}

// ---------------------------------------------------------------------------
// AcceptedResponse (not an error, kept separate)
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
// Retry helpers
// ---------------------------------------------------------------------------

const RETRY_PERIODS = [500, 1000];
const MAX_RETRYING_MS = 15_000;

function getRetryDelay(attempts) {
    return RETRY_PERIODS[attempts] ?? RETRY_PERIODS[RETRY_PERIODS.length - 1];
}

// ---------------------------------------------------------------------------
// Response-error mapping used in handleResponse
// ---------------------------------------------------------------------------

// Each entry: [checkerFn, ErrorClass]
// Checked in order; first match wins.
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

    /**
     * Flag to tell our ESA authenticator not to try an invalidate DELETE request
     * because it's been triggered by this service's 401 handling which means the
     * DELETE would fail and get stuck in an infinite loop.
     */
    skipSessionDeletion = false;

    get headers() {
        const headers = {'App-Pragma': 'no-cache'};

        // Omit the version header in forward-admin mode to avoid spurious
        // version-mismatch errors caused by differing release cadences.
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

    // -------------------------------------------------------------------------
    // Request lifecycle
    // -------------------------------------------------------------------------

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

    /**
     * Retries the underlying request for up to MAX_RETRYING_MS on server-
     * unreachable or maintenance errors, then re-throws anything else.
     */
    async _makeRequestWithRetry(hash) {
        const makeRequest = super._makeRequest.bind(this);
        const startTime = new Date();
        let attempts = 0;
        let errorName = null;

        const getErrorData = () => {
            const data = {errorName, attempts, totalSeconds: moment().diff(moment(startTime), 'seconds')};
            if (this._responseServer) {
                data.server = this._responseServer;
            }
            return data;
        };

        const isRetryableError = response =>
            isServerUnreachableError(response) || isMaintenanceError(response);

        // eslint-disable-next-line no-constant-condition
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

                // Never retry in tests — mocks don't expect it.
                if (this.isTesting) {
                    throw error;
                }

                const canRetry = isRetryableError(error.response) && retryingMs <= MAX_RETRYING_MS;

                if (canRetry) {
                    await timeout(getRetryDelay(attempts));
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

    // -------------------------------------------------------------------------
    // Response handling
    // -------------------------------------------------------------------------

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(status, request);
        this._checkVersionMismatch(headers);

        // Map status/payload to a typed error or accepted response.
        for (const [check, ErrorClass] of RESPONSE_ERROR_MAP) {
            if (check(status, payload)) {
                return new ErrorClass(payload);
            }
        }

        if (isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
        }

        this._handleAuthFailure(status, headers, payload, request);

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

    _handleAuthFailure(status, headers, payload, request) {
        const isGhostRequest = GHOST_REQUEST.test(request.url);

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);
        const isForbiddenAuthFailure = isForbidden && payload.errors?.[0].message === 'Authorization failed';

        if (isAuthenticated && isGhostRequest && (isUnauthorized || isForbiddenAuthFailure)) {
            this.skipSessionDeletion = true;
            this.session.invalidate();
        }
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
| 9 near-identical error class + checker pairs | `createAjaxError()` factory generates both from a config object |
| Redundant service instance methods (e.g. `isMaintenanceError`) that just forwarded to module functions | Removed entirely; `handleResponse` uses the module-level functions directly via `RESPONSE_ERROR_MAP` |
| Long `if/else if` chain in `handleResponse` | Replaced with a data-driven `RESPONSE_ERROR_MAP` loop |
| `getErrorCode` verbose guard chain | Simplified with optional chaining and short-circuit evaluation |
| `_makeRequest` mixed retry logic with request setup | Extracted retry loop into `_makeRequestWithRetry` |
| `handleResponse` doing too many things | Split into `_setSentryContext`, `_checkVersionMismatch`, `_handleAuthFailure` |
| `retryingMs` computed inconsistently | Unified to `Date.now() - startTime` |