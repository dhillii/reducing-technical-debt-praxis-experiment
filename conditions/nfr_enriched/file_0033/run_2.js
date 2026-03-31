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
const MAX_RETRY_MS = 15_000;
const RETRY_PERIODS = [500, 1000];
const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

// ─── Utilities ───────────────────────────────────────────────────────────────

function isJSONContentType(header) {
    return !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0;
}

export function getJSONPayload(payload) {
    if (typeof payload !== 'string') {
        return payload;
    }
    try {
        return JSON.parse(payload);
    } catch {
        return payload;
    }
}

export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus?.payload?.errors;
    return (Array.isArray(errors) && errors.length > 0 && errors[0].code) || null;
}

// ─── Error factory helpers ────────────────────────────────────────────────────

function createAjaxError(message) {
    return class extends AjaxError {
        constructor(payload) {
            super(payload, message);
        }
    };
}

function createInstanceChecker(ErrorClass) {
    return function (errorOrStatus) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : errorOrStatus === ErrorClass.statusCode;
    };
}

function createPayloadTypeChecker(ErrorClass, typeName) {
    return function (errorOrStatus, payload) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : get(payload || {}, 'errors.firstObject.type') === typeName;
    };
}

// ─── Error classes ────────────────────────────────────────────────────────────

export const VersionMismatchError = createAjaxError('API server is running a newer version of Ghost, please upgrade.');
export const DataImportError = createAjaxError('The server encountered an error whilst importing data.');
export const ServerUnreachableError = createAjaxError('Server was unreachable');
export const RequestEntityTooLargeError = createAjaxError('Request is larger than the maximum file size the server allows');
export const UnsupportedMediaTypeError = createAjaxError('Request contains an unknown or unsupported file type.');
export const MaintenanceError = createAjaxError('Ghost is currently undergoing maintenance, please wait a moment then retry.');
export const ThemeValidationError = createAjaxError('Theme is not compatible or contains errors.');
export const HostLimitError = createAjaxError('A hosting plan limit was reached or exceeded.');
export const EmailError = createAjaxError('Please verify your email settings');

export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        super(getJSONPayload(payload), '2nd factor verification is required to sign in.');
    }
}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

// ─── Status-code based checkers ───────────────────────────────────────────────

export function isServerUnreachableError(error) {
    return isAjaxError(error) ? error instanceof ServerUnreachableError : error === 0 || error === '0';
}

export function isRequestEntityTooLargeError(errorOrStatus) {
    return isAjaxError(errorOrStatus) ? errorOrStatus instanceof RequestEntityTooLargeError : errorOrStatus === 413;
}

export function isUnsupportedMediaTypeError(errorOrStatus) {
    return isAjaxError(errorOrStatus) ? errorOrStatus instanceof UnsupportedMediaTypeError : errorOrStatus === 415;
}

export function isMaintenanceError(errorOrStatus) {
    return isAjaxError(errorOrStatus) ? errorOrStatus instanceof MaintenanceError : errorOrStatus === 503;
}

export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

// ─── Payload-type based checkers ─────────────────────────────────────────────

export const isVersionMismatchError = createPayloadTypeChecker(VersionMismatchError, 'VersionMismatchError');
export const isDataImportError = createPayloadTypeChecker(DataImportError, 'DataImportError');
export const isThemeValidationError = createPayloadTypeChecker(ThemeValidationError, 'ThemeValidationError');
export const isHostLimitError = createPayloadTypeChecker(HostLimitError, 'HostLimitError');
export const isEmailError = createPayloadTypeChecker(EmailError, 'EmailError');

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return (
            errorOrStatus instanceof TwoFactorTokenRequiredError ||
            TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus))
        );
    }
    return TWO_FACTOR_AUTH_CODES.includes(get(getJSONPayload(payload) || {}, 'errors.firstObject.code'));
}

// ─── Error response map ───────────────────────────────────────────────────────

const ERROR_RESPONSE_MAP = [
    {check: 'isTwoFactorTokenRequiredError', ErrorClass: TwoFactorTokenRequiredError},
    {check: 'isVersionMismatchError', ErrorClass: VersionMismatchError},
    {check: 'isServerUnreachableError', ErrorClass: ServerUnreachableError},
    {check: 'isRequestEntityTooLargeError', ErrorClass: RequestEntityTooLargeError},
    {check: 'isUnsupportedMediaTypeError', ErrorClass: UnsupportedMediaTypeError},
    {check: 'isMaintenanceError', ErrorClass: MaintenanceError},
    {check: 'isThemeValidationError', ErrorClass: ThemeValidationError},
    {check: 'isHostLimitError', ErrorClass: HostLimitError},
    {check: 'isEmailError', ErrorClass: EmailError},
];

// ─── Service ─────────────────────────────────────────────────────────────────

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
        const retryChecks = [this.isServerUnreachableError, this.isMaintenanceError];

        let attempts = 0;
        let errorName = null;

        const getErrorData = () => ({
            errorName,
            attempts,
            totalSeconds: moment().diff(moment(startTime), 'seconds'),
            ...(this._responseServer && {server: this._responseServer}),
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
                const canRetry = retryChecks.some(check => check(error.response)) && retryingMs <= MAX_RETRY_MS;

                if (this.isTesting) {
                    throw error;
                }

                if (canRetry) {
                    await timeout(RETRY_PERIODS[attempts] ?? RETRY_PERIODS.at(-1));
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
        this._setSentryContext(status, request);
        this._checkVersionMismatch(headers);

        for (const {check, ErrorClass} of ERROR_RESPONSE_MAP) {
            if (this[check](status, headers, payload)) {
                return new ErrorClass(payload);
            }
        }

        if (this.isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
        }

        const isGhostRequest = GHOST_REQUEST.test(request.url);

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        this._handleAuthFailure(status, headers, payload, isGhostRequest);

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

    _handleAuthFailure(status, headers, payload, isGhostRequest) {
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);
        const isForbiddenAuthFailure = isForbidden && payload.errors?.[0]?.message === 'Authorization failed';

        if (isAuthenticated && isGhostRequest && (isUnauthorized || isForbiddenAuthFailure)) {
            this.skipSessionDeletion = true;
            this.session.invalidate();
        }
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

    // ─── Delegating instance methods ─────────────────────────────────────────

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

    isMaintenanceError(status) {
        return isMaintenanceError(status);
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

ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;
```