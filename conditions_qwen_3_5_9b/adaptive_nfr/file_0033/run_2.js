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
            // do nothing
        }
    }
    return payload;
}

/* Error Classes */

export class VersionMismatchError extends AjaxError {
    constructor(payload) {
        super(payload, 'API server is running a newer version of Ghost, please upgrade.');
    }
}

export class DataImportError extends AjaxError {
    constructor(payload) {
        super(payload, 'The server encountered an error whilst importing data.');
    }
}

export class ServerUnreachableError extends AjaxError {
    constructor(payload) {
        super(payload, 'Server was unreachable');
    }
}

export class RequestEntityTooLargeError extends AjaxError {
    constructor(payload) {
        super(payload, 'Request is larger than the maximum file size the server allows');
    }
}

export class UnsupportedMediaTypeError extends AjaxError {
    constructor(payload) {
        super(payload, 'Request contains an unknown or unsupported file type.');
    }
}

export class MaintenanceError extends AjaxError {
    constructor(payload) {
        super(payload, 'Ghost is currently undergoing maintenance, please wait a moment then retry.');
    }
}

export class ThemeValidationError extends AjaxError {
    constructor(payload) {
        super(payload, 'Theme is not compatible or contains errors.');
    }
}

export class HostLimitError extends AjaxError {
    constructor(payload) {
        super(payload, 'A hosting plan limit was reached or exceeded.');
    }
}

export class EmailError extends AjaxError {
    constructor(payload) {
        super(payload, 'Please verify your email settings');
    }
}

export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload) {
        payload = getJSONPayload(payload);
        super(payload, '2nd factor verification is required to sign in.');
    }
}

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}

/* Error Predicates */

function isVersionMismatchErrorImpl(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof VersionMismatchError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'VersionMismatchError';
    }
}

function isDataImportErrorImpl(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof DataImportError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'DataImportError';
    }
}

function isServerUnreachableErrorImpl(error) {
    if (isAjaxError(error)) {
        return error instanceof ServerUnreachableError;
    } else {
        return error === 0 || error === '0';
    }
}

function isRequestEntityTooLargeErrorImpl(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof RequestEntityTooLargeError;
    } else {
        return errorOrStatus === 413;
    }
}

function isUnsupportedMediaTypeErrorImpl(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof UnsupportedMediaTypeError;
    } else {
        return errorOrStatus === 415;
    }
}

function isMaintenanceErrorImpl(errorOrStatus) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof MaintenanceError;
    } else {
        return errorOrStatus === 503;
    }
}

function isThemeValidationErrorImpl(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof ThemeValidationError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'ThemeValidationError';
    }
}

function isHostLimitErrorImpl(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof HostLimitError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'HostLimitError';
    }
}

function isEmailErrorImpl(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof EmailError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'EmailError';
    }
}

function isTwoFactorTokenRequiredErrorImpl(errorOrStatus, payload) {
    const twoFactorAuthCodes = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError || twoFactorAuthCodes.includes(getErrorCode(errorOrStatus));
    } else {
        payload = getJSONPayload(payload);
        return twoFactorAuthCodes.includes(get(payload || {}, 'errors.firstObject.code'));
    }
}

function isAcceptedResponseImpl(errorOrStatus) {
    return errorOrStatus === 202;
}

function getErrorCode(errorOrStatus) {
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload && errorOrStatus.payload.errors && Array.isArray(errorOrStatus.payload.errors) && errorOrStatus.payload.errors.length > 0) {
        return errorOrStatus.payload.errors[0].code || null;
    }
    return null;
}

/* Error Dispatcher */

const ERROR_HANDLERS = {
    'TwoFactorTokenRequiredError': isTwoFactorTokenRequiredErrorImpl,
    'VersionMismatchError': isVersionMismatchErrorImpl,
    'ServerUnreachableError': isServerUnreachableErrorImpl,
    'RequestEntityTooLargeError': isRequestEntityTooLargeErrorImpl,
    'UnsupportedMediaTypeError': isUnsupportedMediaTypeErrorImpl,
    'MaintenanceError': isMaintenanceErrorImpl,
    'ThemeValidationError': isThemeValidationErrorImpl,
    'HostLimitError': isHostLimitErrorImpl,
    'EmailError': isEmailErrorImpl,
    'AcceptedResponse': isAcceptedResponseImpl
};

function dispatchErrorCheck(status, headers, payload, handlerName) {
    const handler = ERROR_HANDLERS[handlerName];
    if (handler) {
        return handler(status, headers, payload);
    }
    return false;
}

/* Service Implementation */

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

    init() {
        super.init(...arguments);
        if (this.isTesting === undefined) {
            this.isTesting = config.environment === 'test';
        }
    }

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
        const retryErrorChecks = [isServerUnreachableErrorImpl, isMaintenanceErrorImpl];

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

        // Dispatch error checks based on type
        const errorType = get(payload || {}, 'errors.firstObject.type');
        const errorCheckResult = dispatchErrorCheck(status, headers, payload, errorType);

        if (errorCheckResult) {
            return new (ERROR_HANDLERS[errorType].constructor) || new Error('Unknown error type');
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

    isTwoFactorTokenRequiredError(status, headers, payload) {
        return isTwoFactorTokenRequiredErrorImpl(status, payload);
    }

    isVersionMismatchError(status, headers, payload) {
        return isVersionMismatchErrorImpl(status, payload);
    }

    isServerUnreachableError(status) {
        return isServerUnreachableErrorImpl(status);
    }

    isRequestEntityTooLargeError(status) {
        return isRequestEntityTooLargeErrorImpl(status);
    }

    isUnsupportedMediaTypeError(status) {
        return isUnsupportedMediaTypeErrorImpl(status);
    }

    isDataImportError(status) {
        return isDataImportErrorImpl(status, null);
    }

    isMaintenanceError(status, headers, payload) {
        return isMaintenanceErrorImpl(status, payload);
    }

    isThemeValidationError(status, headers, payload) {
        return isThemeValidationErrorImpl(status, payload);
    }

    isHostLimitError(status, headers, payload) {
        return isHostLimitErrorImpl(status, payload);
    }

    isEmailError(status, headers, payload) {
        return isEmailErrorImpl(status, payload);
    }

    isAcceptedResponse(status) {
        return isAcceptedResponseImpl(status);
    }
}

// we need to reopen so that internal methods use the correct contentType
ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;