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

function isJSONContentType(header) {
    if (!header || isNone(header)) {
        return false;
    }
    return header.indexOf(JSON_CONTENT_TYPE) === 0;
}

function getJSONPayload(payload) {
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch (e) {
            // do nothing
        }
    }
    return payload;
}

/**
 * Returns the code (from the payload) from an error object.
 * @param {any} errorOrStatus - Error object or status code
 * @returns {string|null} error code
 */
function getErrorCode(errorOrStatus) {
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload && errorOrStatus.payload.errors && Array.isArray(errorOrStatus.payload.errors) && errorOrStatus.payload.errors.length > 0) {
        return errorOrStatus.payload.errors[0].code || null;
    }
    return null;
}

/**
 * Checks if an error is a version mismatch error.
 * @param {any} errorOrStatus - Error object or status code
 * @param {any} payload - Response payload
 * @returns {boolean}
 */
function isVersionMismatchError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof VersionMismatchError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'VersionMismatchError';
    }
}

/**
 * Checks if an error is a data import error.
 * @param {any} errorOrStatus - Error object or status code
 * @param {any} payload - Response payload
 * @returns {boolean}
 */
function isDataImportError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof DataImportError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'DataImportError';
    }
}

/**
 * Checks if an error indicates the server is unreachable.
 * @param {any} error - Error object or status code
 * @returns {boolean}
 */
function isServerUnreachableError(error) {
    if (isAjaxError(error)) {
        return error instanceof ServerUnreachableError;
    } else {
        return error === 0 || error === '0';
    }
}

/**
 * Checks if an error indicates the request entity is too large.
 * @param {any} errorOrStatus - Error object or status code
 * @returns {boolean}
 */
function isRequestEntityTooLargeError(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof RequestEntityTooLargeError;
    } else {
        return errorOrStatus === 413;
    }
}

/**
 * Checks if an error indicates an unsupported media type.
 * @param {any} errorOrStatus - Error object or status code
 * @returns {boolean}
 */
function isUnsupportedMediaTypeError(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof UnsupportedMediaTypeError;
    } else {
        return errorOrStatus === 415;
    }
}

/**
 * Checks if an error indicates the system is under maintenance.
 * @param {any} errorOrStatus - Error object or status code
 * @returns {boolean}
 */
function isMaintenanceError(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof MaintenanceError;
    } else {
        return errorOrStatus === 503;
    }
}

/**
 * Checks if an error indicates a theme validation failure.
 * @param {any} errorOrStatus - Error object or status code
 * @param {any} payload - Response payload
 * @returns {boolean}
 */
function isThemeValidationError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof ThemeValidationError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'ThemeValidationError';
    }
}

/**
 * Checks if an error indicates a host limit was reached.
 * @param {any} errorOrStatus - Error object or status code
 * @param {any} payload - Response payload
 * @returns {boolean}
 */
function isHostLimitError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof HostLimitError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'HostLimitError';
    }
}

/**
 * Checks if an error indicates an email configuration issue.
 * @param {any} errorOrStatus - Error object or status code
 * @param {any} payload - Response payload
 * @returns {boolean}
 */
function isEmailError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof EmailError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'EmailError';
    }
}

/**
 * Checks if an error indicates 2FA is required.
 * @param {any} errorOrStatus - Error object or status code
 * @param {any} payload - Response payload
 * @returns {boolean}
 */
function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    const twoFactorAuthCodes = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError || twoFactorAuthCodes.includes(getErrorCode(errorOrStatus));
    } else {
        payload = getJSONPayload(payload);
        return twoFactorAuthCodes.includes(get(payload || {}, 'errors.firstObject.code'));
    }
}

/**
 * Checks if a response indicates the request was accepted.
 * @param {any} errorOrStatus - Error object or status code
 * @returns {boolean}
 */
function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

/**
 * Error class for version mismatch scenarios.
 */
export class VersionMismatchError extends AjaxError {
    constructor(payload) {
        super(payload, 'API server is running a newer version of Ghost, please upgrade.');
    }
}

/**
 * Error class for data import failures.
 */
export class DataImportError extends AjaxError {
    constructor(payload) {
        super(payload, 'The server encountered an error whilst importing data.');
    }
}

/**
 * Error class for server unreachable scenarios.
 */
export class ServerUnreachableError extends AjaxError {
    constructor(payload) {
        super(payload, 'Server was unreachable');
    }
}

/**
 * Error class for request entity too large scenarios.
 */
export class RequestEntityTooLargeError extends AjaxError {
    constructor(payload) {
        super(payload, 'Request is larger than the maximum file size the server allows');
    }
}

/**
 * Error class for unsupported media type scenarios.
 */
export class UnsupportedMediaTypeError extends AjaxError {
    constructor(payload) {
        super(payload, 'Request contains an unknown or unsupported file type.');
    }
}

/**
 * Error class for maintenance mode scenarios.
 */
export class MaintenanceError extends AjaxError {
    constructor(payload) {
        super(payload, 'Ghost is currently undergoing maintenance, please wait a moment then retry.');
    }
}

/**
 * Error class for theme validation failures.
 */
export class ThemeValidationError extends AjaxError {
    constructor(payload) {
        super(payload, 'Theme is not compatible or contains errors.');
    }
}

/**
 * Error class for host limit exceeded scenarios.
 */
export class HostLimitError extends AjaxError {
    constructor(payload) {
        super(payload, 'A hosting plan limit was reached or exceeded.');
    }
}

/**
 * Error class for email configuration issues.
 */
export class EmailError extends AjaxError {
    constructor(payload) {
        super(payload, 'Please verify your email settings');
    }
}

/**
 * Error class for 2FA required scenarios.
 */
export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        payload = getJSONPayload(payload);
        super(payload, '2nd factor verification is required to sign in.');
    }
}

/**
 * Response class for accepted requests.
 */
export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

/**
 * Error handler registry mapping error types to their check functions and error classes.
 */
const ERROR_HANDLERS = {
    versionMismatch: {
        check: isVersionMismatchError,
        errorClass: VersionMismatchError
    },
    dataImport: {
        check: isDataImportError,
        errorClass: DataImportError
    },
    serverUnreachable: {
        check: isServerUnreachableError,
        errorClass: ServerUnreachableError
    },
    requestEntityTooLarge: {
        check: isRequestEntityTooLargeError,
        errorClass: RequestEntityTooLargeError
    },
    unsupportedMediaType: {
        check: isUnsupportedMediaTypeError,
        errorClass: UnsupportedMediaTypeError
    },
    maintenance: {
        check: isMaintenanceError,
        errorClass: MaintenanceError
    },
    themeValidation: {
        check: isThemeValidationError,
        errorClass: ThemeValidationError
    },
    hostLimit: {
        check: isHostLimitError,
        errorClass: HostLimitError
    },
    email: {
        check: isEmailError,
        errorClass: EmailError
    },
    twoFactor: {
        check: isTwoFactorTokenRequiredError,
        errorClass: TwoFactorTokenRequiredError
    },
    accepted: {
        check: isAcceptedResponse,
        errorClass: AcceptedResponse
    }
};

/**
 * Dispatches to the appropriate error handler based on error type.
 * @param {any} status - HTTP status code
 * @param {any} headers - Response headers
 * @param {any} payload - Response payload
 * @returns {Error|null} Error instance if recognized, null otherwise
 */
function dispatchErrorHandler(status, headers, payload) {
    const handlers = Object.values(ERROR_HANDLERS);
    
    for (const handler of handlers) {
        if (handler.check(status, headers, payload)) {
            return new handler.errorClass(payload);
        }
    }
    
    return null;
}

@classic
class ajaxService extends AjaxService {
    @service session;
    @service upgradeStatus;
    @service feature;

    @inject config;

    // flag to tell our ESA authenticator not to try an invalidate DELETE request
    // because it's been triggered by this service's 401 handling which means the
    // DELETE would fail and get stuck in an infinite loop
    // TODO: find a more elegant way to handle this
    skipSessionDeletion = false;

    get headers() {
        const headers = {
            'App-Pragma': 'no-cache'
        };

        // Omit the version header when running in forward admin to avoid issues
        // with the server triggering a version mismatch error. We can expect
        // the admin and backend will be on different versions from time to time
        // due to different release cadences.
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
        // ember-ajax recognizes `application/vnd.api+json` as a JSON-API request
        // and formats appropriately, we want to handle `application/json` the same
        if (isJSONContentType(hash.contentType) && hash.type !== 'GET') {
            if (typeof hash.data === 'object') {
                hash.data = JSON.stringify(hash.data);
            }
        }

        hash.withCredentials = true;

        // mocked routes used in development/testing do not have access to the
        // test context so we add a header here to give them access to the logged
        // in user id that can be checked against the mocked database
        if (this.isTesting) {
            hash.headers['X-Test-User'] = this.session.user?.id;
        }

        // attempt retries for 15 seconds in two situations:
        // 1. Server Unreachable error from the browser (code 0), typically from short internet blips
        // 2. Maintenance error from Ghost, upgrade in progress so API is temporarily unavailable

        let success = false;
        let errorName = null;
        let attempts = 0;
        let startTime = new Date();
        let retryingMs = 0;
        const maxRetryingMs = 15_000;
        const retryPeriods = [500, 1000];
        const retryErrorChecks = [this.isServerUnreachableError, this.isMaintenanceError];

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

        const makeRequest = super._makeRequest.bind(this);

        while (retryingMs <= maxRetryingMs && !success) {
            try {
                const result = await makeRequest(hash);
                success = true;

                if (attempts !== 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {extra: getErrorData()});
                }

                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;
                retryingMs = (new Date()) - startTime;

                // avoid retries in tests because it slows things down and is not expected in mocks
                // isTesting can be overridden in individual tests if required
                if (this.isTesting) {
                    throw error;
                }

                if (retryErrorChecks.some(check => check(error.response)) && retryingMs <= maxRetryingMs) {
                    await timeout(retryPeriods[attempts] || retryPeriods[retryPeriods.length - 1]);
                    attempts += 1;
                } else if (attempts > 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request failed after multiple attempts', {extra: getErrorData()});
                    throw error;
                } else {
                    throw error;
                }
            }
        }
    }

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

        const error = dispatchErrorHandler(status, headers, payload);
        if (error) {
            return error;
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

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            let errors = payload.error || payload.errors || payload.message || undefined;

            if (errors) {
                if (!isEmberArray(errors)) {
                    errors = [errors];
                }

                payload.errors = errors.map(function (error) {
                    if (typeof error === 'string') {
                        return {message: error};
                    } else {
                        return error;
                    }
                });
            }
        }

        return super.normalizeErrorResponse(status, headers, payload);
    }

    isTwoFactorTokenRequiredError(status, headers, payload) {
        return isTwoFactorTokenRequiredError(status, payload);
    }

    isVersionMismatchError(status, headers, payload) {
        return isVersionMismatchError(status, payload);
    }

    isServerUnreachableError(status) {
        return isServerUnreachableError(status);
    }

    isRequestEntityTooLargeError(status) {
        return isRequestEntityTooLargeError(status);
    }

    isUnsupportedMediaTypeError(status) {
        return isUnsupportedMediaTypeError(status);
    }

    isDataImportError(status) {
        return isDataImportError(status, null);
    }

    isMaintenanceError(status, headers, payload) {
        return isMaintenanceError(status, payload);
    }

    isThemeValidationError(status, headers, payload) {
        return isThemeValidationError(status, payload);
    }

    isHostLimitError(status, headers, payload) {
        return isHostLimitError(status, payload);
    }

    isEmailError(status, headers, payload) {
        return isEmailError(status, payload);
    }

    isAcceptedResponse(status) {
        return isAcceptedResponse(status);
    }
}

// we need to reopen so that internal methods use the correct contentType
ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;
```