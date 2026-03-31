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

// ─── Utilities ───────────────────────────────────────────────────────────────

function isJSONContentType(header) {
    return !isNone(header) && header.indexOf(JSON_CONTENT_TYPE) === 0;
}

function getJSONPayload(payload) {
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
    const errors = isAjaxError(errorOrStatus) && errorOrStatus.payload?.errors;
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

function isInstanceOrStatus(ErrorClass, statusCode) {
    return function isError(errorOrStatus) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : errorOrStatus === statusCode;
    };
}

function isInstanceOrPayloadType(ErrorClass, payloadType) {
    return function isError(errorOrStatus, payload) {
        return isAjaxError(errorOrStatus)
            ? errorOrStatus instanceof ErrorClass
            : get(payload || {}, 'errors.firstObject.type') === payloadType;
    };
}

// ─── Error classes ────────────────────────────────────────────────────────────

export const VersionMismatchError = createAjaxError(
    'API server is running a newer version of Ghost, please upgrade.'
);

export const DataImportError = createAjaxError(
    'The server encountered an error whilst importing data.'
);

export const ServerUnreachableError = createAjaxError('Server was unreachable');

export const RequestEntityTooLargeError = createAjaxError(
    'Request is larger than the maximum file size the server allows'
);

export const UnsupportedMediaTypeError = createAjaxError(
    'Request contains an unknown or unsupported file type.'
);

export const MaintenanceError = createAjaxError(
    'Ghost is currently undergoing maintenance, please wait a moment then retry.'
);

export const ThemeValidationError = createAjaxError(
    'Theme is not compatible or contains errors.'
);

export const HostLimitError = createAjaxError(
    'A hosting plan limit was reached or exceeded.'
);

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

// ─── Error predicates ─────────────────────────────────────────────────────────

export const isVersionMismatchError = isInstanceOrPayloadType(VersionMismatchError, 'VersionMismatchError');
export const isDataImportError = isInstanceOrPayloadType(DataImportError, 'DataImportError');
export const isThemeValidationError = isInstanceOrPayloadType(ThemeValidationError, 'ThemeValidationError');
export const isHostLimitError = isInstanceOrPayloadType(HostLimitError, 'HostLimitError');
export const isEmailError = isInstanceOrPayloadType(EmailError, 'EmailError');

export const isRequestEntityTooLargeError = isInstanceOrStatus(RequestEntityTooLargeError, 413);
export const isUnsupportedMediaTypeError = isInstanceOrStatus(UnsupportedMediaTypeError, 415);
export const isMaintenanceError = isInstanceOrStatus(MaintenanceError, 503);

export function isServerUnreachableError(error) {
    return isAjaxError(error)
        ? error instanceof ServerUnreachableError
        : error === 0 || error === '0';
}

export function isAcceptedResponse(errorOrStatus) {
    return errorOrStatus === 202;
}

const TWO_FACTOR_CODES = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

export function isTwoFactorTokenRequiredError(errorOrStatus, payload) {
    if (isAjaxError(errorOrStatus)) {
        return (
            errorOrStatus instanceof TwoFactorTokenRequiredError ||
            TWO_FACTOR_CODES.includes(getErrorCode(errorOrStatus))
        );
    }
    return TWO_FACTOR_CODES.includes(get(getJSONPayload(payload) || {}, 'errors.firstObject.code'));
}

// ─── Response error map ───────────────────────────────────────────────────────

const ERROR_RESPONSE_MAP = [
    [(s, _h, p) => isTwoFactorTokenRequiredError(s, p), p => new TwoFactorTokenRequiredError(p)],
    [(s, _h, p) => isVersionMismatchError(s, p),        p => new VersionMismatchError(p)],
    [(s)        => isServerUnreachableError(s),          p => new ServerUnreachableError(p)],
    [(s)        => isRequestEntityTooLargeError(s),      p => new RequestEntityTooLargeError(p)],
    [(s)        => isUnsupportedMediaTypeError(s),       p => new UnsupportedMediaTypeError(p)],
    [(s)        => isMaintenanceError(s),                p => new MaintenanceError(p)],
    [(s, _h, p) => isThemeValidationError(s, p),        p => new ThemeValidationError(p)],
    [(s, _h, p) => isHostLimitError(s, p),              p => new HostLimitError(p)],
    [(s, _h, p) => isEmailError(s, p),                  p => new EmailError(p)],
    [(s)        => isAcceptedResponse(s),                p => new AcceptedResponse(p)],
];

// ─── Service ──────────────────────────────────────────────────────────────────

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

        // Omit the version header when running in forward admin to avoid issues
        // with the server triggering a version mismatch error.
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

    // ─── Request handling ───────────────────────────────────────────────────

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
        const retryChecks = [isServerUnreachableError, isMaintenanceError];

        let attempts = 0;
        let errorName = null;

        const getErrorData = () => ({
            errorName,
            attempts,
            totalSeconds: moment().diff(moment(startTime), 'seconds'),
            ...(this._responseServer && {server: this._responseServer})
        });

        const elapsedMs = () => (new Date()) - startTime;

        while (elapsedMs() <= MAX_RETRY_MS) {
            try {
                const result = await makeRequest(hash);

                if (attempts > 0 && this.config.sentry_dsn) {
                    Sentry.captureMessage('Request took multiple attempts', {extra: getErrorData()});
                }

                return result;
            } catch (error) {
                errorName = error.response?.constructor?.name;

                if (this.isTesting) {
                    throw error;
                }

                const shouldRetry = retryChecks.some(check => check(error.response)) && elapsedMs() <= MAX_RETRY_MS;

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

    // ─── Response handling ──────────────────────────────────────────────────

    handleResponse(status, headers, payload, request) {
        this._setSentryContext(status, request);
        this._checkVersionMismatch(headers);

        const mappedError = this._mapToKnownError(status, headers, payload);
        if (mappedError) {
            return mappedError;
        }

        const isGhostRequest = GHOST_REQUEST.test(request.url);

        if (isGhostRequest) {
            this._responseServer = headers.server;
        }

        this._handleUnauthorized(status, headers, payload, isGhostRequest);

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

    _mapToKnownError(status, headers, payload) {
        for (const [predicate, factory] of ERROR_RESPONSE_MAP) {
            if (predicate(status, headers, payload)) {
                return factory(payload);
            }
        }
        return null;
    }

    _handleUnauthorized(status, headers, payload, isGhostRequest) {
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

    // ─── Delegating instance methods (used by ember-ajax internally) ─────────

    isTwoFactorTokenRequiredError(status, _headers, payload) { return isTwoFactorTokenRequiredError(status, payload); }
    isVersionMismatchError(status, _headers, payload)        { return isVersionMismatchError(status, payload); }
    isServerUnreachableError(status)                         { return isServerUnreachableError(status); }
    isRequestEntityTooLargeError(status)                     { return isRequestEntityTooLargeError(status); }
    isUnsupportedMediaTypeError(status)                      { return isUnsupportedMediaTypeError(status); }
    isDataImportError(status)                                { return isDataImportError(status); }
    isMaintenanceError(status)                               { return isMaintenanceError(status); }
    isThemeValidationError(status, _headers, payload)        { return isThemeValidationError(status, payload); }
    isHostLimitError(status, _headers, payload)              { return isHostLimitError(status, payload); }
    isEmailError(status, _headers, payload)                  { return isEmailError(status, payload); }
    isAcceptedResponse(status)                               { return isAcceptedResponse(status); }
}

ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8'
});

export default ajaxService;
```