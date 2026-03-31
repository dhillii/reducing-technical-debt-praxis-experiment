```typescript
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
const MAX_RETRYING_MS = 15_000;
const RETRY_PERIODS = [500, 1000];
const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

function isJSONContentType(header) {
    return !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0;
}

function getJSONPayload(payload) {
    if (typeof payload === 'string') {
        try {
            return JSON.parse(payload);
        } catch (e) {
            return payload;
        }
    }
    return payload;
}

function getFirstErrorType(payload) {
    return get(payload || {}, 'errors.firstObject.type');
}

function getFirstErrorCode(payload) {
    return get(payload || {}, 'errors.firstObject.code');
}

function createErrorChecker(ErrorClass, statusCode, typeOrCodeKey = null) {
    return {
        ErrorClass,
        statusCode,
        typeOrCodeKey,
        check(errorOrStatus, payload) {
            if (isAjaxError(errorOrStatus)) {
                return errorOrStatus instanceof ErrorClass;
            }
            if (typeOrCodeKey === 'type') {
                return getFirstErrorType(payload) === ErrorClass.name;
            }
            if (typeOrCodeKey === 'code') {
                return getFirstErrorCode(payload) === statusCode;
            }
            return errorOrStatus === statusCode;
        }
    };
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
    return getFirstErrorType(payload) === 'VersionMismatchError';
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
    return getFirstErrorType(payload) === 'DataImportError';
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
    }
    return error === 0 || error === '0';
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

export function getErrorCode(errorOrStatus) {
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors?.[0]) {
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
    return getFirstErrorType(payload) === 'ThemeValidationError';
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
    return getFirstErrorType(payload) === 'HostLimitError';
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
    return getFirstErrorType(payload) === 'EmailError';
}

/* 2FA required error */
export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        payload = getJSONPayload(payload);
        super(payload, '2nd factor verification is required to sign in.');
    }
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError || 
               TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus));
    }
    payload = getJSONPayload(payload);
    return TWO_FACTOR_AUTH_CODES.includes(getFirstErrorCode(payload));
}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

const ERROR_HANDLERS = [
    {
        check: isTwoFactorTokenRequiredError,
        ErrorClass: TwoFactorTokenRequiredError
    },
    {
        check: isVersionMismatchError,
        ErrorClass: VersionMismatchError
    },
    {
        check: isServerUnreachableError,
        ErrorClass: ServerUnreachableError
    },
    {
        check: isRequestEntityTooLargeError,
        ErrorClass: RequestEntityTooLargeError
    },
    {
        check: isUnsupportedMediaTypeError,
        ErrorClass: UnsupportedMediaTypeError
    },
    {
        check: isMaintenanceError,
        ErrorClass: MaintenanceError
    },
    {
        check: isThemeValidationError,
        ErrorClass: ThemeValidationError
    },
    {
        check: isHostLimitError,
        ErrorClass: HostLimitError
    },
    {
        check: isEmailError,
        ErrorClass: EmailError
    }
];

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

        let success = false;
        let errorName = null;
        let attempts = 0;
        const startTime = new Date();
        let retryingMs = 0;
        const retryErrorChecks = [this.isServerUnreachableError, this.isMaintenanceError];
        const makeRequest = super._makeRequest.bind(this);

        const getErrorData = () => ({
            errorName,
            attempts,
            totalSeconds: moment().diff(moment(startTime), 'seconds'),
            ...(this._responseServer && {server: this._responseServer})
        });

        const shouldRetry = (error) => {
            return retryErrorChecks.some(check => check(error.response)) && 
                   retryingMs <= MAX_RETRYING_MS;
        };

        const getRetryDelay = () => RETRY_PERIODS[attempts] || RETRY_PERIODS[RETRY_PERIODS.length - 1];

        while (retryingMs <= MAX_RETRYING_MS && !success) {
            try {
                const result = await makeRequest(hash);
                success = true;

                if (attempts !== 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {extra: getErrorData()});
                }

                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;
                retryingMs = new Date() - startTime;

                if (this.isTesting) {
                    throw error;
                }

                if (shouldRetry(error)) {
                    await timeout(getRetryDelay());
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

        // Check for special error responses
        if (isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
        }

        for (const handler of ERROR_HANDLERS) {
            if (handler.check(status, payload)) {
                return new handler.ErrorClass(payload);
            }
        }

        const isGhostRequest = GHOST_REQUEST.test(request.url);
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        if (isAuthenticated && isGhostRequest && 
            (isUnauthorized || (isForbidden && payload.errors?.[0].message === 'Authorization failed'))) {
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

                payload.errors = errors.map((error) => 
                    typeof error === 'string' ? {message: error} : error
                );
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

ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;
```