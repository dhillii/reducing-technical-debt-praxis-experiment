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

/* Utility helpers -------------------------------------------------------- */

function isJSONContentType(header) {
    return header && !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0;
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

/* Error classes ----------------------------------------------------------- */

export class VersionMismatchError extends AjaxError {
    constructor(payload) {
        super(payload, 'API server is running a newer version of Ghost, please upgrade.');
    }
}
export function isVersionMismatchError(errorOrStatus, payload) {
    return isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof VersionMismatchError
        : get(payload || {}, 'errors.firstObject.type') === 'VersionMismatchError';
}

export class DataImportError extends AjaxError {
    constructor(payload) {
        super(payload, 'The server encountered an error whilst importing data.');
    }
}
export function isDataImportError(errorOrStatus, payload) {
    return isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof DataImportError
        : get(payload || {}, 'errors.firstObject.type') === 'DataImportError';
}

export class ServerUnreachableError extends AjaxError {
    constructor(payload) {
        super(payload, 'Server was unreachable');
    }
}
export function isServerUnreachableError(errorOrStatus) {
    return isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof ServerUnreachableError
        : errorOrStatus === 0 || errorOrStatus === '0';
}

export class RequestEntityTooLargeError extends AjaxError {
    constructor(payload) {
        super(payload, 'Request is larger than the maximum file size the server allows');
    }
}
export function isRequestEntityTooLargeError(errorOrStatus) {
    return isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof RequestEntityTooLargeError
        : errorOrStatus === 413;
}

export class UnsupportedMediaTypeError extends AjaxError {
    constructor(payload) {
        super(payload, 'Request contains an unknown or unsupported file type.');
    }
}
export function isUnsupportedMediaTypeError(errorOrStatus) {
    return isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof UnsupportedMediaTypeError
        : errorOrStatus === 415;
}

export function getErrorCode(errorOrStatus) {
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors?.[0]?.code) {
        return errorOrStatus.payload.errors[0].code;
    }
    return null;
}

export class MaintenanceError extends AjaxError {
    constructor(payload) {
        super(payload, 'Ghost is currently undergoing maintenance, please wait a moment then retry.');
    }
}
export function isMaintenanceError(errorOrStatus) {
    return isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof MaintenanceError
        : errorOrStatus === 503;
}

export class ThemeValidationError extends AjaxError {
    constructor(payload) {
        super(payload, 'Theme is not compatible or contains errors.');
    }
}
export function isThemeValidationError(errorOrStatus, payload) {
    return isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof ThemeValidationError
        : get(payload || {}, 'errors.firstObject.type') === 'ThemeValidationError';
}

export class HostLimitError extends AjaxError {
    constructor(payload) {
        super(payload, 'A hosting plan limit was reached or exceeded.');
    }
}
export function isHostLimitError(errorOrStatus, payload) {
    return isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof HostLimitError
        : get(payload || {}, 'errors.firstObject.type') === 'HostLimitError';
}

export class EmailError extends AjaxError {
    constructor(payload) {
        super(payload, 'Please verify your email settings');
    }
}
export function isEmailError(errorOrStatus, payload) {
    return isAjaxError(errorOrStatus)
        ? errorOrStatus instanceof EmailError
        : get(payload || {}, 'errors.firstObject.type') === 'EmailError';
}

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

export class AcceptedResponse {
    constructor(data) {
        this.data = data;
    }
}
export function isAcceptedResponse(status) {
    return status === 202;
}

/* Service ----------------------------------------------------------------- */

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

    /* Request preparation ------------------------------------------------- */

    async _makeRequest(hash) {
        this._prepareRequestPayload(hash);
        this._applyTestingHeaders(hash);
        return this._executeWithRetry(hash);
    }

    _prepareRequestPayload(hash) {
        if (isJSONContentType(hash.contentType) && hash.type !== 'GET' && typeof hash.data === 'object') {
            hash.data = JSON.stringify(hash.data);
        }
        hash.withCredentials = true;
    }

    _applyTestingHeaders(hash) {
        if (this.isTesting) {
            hash.headers['X-Test-User'] = this.session.user?.id;
        }
    }

    async _executeWithRetry(hash) {
        const maxRetryMs = 15000;
        const retryPeriods = [500, 1000];
        const retryChecks = [this.isServerUnreachableError, this.isMaintenanceError];

        let attempts = 0;
        const start = new Date();

        const makeRequest = super._makeRequest.bind(this);

        while (true) {
            try {
                const result = await makeRequest(hash);
                if (attempts && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {extra: this._retryMetrics(attempts, start)});
                }
                return result;
            } catch (error) {
                if (this.isTesting) {
                    throw error;
                }

                const shouldRetry = retryChecks.some(cb => cb(error.response));
                const elapsed = new Date() - start;

                if (shouldRetry && elapsed <= maxRetryMs) {
                    await timeout(retryPeriods[attempts] || retryPeriods[retryPeriods.length - 1]);
                    attempts += 1;
                    continue;
                }

                if (attempts && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request failed after multiple attempts', {extra: this._retryMetrics(attempts, start)});
                }
                throw error;
            }
        }
    }

    _retryMetrics(attempts, start) {
        const data = {
            attempts,
            totalSeconds: moment().diff(moment(start), 'seconds')
        };
        if (this._responseServer) {
            data.server = this._responseServer;
        }
        return data;
    }

    /* Response handling --------------------------------------------------- */

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(request, status);
        this._maybeRefreshUpgradeStatus(headers);
        const errorInstance = this._mapErrorResponse(status, headers, payload);
        if (errorInstance) {
            return errorInstance;
        }

        this._trackResponseServer(headers, request);
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
        const contentVersion = headers['content-version'];
        if (!contentVersion) {
            return;
        }
        const serverVersion = semverCoerce(contentVersion);
        const appVersion = semverCoerce(config.APP.version);
        if (semverLt(appVersion, serverVersion) && !this.feature.inAdminForward) {
            this.upgradeStatus.refreshRequired = true;
        }
    }

    _mapErrorResponse(status, headers, payload) {
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

    _trackResponseServer(headers, request) {
        if (GHOST_REQUEST.test(request.url)) {
            this._responseServer = headers.server;
        }
    }

    _handleAuthIfNeeded(status, headers, payload, request) {
        const isGhost = GHOST_REQUEST.test(request.url);
        const isAuth = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);

        if (isAuth && isGhost && (isUnauthorized || (isForbidden && payload.errors?.[0].message === 'Authorization failed'))) {
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

    /* Delegated error checks ------------------------------------------------ */

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

    isMaintenanceError(status, _headers, payload) {
        return isMaintenanceError(status, payload);
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

/* Reopen to set default content type */
ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;