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
    // ember-simple-auth prevents ember-ajax parsing response as JSON but
    // we need a JSON object to test against
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch (e) {
            // do nothing
        }
    }
    return payload;
}

/* Version mismatch error */

export class VersionMismatchError extends AjaxError {
    constructor(payload) {
        super(payload, 'API server is running a newer version of Ghost, please upgrade.');
    }
}

export function isVersionMismatchError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof VersionMismatchError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'VersionMismatchError';
    }
}

/* DataImport error */

export class DataImportError extends AjaxError {
    constructor(payload) {
        super(payload, 'The server encountered an error whilst importing data.');
    }
}

export function isDataImportError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof DataImportError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'DataImportError';
    }
}

/* Server unreachable error */

export class ServerUnreachableError extends AjaxError {
    constructor(payload) {
        super(payload, 'Server was unreachable');
    }
}

export function isServerUnreachableError(error) {
    if (isAjaxError(error)) {
        return error instanceof ServerUnreachableError;
    } else {
        return error === 0 || error === '0';
    }
}

/* Request entity too large error */

export class RequestEntityTooLargeError extends AjaxError {
    constructor(payload) {
        super(payload, 'Request is larger than the maximum file size the server allows');
    }
}

export function isRequestEntityTooLargeError(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof RequestEntityTooLargeError;
    } else {
        return errorOrStatus === 413;
    }
}

/* Unsupported media type error */

export class UnsupportedMediaTypeError extends AjaxError {
    constructor(payload) {
        super(payload, 'Request contains an unknown or unsupported file type.');
    }
}

export function isUnsupportedMediaTypeError(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof UnsupportedMediaTypeError;
    } else {
        return errorOrStatus === 415;
    }
}

/**
 * Returns the code (from the payload) from an error object.
 * @returns {string|null} error code
 */
export function getErrorCode(errorOrStatus) {
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload && errorOrStatus.payload.errors && Array.isArray(errorOrStatus.payload.errors) && errorOrStatus.payload.errors.length > 0) {
        return errorOrStatus.payload.errors[0].code || null;
    }
    return null;
}

/* Maintenance error */

export class MaintenanceError extends AjaxError {
    constructor(payload) {
        super(payload, 'Ghost is currently undergoing maintenance, please wait a moment then retry.');
    }
}

export function isMaintenanceError(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof MaintenanceError;
    } else {
        return errorOrStatus === 503;
    }
}

/* Theme validation error */

export class ThemeValidationError extends AjaxError {
    constructor(payload) {
        super(payload, 'Theme is not compatible or contains errors.');
    }
}

export function isThemeValidationError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof ThemeValidationError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'ThemeValidationError';
    }
}

/* Host limit reached/exceeded error */

export class HostLimitError extends AjaxError {
    constructor(payload) {
        super(payload, 'A hosting plan limit was reached or exceeded.');
    }
}

export function isHostLimitError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof HostLimitError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'HostLimitError';
    }
}

/* Email error */

export class EmailError extends AjaxError {
    constructor(payload) {
        super(payload, 'Please verify your email settings');
    }
}

export function isEmailError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof EmailError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'EmailError';
    }
}

/* 2FA required error */
export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        payload = getJSONPayload(payload);
        super(payload, '2nd factor verification is required to sign in.');
    }
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    const twoFactorAuthCodes = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError || twoFactorAuthCodes.includes(getErrorCode(errorOrStatus));
    } else {
        payload = getJSONPayload(payload);
        return twoFactorAuthCodes.includes(get(payload || {}, 'errors.firstObject.code'));
    }
}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

export function isAcceptedResponse(errorOrStatus) {
    if (errorOrStatus === 202) {
        return true;
    }
    return false;
}

/**
 * Error response handler strategy mapping
 * Maps error detection functions to their corresponding error classes
 */
const errorHandlers = [
    {
        check: (service, status, headers, payload) => service.isTwoFactorTokenRequiredError(status, headers, payload),
        create: (payload) => new TwoFactorTokenRequiredError(payload)
    },
    {
        check: (service, status, headers, payload) => service.isVersionMismatchError(status, headers, payload),
        create: (payload) => new VersionMismatchError(payload)
    },
    {
        check: (service, status, headers, payload) => service.isServerUnreachableError(status, headers, payload),
        create: (payload) => new ServerUnreachableError(payload)
    },
    {
        check: (service, status, headers, payload) => service.isRequestEntityTooLargeError(status, headers, payload),
        create: (payload) => new RequestEntityTooLargeError(payload)
    },
    {
        check: (service, status, headers, payload) => service.isUnsupportedMediaTypeError(status, headers, payload),
        create: (payload) => new UnsupportedMediaTypeError(payload)
    },
    {
        check: (service, status, headers, payload) => service.isMaintenanceError(status, headers, payload),
        create: (payload) => new MaintenanceError(payload)
    },
    {
        check: (service, status, headers, payload) => service.isThemeValidationError(status, headers, payload),
        create: (payload) => new ThemeValidationError(payload)
    },
    {
        check: (service, status, headers, payload) => service.isHostLimitError(status, headers, payload),
        create: (payload) => new HostLimitError(payload)
    },
    {
        check: (service, status, headers, payload) => service.isEmailError(status, headers, payload),
        create: (payload) => new EmailError(payload)
    },
    {
        check: (service, status, headers, payload) => service.isAcceptedResponse(status),
        create: (payload) => new AcceptedResponse(payload)
    }
];

/**
 * Attempts to match and create an error response using registered handlers
 * @param {Object} service - The ajax service instance
 * @param {number} status - HTTP status code
 * @param {Object} headers - Response headers
 * @param {Object} payload - Response payload
 * @returns {Object|null} Error instance or null if no handler matches
 */
function createErrorResponse(service, status, headers, payload) {
    for (const handler of errorHandlers) {
        if (handler.check(service, status, headers, payload)) {
            return handler.create(payload);
        }
    }
    return null;
}

/**
 * Determines if request should be retried based on error type
 * @param {Object} error - The error object
 * @param {Array} retryChecks - Array of error check functions
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error, retryChecks) {
    return retryChecks.some(check => check(error.response));
}

/**
 * Determines if session should be invalidated based on error conditions
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {boolean} isGhostRequest - Whether request is to Ghost API
 * @param {boolean} isUnauthorized - Whether response is 401
 * @param {boolean} isForbidden - Whether response is 403
 * @param {Object} payload - Response payload
 * @returns {boolean} True if session should be invalidated
 */
function shouldInvalidateSession(isAuthenticated, isGhostRequest, isUnauthorized, isForbidden, payload) {
    if (!isAuthenticated || !isGhostRequest) {
        return false;
    }
    if (isUnauthorized) {
        return true;
    }
    return isForbidden && payload.errors?.[0].message === 'Authorization failed';
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

                if (isRetryableError(error, retryErrorChecks) && retryingMs <= maxRetryingMs) {
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

        if (headers['content-version']) {
            const contentVersion = semverCoerce(headers['content-version']);
            const appVersion = semverCoerce(config.APP.version);

            if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
                this.upgradeStatus.refreshRequired = true;
            }
        }

        const errorResponse = createErrorResponse(this, status, headers, payload);
        if (errorResponse) {
            return errorResponse;
        }

        let isGhostRequest = GHOST_REQUEST.test(request.url);
        let isAuthenticated = this.get('session.isAuthenticated');
        let isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        let isForbidden = isForbiddenError(status, headers, payload);

        // used when reporting connection errors, helps distinguish CDN
        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        if (shouldInvalidateSession(isAuthenticated, isGhostRequest, isUnauthorized, isForbidden, payload)) {
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
        return isDataImportError(status);
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