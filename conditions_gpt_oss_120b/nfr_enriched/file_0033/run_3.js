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
            // ignore parse errors
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
    }
    return get(payload || {}, 'errors.firstObject.type') === 'VersionMismatchError';
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
    }
    return get(payload || {}, 'errors.firstObject.type') === 'DataImportError';
}

/* Server unreachable error */
export class ServerUnreachableError extends AjaxError {
    constructor(payload) {
        super(payload, 'Server was unreachable');
    }
}
export function isServerUnreachableError(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof ServerUnreachableError;
    }
    return errorOrStatus === 0 || errorOrStatus === '0';
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
    }
    return errorOrStatus === 413;
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
    }
    return errorOrStatus === 415;
}

/**
 * Returns the code (from the payload) from an error object.
 * @returns {string|null} error code
 */
export function getErrorCode(errorOrStatus) {
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors?.[0]?.code) {
        return errorOrStatus.payload.errors[0].code;
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
    }
    return errorOrStatus === 503;
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
    }
    return get(payload || {}, 'errors.firstObject.type') === 'ThemeValidationError';
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
    }
    return get(payload || {}, 'errors.firstObject.type') === 'HostLimitError';
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
    }
    return get(payload || {}, 'errors.firstObject.type') === 'EmailError';
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
    }
    payload = getJSONPayload(payload);
    return twoFactorAuthCodes.includes(get(payload || {}, 'errors.firstObject.code'));
}

/* Accepted response */
export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}
export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

/**
 * Maps a response to a specific error instance if applicable.
 * Returns null when no special error handling is required.
 */
function mapResponseToError(status, payload) {
    if (isTwoFactorTokenRequiredError(status, payload)) {
        return new TwoFactorTokenRequiredError(payload);
    }
    if (isVersionMismatchError(status, payload)) {
        return new VersionMismatchError(payload);
    }
    if (isServerUnreachableError(status)) {
        return new ServerUnreachableError(payload);
    }
    if (isRequestEntityTooLargeError(status)) {
        return new RequestEntityTooLargeError(payload);
    }
    if (isUnsupportedMediaTypeError(status)) {
        return new UnsupportedMediaTypeError(payload);
    }
    if (isMaintenanceError(status)) {
        return new MaintenanceError(payload);
    }
    if (isThemeValidationError(status, payload)) {
        return new ThemeValidationError(payload);
    }
    if (isHostLimitError(status, payload)) {
        return new HostLimitError(payload);
    }
    if (isEmailError(status, payload)) {
        return new EmailError(payload);
    }
    if (isAcceptedResponse(status)) {
        return new AcceptedResponse(payload);
    }
    return null;
}

/**
 * Determines whether a request should be retried based on the error response.
 */
function shouldRetry(error, retryChecks) {
    return retryChecks.some(check => check(error?.response));
}

/**
 * Calculates the delay before the next retry attempt.
 */
function getRetryDelay(attempts, periods) {
    return periods[attempts] ?? periods[periods.length - 1];
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
        // Ensure JSON payloads are stringified for non‑GET requests
        if (isJSONContentType(hash.contentType) && hash.type !== 'GET' && typeof hash.data === 'object') {
            hash.data = JSON.stringify(hash.data);
        }

        hash.withCredentials = true;

        if (this.isTesting) {
            hash.headers['X-Test-User'] = this.session.user?.id;
        }

        const retryChecks = [this.isServerUnreachableError, this.isMaintenanceError];
        const retryPeriods = [500, 1000];
        const maxRetryMs = 15000;

        let attempts = 0;
        const startTime = new Date();

        const makeRequest = super._makeRequest.bind(this);

        while (true) {
            try {
                const result = await makeRequest(hash);
                if (attempts && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {
                        extra: this._buildRetryMetadata(attempts, startTime)
                    });
                }
                return result;
            } catch (error) {
                if (this.isTesting) {
                    throw error;
                }

                const elapsed = new Date() - startTime;
                const canRetry = shouldRetry(error, retryChecks) && elapsed <= maxRetryMs;

                if (canRetry) {
                    await timeout(getRetryDelay(attempts, retryPeriods));
                    attempts += 1;
                    continue;
                }

                if (attempts && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request failed after multiple attempts', {
                        extra: this._buildRetryMetadata(attempts, startTime, error)
                    });
                }
                throw error;
            }
        }
    }

    /**
     * Builds metadata for Sentry reporting about retry attempts.
     */
    _buildRetryMetadata(attempts, startTime, error = null) {
        const data = {
            attempts,
            totalSeconds: moment().diff(moment(startTime), 'seconds')
        };
        if (error?.response?.constructor?.name) {
            data.errorName = error.response.constructor.name;
        }
        if (this._responseServer) {
            data.server = this._responseServer;
        }
        return data;
    }

    handleResponse(status, headers, payload, request) {
        // Sentry context
        Sentry.setContext('ajax', {url: request.url, method: request.method, status});
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200));
        Sentry.setTag('ajax_method', request.method);

        // Upgrade check
        if (headers['content-version']) {
            const contentVersion = semverCoerce(headers['content-version']);
            const appVersion = semverCoerce(config.APP.version);
            if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
                this.upgradeStatus.refreshRequired = true;
            }
        }

        // Direct error mapping
        const mappedError = mapResponseToError(status, payload);
        if (mappedError) {
            return mappedError;
        }

        const isGhostRequest = GHOST_REQUEST.test(request.url);
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);

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
            let errors = payload.error || payload.errors || payload.message;
            if (errors) {
                if (!isEmberArray(errors)) {
                    errors = [errors];
                }
                payload.errors = errors.map(err => (typeof err === 'string' ? {message: err} : err));
            }
        }
        return super.normalizeErrorResponse(status, headers, payload);
    }

    // Proxy helpers to keep external API unchanged
    isTwoFactorTokenRequiredError(status, _headers, payload) {
        return isTwoFactorTokenRequiredError(status, payload);
    }
    isVersionMismatchError(status, _headers, payload) {
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
    isMaintenanceError(status, _headers, payload) {
        return isMaintenanceError(status, payload);
    }
    isThemeValidationError(status, _headers, payload) {
        return isThemeValidationError(status, payload);
    }
    isHostLimitError(status, _headers, payload) {
        return isHostLimitError(status, payload);
    }
    isEmailError(status, _headers, payload) {
        return isEmailError(status, payload);
    }
    isAcceptedResponse(status) {
        return isAcceptedResponse(status);
    }
}

// Reopen to set default content type
ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;