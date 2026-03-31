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
const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];
const MAX_RETRY_MS = 15_000;
const RETRY_PERIODS = [500, 1000];

// ============================================================================
// Utility Functions
// ============================================================================

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

function getErrorCode(errorOrStatus) {
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors?.[0]) {
        return errorOrStatus.payload.errors[0].code || null;
    }
    return null;
}

// ============================================================================
// Custom Error Classes and Validators
// ============================================================================

class CustomAjaxError extends AjaxError {
    constructor(payload, message) {
        super(payload, message);
    }
}

export class VersionMismatchError extends CustomAjaxError {
    constructor(payload) {
        super(payload, 'API server is running a newer version of Ghost, please upgrade.');
    }
}

export class DataImportError extends CustomAjaxError {
    constructor(payload) {
        super(payload, 'The server encountered an error whilst importing data.');
    }
}

export class ServerUnreachableError extends CustomAjaxError {
    constructor(payload) {
        super(payload, 'Server was unreachable');
    }
}

export class RequestEntityTooLargeError extends CustomAjaxError {
    constructor(payload) {
        super(payload, 'Request is larger than the maximum file size the server allows');
    }
}

export class UnsupportedMediaTypeError extends CustomAjaxError {
    constructor(payload) {
        super(payload, 'Request contains an unknown or unsupported file type.');
    }
}

export class MaintenanceError extends CustomAjaxError {
    constructor(payload) {
        super(payload, 'Ghost is currently undergoing maintenance, please wait a moment then retry.');
    }
}

export class ThemeValidationError extends CustomAjaxError {
    constructor(payload) {
        super(payload, 'Theme is not compatible or contains errors.');
    }
}

export class HostLimitError extends CustomAjaxError {
    constructor(payload) {
        super(payload, 'A hosting plan limit was reached or exceeded.');
    }
}

export class EmailError extends CustomAjaxError {
    constructor(payload) {
        super(payload, 'Please verify your email settings');
    }
}

export class TwoFactorTokenRequiredError extends CustomAjaxError {
    constructor(payload) {
        super(getJSONPayload(payload), '2nd factor verification is required to sign in.');
    }
}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

// ============================================================================
// Error Type Checkers
// ============================================================================

const errorCheckers = {
    isVersionMismatchError(errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof VersionMismatchError;
        }
        return getFirstErrorType(payload) === 'VersionMismatchError';
    },

    isDataImportError(errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof DataImportError;
        }
        return getFirstErrorType(payload) === 'DataImportError';
    },

    isServerUnreachableError(errorOrStatus) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof ServerUnreachableError;
        }
        return errorOrStatus === 0 || errorOrStatus === '0';
    },

    isRequestEntityTooLargeError(errorOrStatus) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof RequestEntityTooLargeError;
        }
        return errorOrStatus === 413;
    },

    isUnsupportedMediaTypeError(errorOrStatus) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof UnsupportedMediaTypeError;
        }
        return errorOrStatus === 415;
    },

    isMaintenanceError(errorOrStatus) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof MaintenanceError;
        }
        return errorOrStatus === 503;
    },

    isThemeValidationError(errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof ThemeValidationError;
        }
        return getFirstErrorType(payload) === 'ThemeValidationError';
    },

    isHostLimitError(errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof HostLimitError;
        }
        return getFirstErrorType(payload) === 'HostLimitError';
    },

    isEmailError(errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof EmailError;
        }
        return getFirstErrorType(payload) === 'EmailError';
    },

    isTwoFactorTokenRequiredError(errorOrStatus, payload) {
        if (isAjaxError(errorOrStatus)) {
            return errorOrStatus instanceof TwoFactorTokenRequiredError || 
                   TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus));
        }
        payload = getJSONPayload(payload);
        return TWO_FACTOR_AUTH_CODES.includes(getFirstErrorCode(payload));
    },

    isAcceptedResponse(status) {
        return status === 202;
    }
};

// Export checker functions
export const isVersionMismatchError = (status, payload) => errorCheckers.isVersionMismatchError(status, payload);
export const isDataImportError = (status, payload) => errorCheckers.isDataImportError(status, payload);
export const isServerUnreachableError = (status) => errorCheckers.isServerUnreachableError(status);
export const isRequestEntityTooLargeError = (status) => errorCheckers.isRequestEntityTooLargeError(status);
export const isUnsupportedMediaTypeError = (status) => errorCheckers.isUnsupportedMediaTypeError(status);
export const isMaintenanceError = (status) => errorCheckers.isMaintenanceError(status);
export const isThemeValidationError = (status, payload) => errorCheckers.isThemeValidationError(status, payload);
export const isHostLimitError = (status, payload) => errorCheckers.isHostLimitError(status, payload);
export const isEmailError = (status, payload) => errorCheckers.isEmailError(status, payload);
export const isTwoFactorTokenRequiredError = (status, payload) => errorCheckers.isTwoFactorTokenRequiredError(status, payload);
export const isAcceptedResponse = (status) => errorCheckers.isAcceptedResponse(status);

// ============================================================================
// Error Response Mapping
// ============================================================================

const errorResponseMap = [
    { checker: 'isTwoFactorTokenRequiredError', ErrorClass: TwoFactorTokenRequiredError },
    { checker: 'isVersionMismatchError', ErrorClass: VersionMismatchError },
    { checker: 'isServerUnreachableError', ErrorClass: ServerUnreachableError },
    { checker: 'isRequestEntityTooLargeError', ErrorClass: RequestEntityTooLargeError },
    { checker: 'isUnsupportedMediaTypeError', ErrorClass: UnsupportedMediaTypeError },
    { checker: 'isMaintenanceError', ErrorClass: MaintenanceError },
    { checker: 'isThemeValidationError', ErrorClass: ThemeValidationError },
    { checker: 'isHostLimitError', ErrorClass: HostLimitError },
    { checker: 'isEmailError', ErrorClass: EmailError },
    { checker: 'isAcceptedResponse', ErrorClass: AcceptedResponse }
];

// ============================================================================
// AJAX Service
// ============================================================================

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

        return this._makeRequestWithRetry(hash);
    }

    async _makeRequestWithRetry(hash) {
        let success = false;
        let errorName = null;
        let attempts = 0;
        const startTime = new Date();
        const makeRequest = super._makeRequest.bind(this);

        while (!success) {
            try {
                const result = await makeRequest(hash);
                success = true;

                if (attempts !== 0 && this.config.sentry_dsn) {
                    this._captureRetrySuccess(errorName, attempts, startTime);
                }

                return result;
            } catch (error) {
                const retryingMs = new Date() - startTime;
                errorName = error.response?.constructor?.name;

                if (this.isTesting) {
                    throw error;
                }

                if (this._shouldRetry(error.response, retryingMs)) {
                    await timeout(RETRY_PERIODS[attempts] || RETRY_PERIODS[RETRY_PERIODS.length - 1]);
                    attempts += 1;
                } else {
                    if (attempts > 0 && this.config.sentry_dsn) {
                        this._captureRetryFailure(errorName, attempts, startTime);
                    }
                    throw error;
                }
            }
        }
    }

    _shouldRetry(response, retryingMs) {
        return retryingMs <= MAX_RETRY_MS && 
               (this.isServerUnreachableError(response) || this.isMaintenanceError(response));
    }

    _captureRetrySuccess(errorName, attempts, startTime) {
        Sentry.captureMessage('Request took multiple attempts', {
            extra: this._getErrorData(errorName, attempts, startTime)
        });
    }

    _captureRetryFailure(errorName, attempts, startTime) {
        Sentry.captureMessage('Request failed after multiple attempts', {
            extra: this._getErrorData(errorName, attempts, startTime)
        });
    }

    _getErrorData(errorName, attempts, startTime) {
        const data = {
            errorName,
            attempts,
            totalSeconds: moment().diff(moment(startTime), 'seconds')
        };
        if (this._responseServer) {
            data.server = this._responseServer;
        }
        return data;
    }

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(status, request);
        this._checkVersionMismatch(headers);

        const customError = this._getCustomError(status, headers, payload);
        if (customError) {
            return customError;
        }

        this._handleAuthenticationErrors(status, headers, payload, request);

        return super.handleResponse(...arguments);
    }

    _setSentryContext(status, request) {
        Sentry.setContext('ajax', {
            url: request.url,
            method: request.method,
            status
        });
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200));
        Sentry.setTag('ajax_method', request.method);
    }

    _checkVersionMismatch(headers) {
        if (headers['content-version']) {
            const contentVersion = semverCoerce(headers['content-version']);
            const appVersion = semverCoerce(config.APP.version);

            if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
                this.upgradeStatus.refreshRequired = true;
            }
        }
    }

    _getCustomError(status, headers, payload) {
        for (const {checker, ErrorClass} of errorResponseMap) {
            if (errorCheckers[checker](status, payload)) {
                return new ErrorClass(payload);
            }
        }
        return null;
    }

    _handleAuthenticationErrors(status, headers, payload, request) {
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
    }

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            let errors = payload.error || payload.errors || payload.message;

            if (errors) {
                if (!isEmberArray(errors)) {
                    errors = [errors];
                }

                payload.errors = errors.map(error => 
                    typeof error === 'string' ? {message: error} : error
                );
            }
        }

        return super.normalizeErrorResponse(status, headers, payload);
    }

    // Delegate methods to error checkers
    isTwoFactorTokenRequiredError(status, headers, payload) {
        return errorCheckers.isTwoFactorTokenRequiredError(status, payload);
    }