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

/* Error classes and type guards */

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

export class ServerUnreachableError extends AjaxError {
    constructor(payload) {
        super(payload, 'Server was unreachable');
    }
}

export function isServerUnreachableError(error) {
    if (isAjaxError(error)) {
        return error instanceof ServerUnreachableError;
    }
    return error === 0 || error === '0';
}

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

export function getErrorCode(errorOrStatus) {
    if (isAjaxError(errorOrStatus) &&
        errorOrStatus.payload &&
        errorOrStatus.payload.errors &&
        Array.isArray(errorOrStatus.payload.errors) &&
        errorOrStatus.payload.errors.length > 0) {
        return errorOrStatus.payload.errors[0].code || null;
    }
    return null;
}

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

export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        payload = getJSONPayload(payload);
        super(payload, '2nd factor verification is required to sign in.');
    }
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    const twoFactorAuthCodes = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError ||
            twoFactorAuthCodes.includes(getErrorCode(errorOrStatus));
    }
    payload = getJSONPayload(payload);
    return twoFactorAuthCodes.includes(get(payload || {}, 'errors.firstObject.code'));
}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

/* Helper functions for retry logic */

function buildErrorData(errorName, attempts, startTime, responseServer) {
    const data = {
        errorName,
        attempts,
        totalSeconds: moment().diff(moment(startTime), 'seconds')
    };
    if (responseServer) {
        data.server = responseServer;
    }
    return data;
}

async function retryRequest(makeRequest, hash, options) {
    const {
        maxRetryMs,
        retryPeriods,
        errorChecks,
        sentryDsn,
        startTime,
        responseServer
    } = options;

    let success = false;
    let errorName = null;
    let attempts = 0;
    let retryingMs = 0;

    while (retryingMs <= maxRetryMs && !success) {
        try {
            const result = await makeRequest(hash);
            success = true;
            if (attempts !== 0 && sentryDsn) {
                Sentry.captureMessage('Request took multiple attempts', {
                    extra: buildErrorData(errorName, attempts, startTime, responseServer)
                });
            }
            return result;
        } catch (error) {
            errorName = error.response?.constructor?.name;
            retryingMs = (new Date()) - startTime;

            if (options.isTesting) {
                throw error;
            }

            const shouldRetry = errorChecks.some(check => check(error.response)) &&
                retryingMs <= maxRetryMs;

            if (shouldRetry) {
                await timeout(retryPeriods[attempts] || retryPeriods[retryPeriods.length - 1]);
                attempts += 1;
            } else if (attempts > 0 && sentryDsn) {
                Sentry.captureMessage('Request failed after multiple attempts', {
                    extra: buildErrorData(errorName, attempts, startTime, responseServer)
                });
                throw error;
            } else {
                throw error;
            }
        }
    }
}

@classic
class ajaxService extends AjaxService {
    @service session;
    @service upgradeStatus;
    @service feature;

    @inject config;

    skipSessionDeletion = false;

    get headers() {
        const headers = {
            'App-Pragma': 'no-cache'
        };
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

        const startTime = new Date();
        const maxRetryMs = 15_000;
        const retryPeriods = [500, 1000];
        const errorChecks = [this.isServerUnreachableError, this.isMaintenanceError];

        const makeRequest = super._makeRequest.bind(this);

        return await retryRequest(makeRequest, hash, {
            maxRetryMs,
            retryPeriods,
            errorChecks,
            sentryDsn: this.config.sentry_dsn,
            startTime,
            responseServer: this._responseServer,
            isTesting: this.isTesting
        });
    }

    handleResponse(status, headers, payload, request) {
        Sentry.setContext('ajax', {
            url: request.url,
            method: request.method,
            status
        });
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200));
        Sentry.setTag('ajax_method', request.method);

        if (headers['content-version']) {
            const contentVersion = semverCoerce(headers['content-version']);
            const appVersion = semverCoerce(config.APP.version);
            if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
                this.upgradeStatus.refreshRequired = true;
            }
        }

        const errorHandlers = [
            [this.isTwoFactorTokenRequiredError, TwoFactorTokenRequiredError],
            [this.isVersionMismatchError, VersionMismatchError],
            [this.isServerUnreachableError, ServerUnreachableError],
            [this.isRequestEntityTooLargeError, RequestEntityTooLargeError],
            [this.isUnsupportedMediaTypeError, UnsupportedMediaTypeError],
            [this.isMaintenanceError, MaintenanceError],
            [this.isThemeValidationError, ThemeValidationError],
            [this.isHostLimitError, HostLimitError],
            [this.isEmailError, EmailError],
            [this.isAcceptedResponse, AcceptedResponse]
        ];

        for (const [check, ErrorClass] of errorHandlers) {
            if (check.call(this, status, headers, payload)) {
                return new ErrorClass(payload);
            }
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
            let errors = payload.error || payload.errors || payload.message || undefined;
            if (errors) {
                if (!isEmberArray(errors)) {
                    errors = [errors];
                }
                payload.errors = errors.map(function (error) {
                    if (typeof error === 'string') {
                        return {message: error};
                    }
                    return error;
                });
            }
        }
        return super.normalizeErrorResponse(status, headers, payload);
    }

    /* Wrapper methods for error checks */

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

ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;