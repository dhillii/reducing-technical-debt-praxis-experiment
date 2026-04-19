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

function isJSONContentType(header: string | null | undefined): boolean {
    if (!header || isNone(header)) {
        return false;
    }
    return header.indexOf(JSON_CONTENT_TYPE) === 0;
}

function getJSONPayload(payload: unknown): unknown {
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch {
            // do nothing
        }
    }
    return payload;
}

function getErrorCode(errorOrStatus: unknown): string | null {
    if (isAjaxError(errorOrStatus) && errorOrStatus.payload && errorOrStatus.payload.errors && Array.isArray(errorOrStatus.payload.errors) && errorOrStatus.payload.errors.length > 0) {
        return errorOrStatus.payload.errors[0].code || null;
    }
    return null;
}

/* Version mismatch error */

export class VersionMismatchError extends AjaxError {
    constructor(payload: unknown) {
        super(payload, 'API server is running a newer version of Ghost, please upgrade.');
    }
}

export function isVersionMismatchError(errorOrStatus: unknown, payload: unknown): boolean {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof VersionMismatchError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'VersionMismatchError';
    }
}

/* DataImport error */

export class DataImportError extends AjaxError {
    constructor(payload: unknown) {
        super(payload, 'The server encountered an error whilst importing data.');
    }
}

export function isDataImportError(errorOrStatus: unknown, payload: unknown): boolean {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof DataImportError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'DataImportError';
    }
}

/* Server unreachable error */

export class ServerUnreachableError extends AjaxError {
    constructor(payload: unknown) {
        super(payload, 'Server was unreachable');
    }
}

export function isServerUnreachableError(error: unknown): boolean {
    if (isAjaxError(error)) {
        return error instanceof ServerUnreachableError;
    } else {
        return error === 0 || error === '0';
    }
}

/* Request entity too large error */

export class RequestEntityTooLargeError extends AjaxError {
    constructor(payload: unknown) {
        super(payload, 'Request is larger than the maximum file size the server allows');
    }
}

export function isRequestEntityTooLargeError(errorOrStatus: unknown): boolean {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof RequestEntityTooLargeError;
    } else {
        return errorOrStatus === 413;
    }
}

/* Unsupported media type error */

export class UnsupportedMediaTypeError extends AjaxError {
    constructor(payload: unknown) {
        super(payload, 'Request contains an unknown or unsupported file type.');
    }
}

export function isUnsupportedMediaTypeError(errorOrStatus: unknown): boolean {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof UnsupportedMediaTypeError;
    } else {
        return errorOrStatus === 415;
    }
}

/* Maintenance error */

export class MaintenanceError extends AjaxError {
    constructor(payload: unknown) {
        super(payload, 'Ghost is currently undergoing maintenance, please wait a moment then retry.');
    }
}

export function isMaintenanceError(errorOrStatus: unknown): boolean {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof MaintenanceError;
    } else {
        return errorOrStatus === 503;
    }
}

/* Theme validation error */

export class ThemeValidationError extends AjaxError {
    constructor(payload: unknown) {
        super(payload, 'Theme is not compatible or contains errors.');
    }
}

export function isThemeValidationError(errorOrStatus: unknown, payload: unknown): boolean {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof ThemeValidationError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'ThemeValidationError';
    }
}

/* Host limit reached/exceeded error */

export class HostLimitError extends AjaxError {
    constructor(payload: unknown) {
        super(payload, 'A hosting plan limit was reached or exceeded.');
    }
}

export function isHostLimitError(errorOrStatus: unknown, payload: unknown): boolean {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof HostLimitError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'HostLimitError';
    }
}

/* Email error */

export class EmailError extends AjaxError {
    constructor(payload: unknown) {
        super(payload, 'Please verify your email settings');
    }
}

export function isEmailError(errorOrStatus: unknown, payload: unknown): boolean {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof EmailError;
    } else {
        return get(payload || {}, 'errors.firstObject.type') === 'EmailError';
    }
}

/* 2FA required error */

export class TwoFactorTokenRequiredError extends AjaxError {
    constructor(payload: unknown) {
        payload = getJSONPayload(payload);
        super(payload, '2nd factor verification is required to sign in.');
    }
}

const twoFactorAuthCodes = ['2FA_TOKEN_REQUIRED', '2FA_NEW_DEVICE_DETECTED'];

export function isTwoFactorTokenRequiredError(errorOrStatus: unknown, payload: unknown): boolean {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus instanceof TwoFactorTokenRequiredError || twoFactorAuthCodes.includes(getErrorCode(errorOrStatus));
    } else {
        payload = getJSONPayload(payload);
        return twoFactorAuthCodes.includes(get(payload || {}, 'errors.firstObject.code'));
    }
}

export class AcceptedResponse {
    constructor(data: unknown) {
        this.data = data;
    }
}

export function isAcceptedResponse(errorOrStatus: unknown): boolean {
    return errorOrStatus === 202;
}

/* Error type registry for centralized error checking */

interface ErrorCheckFunction {
    (status: number, headers: Record<string, string>, payload: unknown): boolean;
}

const errorCheckRegistry: Record<string, ErrorCheckFunction> = {
    twoFactorTokenRequired: isTwoFactorTokenRequiredError,
    versionMismatch: isVersionMismatchError,
    serverUnreachable: isServerUnreachableError,
    requestEntityTooLarge: isRequestEntityTooLargeError,
    unsupportedMediaType: isUnsupportedMediaTypeError,
    maintenance: isMaintenanceError,
    themeValidation: isThemeValidationError,
    hostLimit: isHostLimitError,
    email: isEmailError,
    acceptedResponse: isAcceptedResponse,
};

function checkErrorType(errorType: string, status: number, headers: Record<string, string>, payload: unknown): boolean {
    const checkFunction = errorCheckRegistry[errorType];
    return checkFunction ? checkFunction(status, headers, payload) : false;
}

function getErrorTypeName(errorOrStatus: unknown): string | null {
    if (isAjaxError(errorOrStatus)) {
        return errorOrStatus.constructor.name;
    }
    return null;
}

function getErrorData(errorName: string | null, attempts: number, startTime: Date, responseServer?: string): Record<string, unknown> {
    const data = {
        errorName,
        attempts,
        totalSeconds: moment().diff(moment(startTime), 'seconds'),
    };
    if (responseServer) {
        data.server = responseServer;
    }
    return data;
}

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

    get headers(): Record<string, string> {
        const headers = {
            'App-Pragma': 'no-cache',
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

    init(...args: unknown[]) {
        super.init(...args);
        if (this.isTesting === undefined) {
            this.isTesting = config.environment === 'test';
        }
    }

    async _makeRequest(hash: unknown) {
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
        let errorName: string | null = null;
        let attempts = 0;
        let startTime = new Date();
        let retryingMs = 0;
        const maxRetryingMs = 15_000;
        const retryPeriods = [500, 1000];
        const retryErrorChecks = [this.isServerUnreachableError, this.isMaintenanceError];

        const _responseServer: string | undefined = undefined;

        const getErrorData = () => getErrorData(errorName, attempts, startTime, _responseServer);

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
                errorName = getErrorTypeName(error);
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

    handleResponse(status: number, headers: Record<string, string>, payload: unknown, request: unknown) {
        // set some context variables for Sentry in case there is an error
        Sentry.setContext('ajax', {
            url: request.url,
            method: request.method,
            status,
        });
        Sentry.setTag('ajax_status', status);
        Sentry.setTag('ajax_url', request.url.slice(0, 200)); // the max length of a tag value is 200 characters
        Sentry.setTag('ajax_method', request.method);

        // Check for specific error types in order of priority
        const errorChecks = [
            {type: 'twoFactorTokenRequired', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('twoFactorTokenRequired', s, h, p)},
            {type: 'versionMismatch', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('versionMismatch', s, h, p)},
            {type: 'serverUnreachable', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('serverUnreachable', s, h, p)},
            {type: 'requestEntityTooLarge', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('requestEntityTooLarge', s, h, p)},
            {type: 'unsupportedMediaType', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('unsupportedMediaType', s, h, p)},
            {type: 'maintenance', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('maintenance', s, h, p)},
            {type: 'themeValidation', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('themeValidation', s, h, p)},
            {type: 'hostLimit', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('hostLimit', s, h, p)},
            {type: 'email', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('email', s, h, p)},
            {type: 'acceptedResponse', check: (s: number, h: Record<string, string>, p: unknown) => checkErrorType('acceptedResponse', s, h, p)},
        ];

        for (const {check} of errorChecks) {
            if (check(status, headers, payload)) {
                return new ErrorClass(payload);
            }
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

    normalizeErrorResponse(status: number, headers: Record<string, string>, payload: unknown) {
        if (payload && typeof payload === 'object') {
            let errors = payload.error || payload.errors || payload.message || undefined;

            if (errors) {
                if (!isEmberArray(errors)) {
                    errors = [errors];
                }

                payload.errors = errors.map(function (error: unknown) {
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

    isTwoFactorTokenRequiredError(status: number, headers: Record<string, string>, payload: unknown) {
        return checkErrorType('twoFactorTokenRequired', status, headers, payload);
    }

    isVersionMismatchError(status: number, headers: Record<string, string>, payload: unknown) {
        return checkErrorType('versionMismatch', status, headers, payload);
    }

    isServerUnreachableError(status: number) {
        return isServerUnreachableError(status);
    }

    isRequestEntityTooLargeError(status: number) {
        return isRequestEntityTooLargeError(status);
    }

    isUnsupportedMediaTypeError(status: number) {
        return isUnsupportedMediaTypeError(status);
    }

    isDataImportError(status: number) {
        return isDataImportError(status, payload);
    }

    isMaintenanceError(status: number, headers: Record<string, string>, payload: unknown) {
        return checkErrorType('maintenance', status, headers, payload);
    }

    isThemeValidationError(status: number, headers: Record<string, string>, payload: unknown) {
        return checkErrorType('themeValidation', status, headers, payload);
    }

    isHostLimitError(status: number, headers: Record<string, string>, payload: unknown) {
        return checkErrorType('hostLimit', status, headers, payload);
    }

    isEmailError(status: number, headers: Record<string, string>, payload: unknown) {
        return checkErrorType('email', status, headers, payload);
    }

    isAcceptedResponse(status: number) {
        return checkErrorType('acceptedResponse', status, {}, {});
    }
}

function ErrorClass(payload: unknown) {
    const errorType = getErrorTypeName(payload);
    const errorMessages: Record<string, string> = {
        twoFactorTokenRequired: '2nd factor verification is required to sign in.',
        versionMismatch: 'API server is running a newer version of Ghost, please upgrade.',
        serverUnreachable: 'Server was unreachable',
        requestEntityTooLarge: 'Request is larger than the maximum file size the server allows',
        unsupportedMediaType: 'Request contains an unknown or unsupported file type.',
        maintenance: 'Ghost is currently undergoing maintenance, please wait a moment then retry.',
        themeValidation: 'Theme is not compatible or contains errors.',
        hostLimit: 'A hosting plan limit was reached or exceeded.',
        email: 'Please verify your email settings',
    };

    const message = errorMessages[errorType] || 'An error occurred';
    return new AjaxError(payload, message);
}

// we need to reopen so that internal methods use the correct contentType
ajaxService.reopen({
    contentType: 'application/json; charset=UTF-8',
});

export default ajaxService;
```