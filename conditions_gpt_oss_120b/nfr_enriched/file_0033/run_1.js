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
    const codes = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError || codes.includes(getErrorCode(errorOrStatus));
    }
    payload = getJSONPayload(payload);
    return codes.includes(get(payload || {}, 'errors.firstObject.code'));
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

/* Helper to extract error code */
export function getErrorCode(errorOrStatus) {
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors?.[0]?.code) {
        return errorOrStatus.payload.errors[0].code;
    }
    return null;
}

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
        this._prepareRequest(hash);
        const maxRetryMs = 15000;
        const retryPeriods = [500, 1000];
        const retryChecks = [this.isServerUnreachableError, this.isMaintenanceError];
        const start = new Date();
        let attempts = 0;
        let errorName = null;

        const makeRequest = super._makeRequest.bind(this);

        while (true) {
            try {
                const result = await makeRequest(hash);
                if (attempts && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {extra: this._errorMetrics(attempts, start, errorName)});
                }
                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;
                const elapsed = new Date() - start;

                if (this.isTesting) {
                    throw error;
                }

                if (retryChecks.some(cb => cb(error.response)) && elapsed <= maxRetryMs) {
                    await timeout(retryPeriods[attempts] || retryPeriods[retryPeriods.length - 1]);
                    attempts += 1;
                    continue;
                }

                if (attempts && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request failed after multiple attempts', {extra: this._errorMetrics(attempts, start, errorName)});
                }
                throw error;
            }
        }
    }

    _prepareRequest(hash) {
        if (isJSONContentType(hash.contentType) && hash.type !== 'GET' && typeof hash.data === 'object') {
            hash.data = JSON.stringify(hash.data);
        }
        hash.withCredentials = true;
        if (this.isTesting) {
            hash.headers['X-Test-User'] = this.session.user?.id;
        }
    }

    _errorMetrics(attempts, start, errorName) {
        const data = {
            errorName,
            attempts,
            totalSeconds: moment().diff(moment(start), 'seconds')
        };
        if (this._responseServer) {
            data.server = this._responseServer;
        }
        return data;
    }

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(request, status);
        this._maybeRefreshUpgradeStatus(headers);
        const error = this._mapError(status, headers, payload);
        if (error) {
            return error;
        }
        this._handleAuthIfNeeded(status, headers, payload, request);
        return super.handleResponse(...arguments);
    }

    _setSentryContext(request, status) {
        Sentry.setContext('ajax', {url: request.url, method: request.method, status});
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200));
        Sentry.setTag('ajax_method', request.method);
    }

    _maybeRefreshUpgradeStatus(headers) {
        if (headers['content-version']) {
            const contentVersion = semverCoerce(headers['content-version']);
            const appVersion = semverCoerce(config.APP.version);
            if (semverLt(appVersion, contentVersion) && !this.feature.inAdminForward) {
                this.upgradeStatus.refreshRequired = true;
            }
        }
    }

    _mapError(status, headers, payload) {
        const mapping = [
            {check: this.isTwoFactorTokenRequiredError, ctor: TwoFactorTokenRequiredError},
            {check: this.isVersionMismatchError, ctor: VersionMismatchError},
            {check: this.isServerUnreachableError, ctor: ServerUnreachableError},
            {check: this.isRequestEntityTooLargeError, ctor: RequestEntityTooLargeError},
            {check: this.isUnsupportedMediaTypeError, ctor: UnsupportedMediaTypeError},
            {check: this.isMaintenanceError, ctor: MaintenanceError},
            {check: this.isThemeValidationError, ctor: ThemeValidationError},
            {check: this.isHostLimitError, ctor: HostLimitError},
            {check: this.isEmailError, ctor: EmailError},
            {check: this.isAcceptedResponse, ctor: AcceptedResponse}
        ];

        for (const {check, ctor} of mapping) {
            if (check.call(this, status, headers, payload)) {
                return ctor === AcceptedResponse ? new AcceptedResponse(payload) : new ctor(payload);
            }
        }
        return null;
    }

    _handleAuthIfNeeded(status, headers, payload, request) {
        const isGhost = GHOST_REQUEST.test(request.url);
        const isAuth = this.get('session.isAuthenticated');
        const isUnauth = this.isUnauthorizedError(status, headers, payload);
        const isForbid = isForbiddenError(status, headers, payload);

        if (isGhost) {
            this._responseServer = headers.server;
        }

        if (isAuth && isGhost && (isUnauth || (isForbid && payload.errors?.[0].message === 'Authorization failed'))) {
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
                payload.errors = errors.map(err => (typeof err === 'string' ? {message: err} : err));
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