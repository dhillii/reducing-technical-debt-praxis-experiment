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
const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];
const MAX_RETRY_MS = 15_000;
const RETRY_PERIODS = [500, 1000];

function isJSONContentType(header) {
    return !!(header && !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0);
}

function getJSONPayload(payload) {
    if (typeof payload !== 'string') {
        return payload;
    }
    try {
        return JSON.parse(payload);
    } catch (e) {
        return payload;
    }
}

function getFirstError(payload) {
    return get(payload || {}, 'errors.firstObject');
}

// Factory for creating simple AjaxError subclasses
function createAjaxError(message, preprocessPayload = false) {
    return class extends AjaxError {
        constructor(payload) {
            super(preprocessPayload ? getJSONPayload(payload) : payload, message);
        }
    };
}

// Factory for creating instance-check or status-code error checkers
function createStatusChecker(ErrorClass, statusCode) {
    return function (errorOrStatus) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : errorOrStatus === statusCode;
    };
}

// Factory for creating instance-check or payload-type error checkers
function createPayloadTypeChecker(ErrorClass, errorType) {
    return function (errorOrStatus, payload) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : getFirstError(payload)?.type === errorType;
    };
}

export class VersionMismatchError extends createAjaxError('API server is running a newer version of Ghost, please upgrade.') {}
export class DataImportError extends createAjaxError('The server encountered an error whilst importing data.') {}
export class ServerUnreachableError extends createAjaxError('Server was unreachable') {}
export class RequestEntityTooLargeError extends createAjaxError('Request is larger than the maximum file size the server allows') {}
export class UnsupportedMediaTypeError extends createAjaxError('Request contains an unknown or unsupported file type.') {}
export class MaintenanceError extends createAjaxError('Ghost is currently undergoing maintenance, please wait a moment then retry.') {}
export class ThemeValidationError extends createAjaxError('Theme is not compatible or contains errors.') {}
export class HostLimitError extends createAjaxError('A hosting plan limit was reached or exceeded.') {}
export class EmailError extends createAjaxError('Please verify your email settings') {}
export class TwoFactorTokenRequiredError extends createAjaxError('2nd factor verification is required to sign in.', true) {}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

export const isVersionMismatchError = createPayloadTypeChecker(VersionMismatchError, 'VersionMismatchError');
export const isDataImportError = createPayloadTypeChecker(DataImportError, 'DataImportError');
export const isThemeValidationError = createPayloadTypeChecker(ThemeValidationError, 'ThemeValidationError');
export const isHostLimitError = createPayloadTypeChecker(HostLimitError, 'HostLimitError');
export const isEmailError = createPayloadTypeChecker(EmailError, 'EmailError');
export const isServerUnreachableError = (error) => isAjaxError(error) ? error instanceof ServerUnreachableError : error === 0 || error === '0';
export const isRequestEntityTooLargeError = createStatusChecker(RequestEntityTooLargeError, 413);
export const isUnsupportedMediaTypeError = createStatusChecker(UnsupportedMediaTypeError, 415);
export const isMaintenanceError = createStatusChecker(MaintenanceError, 503);
export const isAcceptedResponse = (errorOrStatus) => errorOrStatus === 202;

export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors;
    return (Array.isArray(errors) && errors.length > 0 && errors[0].code) || null;
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError
            || TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus));
    }
    return TWO_FACTOR_AUTH_CODES.includes(get(getJSONPayload(payload) || {}, 'errors.firstObject.code'));
}

const ERROR_RESPONSE_MAP = [
    [(status, payload) => isTwoFactorTokenRequiredError(status, payload), TwoFactorTokenRequiredError],
    [(status, payload) => isVersionMismatchError(status, payload), VersionMismatchError],
    [(status) => isServerUnreachableError(status), ServerUnreachableError],
    [(status) => isRequestEntityTooLargeError(status), RequestEntityTooLargeError],
    [(status) => isUnsupportedMediaTypeError(status), UnsupportedMediaTypeError],
    [(status) => isMaintenanceError(status), MaintenanceError],
    [(status, payload) => isThemeValidationError(status, payload), ThemeValidationError],
    [(status, payload) => isHostLimitError(status, payload), HostLimitError],
    [(status, payload) => isEmailError(status, payload), EmailError],
    [(status) => isAcceptedResponse(status), AcceptedResponse],
];

@classic
class ajaxService extends AjaxService {
    @service session;
    @service upgradeStatus;
    @service feature;

    @inject config;

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
        if (isJSONContentType(hash.contentType) && hash.type !== 'GET' && typeof hash.data === 'object') {
            hash.data = JSON.stringify(hash.data);
        }

        hash.withCredentials = true;

        if (this.isTesting) {
            hash.headers['X-Test-User'] = this.session.user?.id;
        }

        return this._makeRequestWithRetry(hash);
    }

    async _makeRequestWithRetry(hash) {
        const makeRequest = super._makeRequest.bind(this);
        const startTime = new Date();
        const retryErrorChecks = [isServerUnreachableError, isMaintenanceError];

        let attempts = 0;
        let errorName = null;

        const getErrorData = () => ({
            errorName,
            attempts,
            totalSeconds: moment().diff(moment(startTime), 'seconds'),
            ...(this._responseServer && {server: this._responseServer})
        });

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
                const canRetry = retryErrorChecks.some(check => check(error.response)) && retryingMs <= MAX_RETRY_MS;

                if (this.isTesting) {
                    throw error;
                }

                if (canRetry) {
                    await timeout(RETRY_PERIODS[attempts] ?? RETRY_PERIODS[RETRY_PERIODS.length - 1]);
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

    _setSentryContext(status, request) {
        Sentry.setContext('ajax', {url: request.url, method: request.method, status});
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200));
        Sentry.setTag('ajax_method', request.method);
    }

    _checkVersionUpgrade(headers) {
        if (!headers['content-version']) {
            return;
        }
        const contentVersion = semverCoerce(headers['content-version']);
        const appVersion = semverCoerce(config.APP.version);
        if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
            this.upgradeStatus.refreshRequired = true;
        }
    }

    _matchErrorResponse(status, payload) {
        for (const [check, ErrorClass] of ERROR_RESPONSE_MAP) {
            if (check(status, payload)) {
                return new ErrorClass(payload);
            }
        }
        return null;
    }

    _handleAuthFailure(status, headers, payload, request) {
        const isGhostRequest = GHOST_REQUEST.test(request.url);
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);
        const isForbiddenAuthFailure = isForbidden && payload.errors?.[0]?.message === 'Authorization failed';

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        if (isAuthenticated && isGhostRequest && (isUnauthorized || isForbiddenAuthFailure)) {
            this.skipSessionDeletion = true;
            this.session.invalidate();
        }
    }

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(status, request);
        this._checkVersionUpgrade(headers);

        const matched = this._matchErrorResponse(status, payload);
        if (matched) {
            return matched;
        }

        this._handleAuthFailure(status, headers, payload, request);

        return super.handleResponse(...arguments);
    }

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            const rawErrors = payload.error || payload.errors || payload.message;
            if (rawErrors) {
                const errorsArray = isEmberArray(rawErrors) ? rawErrors : [rawErrors];
                payload.errors = errorsArray.map(error =>
                    typeof error === 'string' ? {message: error} : error
                );
            }
        }
        return super.normalizeErrorResponse(status, headers, payload);
    }

    isTwoFactorTokenRequiredError(status, headers, payload) { return isTwoFactorTokenRequiredError(status, payload); }
    isVersionMismatchError(status, headers, payload) { return isVersionMismatchError(status, payload); }
    isServerUnreachableError(status) { return isServerUnreachableError(status); }
    isRequestEntityTooLargeError(status) { return isRequestEntityTooLargeError(status); }
    isUnsupportedMediaTypeError(status) { return isUnsupportedMediaTypeError(status); }
    isDataImportError(status) { return isDataImportError(status); }
    isMaintenanceError(status) { return isMaintenanceError(status); }
    isThemeValidationError(status, headers, payload) { return isThemeValidationError(status, payload); }
    isHostLimitError(status, headers, payload) { return isHostLimitError(status, payload); }
    isEmailError(status, headers, payload) { return isEmailError(status, payload); }
    isAcceptedResponse(status) { return isAcceptedResponse(status); }
}

ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;
```