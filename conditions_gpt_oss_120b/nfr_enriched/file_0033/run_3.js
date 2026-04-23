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
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload && Array.isArray(errorOrStatus.payload.errors) && errorOrStatus.payload.errors.length) {
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

    /**
     * Core request wrapper that adds retry logic for transient errors.
     */
    async _makeRequest(hash) {
        this._prepareRequestPayload(hash);
        hash.withCredentials = true;
        this._addTestingHeader(hash);

        const retryConfig = this._getRetryConfig();
        const makeRequest = super._makeRequest.bind(this);
        const startTime = new Date();

        while (retryConfig.retryingMs <= retryConfig.maxRetryingMs && !retryConfig.success) {
            try {
                const result = await makeRequest(hash);
                retryConfig.success = true;
                if (retryConfig.attempts !== 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {extra: this._buildErrorData(retryConfig, startTime)});
                }
                return result;
            } catch (error) {
                if (this.isTesting) {
                    throw error;
                }
                retryConfig.attempts += 1;
                retryConfig.errorName = error.response?.constructor?.name;
                retryConfig.retryingMs = new Date() - startTime;

                if (this._shouldRetry(error.response, retryConfig)) {
                    await timeout(this._retryDelay(retryConfig.attempts, retryConfig.retryPeriods));
                } else {
                    if (retryConfig.attempts > 1 && this.config.sentry_dsn) {
                        Sentry.captureMessage('Request failed after multiple attempts', {extra: this._buildErrorData(retryConfig, startTime)});
                    }
                    throw error;
                }
            }
        }
    }

    /**
     * Prepare JSON payload for non‑GET requests with JSON content type.
     */
    _prepareRequestPayload(hash) {
        if (isJSONContentType(hash.contentType) && hash.type !== 'GET' && typeof hash.data === 'object') {
            hash.data = JSON.stringify(hash.data);
        }
    }

    /**
     * Add test‑specific header when running in test mode.
     */
    _addTestingHeader(hash) {
        if (this.isTesting) {
            hash.headers['X-Test-User'] = this.session.user?.id;
        }
    }

    /**
     * Configuration for retry logic.
     */
    _getRetryConfig() {
        return {
            success: false,
            attempts: 0,
            errorName: null,
            retryingMs: 0,
            maxRetryingMs: 15000,
            retryPeriods: [500, 1000],
            retryErrorChecks: [this.isServerUnreachableError, this.isMaintenanceError]
        };
    }

    /**
     * Determine whether a request should be retried based on error type and elapsed time.
     */
    _shouldRetry(response, config) {
        return config.retryErrorChecks.some(check => check(response)) && config.retryingMs <= config.maxRetryingMs;
    }

    /**
     * Calculate delay before next retry attempt.
     */
    _retryDelay(attempts, periods) {
        return periods[attempts - 1] || periods[periods.length - 1];
    }

    /**
     * Build error data object for Sentry reporting.
     */
    _buildErrorData(config, startTime) {
        const data = {
            errorName: config.errorName,
            attempts: config.attempts,
            totalSeconds: moment().diff(moment(startTime), 'seconds')
        };
        if (this._responseServer) {
            data.server = this._responseServer;
        }
        return data;
    }

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(request, status);
        this._maybeTriggerUpgrade(headers);
        const errorInstance = this._mapErrorInstance(status, headers, payload);
        if (errorInstance) {
            return errorInstance;
        }

        this._trackResponseServer(headers, request);
        this._handleAuthErrors(status, headers, payload, request);
        return super.handleResponse(...arguments);
    }

    /**
     * Populate Sentry context for the request.
     */
    _setSentryContext(request, status) {
        Sentry.setContext('ajax', {
            url: request.url,
            method: request.method,
            status
        });
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200));
        Sentry.setTag('ajax_method', request.method);
    }

    /**
     * Refresh upgrade status if server version is newer.
     */
    _maybeTriggerUpgrade(headers) {
        if (headers['content-version']) {
            const contentVersion = semverCoerce(headers['content-version']);
            const appVersion = semverCoerce(config.APP.version);
            if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
                this.upgradeStatus.refreshRequired = true;
            }
        }
    }

    /**
     * Map HTTP status to a specific error instance, if applicable.
     */
    _mapErrorInstance(status, headers, payload) {
        if (this.isTwoFactorTokenRequiredError(status, headers, payload)) {
            return new TwoFactorTokenRequiredError(payload);
        }
        if (this.isVersionMismatchError(status, headers, payload)) {
            return new VersionMismatchError(payload);
        }
        if (this.isServerUnreachableError(status, headers, payload)) {
            return new ServerUnreachableError(payload);
        }
        if (this.isRequestEntityTooLargeError(status, headers, payload)) {
            return new RequestEntityTooLargeError(payload);
        }
        if (this.isUnsupportedMediaTypeError(status, headers, payload)) {
            return new UnsupportedMediaTypeError(payload);
        }
        if (this.isMaintenanceError(status, headers, payload)) {
            return new MaintenanceError(payload);
        }
        if (this.isThemeValidationError(status, headers, payload)) {
            return new ThemeValidationError(payload);
        }
        if (this.isHostLimitError(status, headers, payload)) {
            return new HostLimitError(payload);
        }
        if (this.isEmailError(status, headers, payload)) {
            return new EmailError(payload);
        }
        if (this.isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
        }
        return null;
    }

    /**
     * Record server header for Ghost requests and handle session invalidation on auth errors.
     */
    _trackResponseServer(headers, request) {
        if (GHOST_REQUEST.test(request.url)) {
            this._responseServer = headers.server;
        }
    }

    /**
     * Invalidate session when unauthorized or specific forbidden responses are received.
     */
    _handleAuthErrors(status, headers, payload, request) {
        const isGhostRequest = GHOST_REQUEST.test(request.url);
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);

        if (isAuthenticated && isGhostRequest && (isUnauthorized || (isForbidden && payload.errors?.[0].message === 'Authorization failed'))) {
            this.skipSessionDeletion = true;
            this.session.invalidate();
        }
    }

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            let errors = payload.error || payload.errors || payload.message;
            if (errors) {
                if (!isEmberArray(errors)) {
                    errors = [errors];
                }
                payload.errors = errors.map(error => typeof error === 'string' ? {message: error} : error);
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

// reopen to set default content type
ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;