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

// ---- Error class factory ----

function createAjaxError(name, message) {
    class CustomError extends AjaxError {
        constructor(payload) {
            super(payload, message);
        }
    }
    Object.defineProperty(CustomError, 'name', {value: name});
    return CustomError;
}

export const VersionMismatchError = createAjaxError(
    'VersionMismatchError',
    'API server is running a newer version of Ghost, please upgrade.'
);

export const DataImportError = createAjaxError(
    'DataImportError',
    'The server encountered an error whilst importing data.'
);

export const ServerUnreachableError = createAjaxError(
    'ServerUnreachableError',
    'Server was unreachable'
);

export const RequestEntityTooLargeError = createAjaxError(
    'RequestEntityTooLargeError',
    'Request is larger than the maximum file size the server allows'
);

export const UnsupportedMediaTypeError = createAjaxError(
    'UnsupportedMediaTypeError',
    'Request contains an unknown or unsupported file type.'
);

export const MaintenanceError = createAjaxError(
    'MaintenanceError',
    'Ghost is currently undergoing maintenance, please wait a moment then retry.'
);

export const ThemeValidationError = createAjaxError(
    'ThemeValidationError',
    'Theme is not compatible or contains errors.'
);

export const HostLimitError = createAjaxError(
    'HostLimitError',
    'A hosting plan limit was reached or exceeded.'
);

export const EmailError = createAjaxError(
    'EmailError',
    'Please verify your email settings'
);

export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        super(getJSONPayload(payload), '2nd factor verification is required to sign in.');
    }
}

// ---- Error checkers ----

function makeInstanceChecker(ErrorClass) {
    return function (errorOrStatus) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : false;
    };
}

function makePayloadTypeChecker(ErrorClass, typeName) {
    return function (errorOrStatus, payload) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : get(payload || {}, 'errors.firstObject.type') === typeName;
    };
}

function makeStatusCodeChecker(ErrorClass, statusCode) {
    return function (errorOrStatus) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : errorOrStatus === statusCode;
    };
}

export const isVersionMismatchError = makePayloadTypeChecker(VersionMismatchError, 'VersionMismatchError');
export const isDataImportError = makePayloadTypeChecker(DataImportError, 'DataImportError');
export const isThemeValidationError = makePayloadTypeChecker(ThemeValidationError, 'ThemeValidationError');
export const isHostLimitError = makePayloadTypeChecker(HostLimitError, 'HostLimitError');
export const isEmailError = makePayloadTypeChecker(EmailError, 'EmailError');

export const isRequestEntityTooLargeError = makeStatusCodeChecker(RequestEntityTooLargeError, 413);
export const isUnsupportedMediaTypeError = makeStatusCodeChecker(UnsupportedMediaTypeError, 415);
export const isMaintenanceError = makeStatusCodeChecker(MaintenanceError, 503);

export function isServerUnreachableError(error) {
    return isAjaxError(error)
        ? error instanceof ServerUnreachableError
        : error === 0 || error === '0';
}

export function getErrorCode(errorOrStatus) {
    const errors = isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors;
    return (Array.isArray(errors) && errors.length > 0 && errors[0].code) || null;
}

const TWO_FACTOR_AUTH_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError
            || TWO_FACTOR_AUTH_CODES.includes(getErrorCode(errorOrStatus));
    }
    return TWO_FACTOR_AUTH_CODES.includes(get(getJSONPayload(payload) || {}, 'errors.firstObject.code'));
}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

// ---- Service ----

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

@classic
class ajaxService extends AjaxService {
    @service session;
    @service upgradeStatus;
    @service feature;

    @inject config;

    // flag to tell our ESA authenticator not to try an invalidate DELETE request
    // because it's been triggered by this service's 401 handling which means the
    // DELETE would fail and get stuck in an infinite loop
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

        while (true) {
            try {
                const result = await makeRequest(hash);

                if (attempts !== 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {extra: getErrorData()});
                }

                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;
                const retryingMs = (new Date()) - startTime;

                if (this.isTesting) {
                    throw error;
                }

                const shouldRetry = retryErrorChecks.some(check => check(error.response))
                    && retryingMs <= MAX_RETRY_MS;

                if (shouldRetry) {
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
        const isForbiddenAuthFailure = isForbidden && payload.errors?.[0].message === 'Authorization failed';

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

        const errorResponse = this._matchErrorResponse(status, headers, payload);
        if (errorResponse) {
            return errorResponse;
        }

        this._handleSessionInvalidation(status, headers, payload, request);

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

    // Delegating instance methods to module-level functions for ember-ajax compatibility
    isTwoFactorTokenRequiredError(status, headers, payload) { return isTwoFactorTokenRequiredError(status, payload); }
    isVersionMismatchError(status, headers, payload) { return isVersionMismatchError(status, payload); }
    isServerUnreachableError(status) { return isServerUnreachableError(status); }
    isRequestEntityTooLargeError(status) { return isRequestEntityTooLargeError(status); }
    isUnsupportedMediaTypeError(status) { return isUnsupportedMediaTypeError(status); }
    isDataImportError(status) { return isDataImportError(status); }
    isMaintenanceError(status, headers, payload) { return isMaintenanceError(status, payload); }
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