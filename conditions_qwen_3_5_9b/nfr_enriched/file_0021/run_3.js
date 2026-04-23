import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    function endpointFor({type, resource}) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
        return '';
    }

    function contentEndpointFor({resource, params = {}}) {
        if (apiUrl && apiKey) {
            const searchParams = new URLSearchParams({
                ...params,
                key: apiKey
            });
            return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
        }
        return '';
    }

    function makeRequest({url, method = 'GET', headers = {}, credentials = undefined, body = undefined}) {
        const options = {
            method,
            headers,
            credentials,
            body
        };
        return fetch(url, options);
    }

    function handleResponse(res, successMessage, errorMessage) {
        if (res.ok) {
            return res.json();
        } else {
            throw new Error(errorMessage || 'Request failed');
        }
    }

    function handleTextResponse(res, errorMessage) {
        if (res.ok) {
            return res.text();
        } else {
            throw new Error(errorMessage || 'Request failed');
        }
    }

    function handleOptionalResponse(res, errorMessage) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    }

    function handleOptionalTextResponse(res, errorMessage) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.text();
    }

    function handleOptionalJsonResponse(res, errorMessage) {
        if (!res.ok) {
            return null;
        }
        return res.json();
    }

    function handleOptionalTextOrJsonResponse(res, errorMessage) {
        if (!res.ok) {
            return null;
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalError(res, errorMessage) {
        if (!res.ok) {
            throw new Error(errorMessage || 'Request failed');
        }
        return res.json();
    }

    function handleOptionalErrorWithFallback(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        return res.json();
    }

    function handleOptionalErrorWithFallbackText(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        return res.text();
    }

    function handleOptionalErrorWithFallbackJson(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        return res.json();
    }

    function handleOptionalErrorWithFallbackJsonOrText(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmpty(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNull(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrow(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatch(res, errorMessage) {
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage || 'Request failed');
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                // fall through to response used pre-OTC
            }
        }
        return {};
    }

    function handleOptionalErrorWithFallbackJsonOrTextOrEmptyOrNullOrCatchOrThrowOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOrCatchOr