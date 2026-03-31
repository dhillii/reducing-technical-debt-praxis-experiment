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

// ─── Error Classes ────────────────────────────────────────────────────────────

const ERROR_DEFINITIONS = {
    VersionMismatchError: 'API server is running a newer version of Ghost, please upgrade.',
    DataImportError: 'The server encountered an error whilst importing data.',
    ServerUnreachableError: 'Server was unreachable',
    RequestEntityTooLargeError: 'Request is larger than the maximum file size the server allows',
    UnsupportedMediaTypeError: 'Request contains an unknown or unsupported file type.',
    MaintenanceError: 'Ghost is currently undergoing maintenance, please wait a moment then retry.',
    ThemeValidationError: 'Theme is not compatible or contains errors.',
    HostLimitError: 'A hosting plan limit was reached or exceeded.',
    EmailError: 'Please verify your email settings',
};

function createAjaxErrorClass(message) {
    return class extends AjaxError {
        constructor(payload) {
            super(payload, message);
        }
    };
}

export const VersionMismatchError = createAjaxErrorClass(ERROR_DEFINITIONS.VersionMismatchError);
export const DataImportError = createAjaxErrorClass(ERROR_DEFINITIONS.DataImportError);
export const ServerUnreachableError = createAjaxErrorClass(ERROR_DEFINITIONS.ServerUnreachableError);
export const RequestEntityTooLargeError = createAjaxErrorClass(ERROR_DEFINITIONS.RequestEntityTooLargeError);
export const UnsupportedMediaTypeError = createAjaxErrorClass(ERROR_DEFINITIONS.UnsupportedMediaTypeError);
export const MaintenanceError = createAjaxErrorClass(ERROR_DEFINITIONS.MaintenanceError);
export const ThemeValidationError = createAjaxErrorClass(ERROR_DEFINITIONS.ThemeValidationError);
export const HostLimitError = createAjaxErrorClass(ERROR_DEFINITIONS.HostLimitError);
export const EmailError = createAjaxErrorClass(ERROR_DEFINITIONS.EmailError);

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

// ─── Error Checkers ───────────────────────────────────────────────────────────

function makeInstanceOrStatusChecker(ErrorClass, statusCode) {
    return function (errorOrStatus) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : errorOrStatus === statusCode;
    };
}

function makeInstanceOrPayloadTypeChecker(ErrorClass, errorType) {
    return function (errorOrStatus, payload) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : get(payload || {}, 'errors.firstObject.type') === errorType;
    };
}

export const isVersionMismatchError = makeInstanceOrPayloadTypeChecker(VersionMismatchError, 'VersionMismatchError');
export const isDataImportError = makeInstanceOrPayloadTypeChecker(DataImportError, 'DataImportError');
export const isThemeValidationError = makeInstanceOrPayloadTypeChecker(ThemeValidationError, 'ThemeValidationError');
export const isHostLimitError = makeInstanceOrPayloadTypeChecker(HostLimitError, 'HostLimitError');
export const isEmailError = makeInstanceOrPayloadTypeChecker(EmailError, 'EmailError');

export const isRequestEntityTooLargeError = makeInstanceOrStatusChecker(RequestEntityTooLargeError, 413);
export const isUnsupportedMediaTypeError = makeInstanceOrStatusChecker(UnsupportedMediaTypeError, 415);
export const isMaintenanceError = makeInstanceOrStatusChecker(MaintenanceError, 503);

export function isServerUnreachableError(error) {
    return isAjaxError(error)
        ? error instanceof ServerUnreachableError
        : error === 0 || error === '0';
}

export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors;
    return (Array.isArray(errors) && errors.length > 0 && errors[0].code) || null;
}

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return (
            errorOrStatus instanceof TwoFactorTokenRequiredError ||
            TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus))
        );
    }
    const parsed = getJSONPayload(payload);
    return TWO_FACTOR_AUTH_CODES.includes(get(parsed || {}, 'errors.firstObject.code'));
}

// ─── Error Response Map ───────────────────────────────────────────────────────

const ERROR_RESPONSE_MAP = [
    {check: (s, h, p) => isTwoFactorTokenRequiredError(s, p), ErrorClass: TwoFactorTokenRequiredError},
    {check: (s, h, p) => isVersionMismatchError(s, p), ErrorClass: VersionMismatchError},
    {check: (s) => isServerUnreachableError(s), ErrorClass: ServerUnreachableError},
    {check: (s) => isRequestEntityTooLargeError(s), ErrorClass: RequestEntityTooLargeError},
    {check: (s) => isUnsupportedMediaTypeError(s), ErrorClass: UnsupportedMediaTypeError},
    {check: (s) => isMaintenanceError(s), ErrorClass: MaintenanceError},
    {check: (s, h, p) => isThemeValidationError(s, p), ErrorClass: ThemeValidationError},
    {check: (s, h, p) => isHostLimitError(s, p), ErrorClass: HostLimitError},
    {check: (s, h, p) => isEmailError(s, p), ErrorClass: EmailError},
];

// ─── Ajax Service ─────────────────────────────────────────────────────────────

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
        const makeRequest = super._makeRequest.bind(this);
        const startTime = new Date();
        let attempts = 0;
        let errorName = null;

        const getErrorData = () => {
            const data = {
                errorName,
                attempts,
                totalSeconds: moment().diff(moment(startTime), 'seconds'),
            };
            if (this._responseServer) {
                data.server = this._responseServer;
            }
            return data;
        };

        const isRetryableError = (response) =>
            isServerUnreachableError(response) || isMaintenanceError(response);

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

                if (this.isTesting) {
                    throw error;
                }

                const canRetry = isRetryableError(error.response) && retryingMs <= MAX_RETRY_MS;

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

    _matchErrorResponse(status, headers, payload) {
        for (const {check, ErrorClass} of ERROR_RESPONSE_MAP) {
            if (check(status, headers, payload)) {
                return new ErrorClass(payload);
            }
        }
        if (isAcceptedResponse(status)) {
            return new AcceptedResponse(payload);
        }
        return null;
    }

    _handleSessionInvalidation(status, headers, payload, request) {
        const isGhostRequest = GHOST_REQUEST.test(request.url);
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);
        const isForbiddenAuthFailure =
            isForbidden && payload.errors?.[0]?.message === 'Authorization failed';

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

        const matched = this._matchErrorResponse(status, headers, payload);
        if (matched) {
            return matched;
        }

        this._handleSessionInvalidation(status, headers, payload, request);

        return super.handleResponse(...arguments);
    }

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            const rawErrors = payload.error || payload.errors || payload.message;
            if (rawErrors) {
                const errorsArray = isEmberArray(rawErrors) ? rawErrors : [rawErrors];
                payload.errors = errorsArray.map((error) =>
                    typeof error === 'string' ? {message: error} : error
                );
            }
        }
        return super.normalizeErrorResponse(status, headers, payload);
    }

    // ─── Instance method delegates ──────────────────────────────────────────

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

    isMaintenanceError(status) {
        return isMaintenanceError(status);
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
    contentType: 'application/json; charset=UTF-8',
});

export default ajaxService;
```