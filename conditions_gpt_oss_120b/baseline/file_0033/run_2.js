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
    return !!header && header.indexOf(JSON_CONTENT_TYPE) === 0;
}

function getJSONPayload(payload) {
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch (_) {}
    }
    return payload;
}

/* ----- Error Classes & Helpers ----- */

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
export function isServerUnreachableError(error) {
    return isAjaxError(error)
        ? error instanceof ServerUnreachableError
        : error === 0 || error === '0';
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
    if (
        isAjaxError(errorOrStatus) &&
        errorOrStatus.payload?.errors?.[0]?.code
    ) {
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
        super(getJSONPayload(payload), '2nd factor verification is required to sign in.');
    }
}
export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    const codes = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];
    if (isAjaxError(errorOrStatus)) {
        return (
            errorOrStatus instanceof TwoFactorTokenRequiredError ||
            codes.includes(getErrorCode(errorOrStatus))
        );
    }
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

/* ----- Service ----- */

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

        const retryConfig = {
            maxMs: 15000,
            periods: [500, 1000],
            checks: [this.isServerUnreachableError, this.isMaintenanceError]
        };

        let attempts = 0;
        const start = new Date();

        const makeRequest = super._makeRequest.bind(this);

        while (true) {
            try {
                const result = await makeRequest(hash);
                if (attempts && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {
                        extra: this._buildRetryInfo(attempts, start)
                    });
                }
                return result;
            } catch (error) {
                if (this.isTesting) {
                    throw error;
                }

                const elapsed = new Date() - start;
                const shouldRetry = retryConfig.checks.some(check => check(error.response)) && elapsed <= retryConfig.maxMs;

                if (shouldRetry) {
                    await timeout(retryConfig.periods[attempts] ?? retryConfig.periods.at(-1));
                    attempts += 1;
                    continue;
                }

                if (attempts && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request failed after multiple attempts', {
                        extra: this._buildRetryInfo(attempts, start, error)
                    });
                }
                throw error;
            }
        }
    }

    _buildRetryInfo(attempts, start, error = null) {
        const data = {
            attempts,
            totalSeconds: moment().diff(moment(start), 'seconds')
        };
        if (this._responseServer) {
            data.server = this._responseServer;
        }
        if (error) {
            data.errorName = error.response?.constructor?.name;
        }
        return data;
    }

    handleResponse(status, headers, payload, request) {
        Sentry.setContext('ajax', {url: request.url, method: request.method, status});
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

        const errorMap = [
            {check: isTwoFactorTokenRequiredError, ctor: TwoFactorTokenRequiredError},
            {check: isVersionMismatchError, ctor: VersionMismatchError},
            {check: isServerUnreachableError, ctor: ServerUnreachableError},
            {check: isRequestEntityTooLargeError, ctor: RequestEntityTooLargeError},
            {check: isUnsupportedMediaTypeError, ctor: UnsupportedMediaTypeError},
            {check: isMaintenanceError, ctor: MaintenanceError},
            {check: isThemeValidationError, ctor: ThemeValidationError},
            {check: isHostLimitError, ctor: HostLimitError},
            {check: isEmailError, ctor: EmailError},
            {check: isAcceptedResponse, ctor: AcceptedResponse}
        ];

        for (const {check, ctor} of errorMap) {
            if (check(status, payload)) {
                return ctor === AcceptedResponse ? new ctor(payload) : new ctor(payload);
            }
        }

        const isGhostRequest = GHOST_REQUEST.test(request.url);
        const isAuthenticated = this.get('session.isAuthenticated');
        const isUnauthorized = this.isUnauthorizedError(status, headers, payload);
        const isForbidden = isForbiddenError(status, headers, payload);

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        if (
            isAuthenticated &&
            isGhostRequest &&
            (isUnauthorized || (isForbidden && payload.errors?.[0].message === 'Authorization failed'))
        ) {
            this.skipSessionDeletion = true;
            this.session.invalidate();
        }

        return super.handleResponse(...arguments);
    }

    normalizeErrorResponse(status, headers, payload) {
        if (payload && typeof payload === 'object') {
            let errors = payload.error ?? payload.errors ?? payload.message;
            if (errors) {
                if (!isEmberArray(errors)) {
                    errors = [errors];
                }
                payload.errors = errors.map(err =>
                    typeof err === 'string' ? {message: err} : err
                );
            }
        }
        return super.normalizeErrorResponse(status, headers, payload);
    }

    /* ----- Proxy methods for external use ----- */

    isTwoFactorTokenRequiredError(status, _, payload) {
        return isTwoFactorTokenRequiredError(status, payload);
    }

    isVersionMismatchError(status, _, payload) {
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

    isMaintenanceError(status, _, payload) {
        return isMaintenanceError(status, payload);
    }

    isThemeValidationError(status, _, payload) {
        return isThemeValidationError(status, payload);
    }

    isHostLimitError(status, _, payload) {
        return isHostLimitError(status, payload);
    }

    isEmailError(status, _, payload) {
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