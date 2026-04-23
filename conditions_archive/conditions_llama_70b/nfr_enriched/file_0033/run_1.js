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

/**
 * Checks if the given header is a JSON content type.
 * @param {string} header - The header to check.
 * @returns {boolean} True if the header is a JSON content type, false otherwise.
 */
function isJSONContentType(header) {
    if (!header || isNone(header)) {
        return false;
    }
    return header.indexOf(JSON_CONTENT_TYPE) === 0;
}

/**
 * Gets the JSON payload from the given payload.
 * @param {string|object} payload - The payload to get the JSON from.
 * @returns {object} The JSON payload.
 */
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

/**
 * Checks if the given error or status is a version mismatch error.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @param {object} payload - The payload to check.
 * @returns {boolean} True if the error or status is a version mismatch error, false otherwise.
 */
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

/**
 * Checks if the given error or status is a data import error.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @param {object} payload - The payload to check.
 * @returns {boolean} True if the error or status is a data import error, false otherwise.
 */
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

/**
 * Checks if the given error is a server unreachable error.
 * @param {object} error - The error to check.
 * @returns {boolean} True if the error is a server unreachable error, false otherwise.
 */
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

/**
 * Checks if the given error or status is a request entity too large error.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @returns {boolean} True if the error or status is a request entity too large error, false otherwise.
 */
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

/**
 * Checks if the given error or status is an unsupported media type error.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @returns {boolean} True if the error or status is an unsupported media type error, false otherwise.
 */
export function isUnsupportedMediaTypeError(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof UnsupportedMediaTypeError;
    } else {
        return errorOrStatus === 415;
    }
}

/**
 * Returns the code (from the payload) from an error object.
 * @param {object} errorOrStatus - The error or status to get the code from.
 * @returns {string|null} The error code or null if not found.
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

/**
 * Checks if the given error or status is a maintenance error.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @param {object} payload - The payload to check.
 * @returns {boolean} True if the error or status is a maintenance error, false otherwise.
 */
export function isMaintenanceError(errorOrStatus, payload) {
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

/**
 * Checks if the given error or status is a theme validation error.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @param {object} payload - The payload to check.
 * @returns {boolean} True if the error or status is a theme validation error, false otherwise.
 */
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

/**
 * Checks if the given error or status is a host limit error.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @param {object} payload - The payload to check.
 * @returns {boolean} True if the error or status is a host limit error, false otherwise.
 */
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

/**
 * Checks if the given error or status is an email error.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @param {object} payload - The payload to check.
 * @returns {boolean} True if the error or status is an email error, false otherwise.
 */
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

/**
 * Checks if the given error or status is a 2FA required error.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @param {object} payload - The payload to check.
 * @returns {boolean} True if the error or status is a 2FA required error, false otherwise.
 */
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

/**
 * Checks if the given error or status is an accepted response.
 * @param {object|number} errorOrStatus - The error or status to check.
 * @returns {boolean} True if the error or status is an accepted response, false otherwise.
 */
export function isAcceptedResponse(errorOrStatus) {
    if (errorOrStatus === 202) {
        return true;
    }
    return false;
}

@classic
class AjaxService extends AjaxService {
    @service session;
    @service upgradeStatus;
    @service feature;

    @inject config;

    // flag to tell our ESA authenticator not to try an invalidate DELETE request
    // because it's been triggered by this service's 401 handling which means the
    // DELETE would fail and get stuck in an infinite loop
    // TODO: find a more elegant way to handle this
    skipSessionDeletion = false;

    /**
     * Returns the headers for the request.
     * @returns {object} The headers.
     */
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

    /**
     * Initializes the service.
     */
    init() {
        super.init(...arguments);
        if (this.isTesting === undefined) {
            this.isTesting = config.environment === 'test';
        }
    }

    /**
     * Makes a request to the server.
     * @param {object} hash - The request hash.
     * @returns {Promise} The promise for the request.
     */
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

    /**
     * Handles the response from the server.
     * @param {number} status - The status code.
     * @param {object} headers - The response headers.
     * @param {object} payload - The response payload.
     * @param {object} request - The request object.
     * @returns {object} The handled response.
     */
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

        return this._handleErrorResponse(status, headers, payload, request);
    }

    /**
     * Handles the error response from the server.
     * @param {number} status - The status code.
     * @param {object} headers - The response headers.
     * @param {object} payload - The response payload.
     * @param {object} request - The request object.
     * @returns {object} The handled error response.
     */
    _handleErrorResponse(status, headers, payload, request) {
        if (this.isTwoFactorTokenRequiredError(status, headers, payload)) {
            return new TwoFactorTokenRequiredError(payload);
        } else if (this.isVersionMismatchError(status, headers, payload)) {
            return new VersionMismatchError(payload);
        } else if (this.isServerUnreachableError(status)) {
            return new ServerUnreachableError(payload);
        } else if (this.isRequestEntityTooLargeError(status)) {
            return new RequestEntityTooLargeError(payload);
        } else if (this.isUnsupportedMediaTypeError(status)) {
            return new UnsupportedMediaTypeError(payload);
        } else if (this.isMaintenanceError(status, headers, payload)) {
            return new MaintenanceError(payload);
        } else if (this.isThemeValidationError(status, headers, payload)) {
            return new ThemeValidationError(payload);
        } else if (this.isHostLimitError(status, headers, payload)) {
            return new HostLimitError(payload);
        } else if (this.isEmailError(status, headers, payload)) {
            return new EmailError(payload);
        } else if (this.isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
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

    /**
     * Normalizes the error response from the server.
     * @param {number} status - The status code.
     * @param {object} headers - The response headers.
     * @param {object} payload - The response payload.
     * @returns {object} The normalized error response.
     */
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

    /**
     * Checks if the given error or status is a 2FA required error.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @param {object} payload - The payload to check.
     * @returns {boolean} True if the error or status is a 2FA required error, false otherwise.
     */
    isTwoFactorTokenRequiredError(status, headers, payload) {
        return isTwoFactorTokenRequiredError(status, payload);
    }

    /**
     * Checks if the given error or status is a version mismatch error.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @param {object} payload - The payload to check.
     * @returns {boolean} True if the error or status is a version mismatch error, false otherwise.
     */
    isVersionMismatchError(status, headers, payload) {
        return isVersionMismatchError(status, payload);
    }

    /**
     * Checks if the given error is a server unreachable error.
     * @param {object} error - The error to check.
     * @returns {boolean} True if the error is a server unreachable error, false otherwise.
     */
    isServerUnreachableError(status) {
        return isServerUnreachableError(status);
    }

    /**
     * Checks if the given error or status is a request entity too large error.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @returns {boolean} True if the error or status is a request entity too large error, false otherwise.
     */
    isRequestEntityTooLargeError(status) {
        return isRequestEntityTooLargeError(status);
    }

    /**
     * Checks if the given error or status is an unsupported media type error.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @returns {boolean} True if the error or status is an unsupported media type error, false otherwise.
     */
    isUnsupportedMediaTypeError(status) {
        return isUnsupportedMediaTypeError(status);
    }

    /**
     * Checks if the given error or status is a data import error.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @returns {boolean} True if the error or status is a data import error, false otherwise.
     */
    isDataImportError(status) {
        return isDataImportError(status);
    }

    /**
     * Checks if the given error or status is a maintenance error.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @param {object} payload - The payload to check.
     * @returns {boolean} True if the error or status is a maintenance error, false otherwise.
     */
    isMaintenanceError(status, headers, payload) {
        return isMaintenanceError(status, payload);
    }

    /**
     * Checks if the given error or status is a theme validation error.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @param {object} payload - The payload to check.
     * @returns {boolean} True if the error or status is a theme validation error, false otherwise.
     */
    isThemeValidationError(status, headers, payload) {
        return isThemeValidationError(status, payload);
    }

    /**
     * Checks if the given error or status is a host limit error.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @param {object} payload - The payload to check.
     * @returns {boolean} True if the error or status is a host limit error, false otherwise.
     */
    isHostLimitError(status, headers, payload) {
        return isHostLimitError(status, payload);
    }

    /**
     * Checks if the given error or status is an email error.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @param {object} payload - The payload to check.
     * @returns {boolean} True if the error or status is an email error, false otherwise.
     */
    isEmailError(status, headers, payload) {
        return isEmailError(status, payload);
    }

    /**
     * Checks if the given error or status is an accepted response.
     * @param {object|number} errorOrStatus - The error or status to check.
     * @returns {boolean} True if the error or status is an accepted response, false otherwise.
     */
    isAcceptedResponse(status) {
        return isAcceptedResponse(status);
    }
}

// we need to reopen so that internal methods use the correct contentType
AjaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default AjaxService;
```