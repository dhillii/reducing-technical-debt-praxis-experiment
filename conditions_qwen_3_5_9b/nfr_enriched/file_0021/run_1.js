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
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleTextResponse(res, successMessage, errorMessage) {
        if (res.ok) {
            return res.text();
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
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

    function handleJsonResponse(res, errorMessage) {
        if (!res.ok) {
            throw new Error(errorMessage);
        }
        return res.json();
    }

    function handleJsonOrFallback(res, errorMessage) {
        if (!res.ok) {
            throw new Error(errorMessage);
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return res.json();
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    function handleJsonWithFallback(res, errorMessage) {
        if (!res.ok) {
            const errorText = res.text();
            throw new Error(errorText || errorMessage);
        }
        return res.json();
    }

    function handleJsonWithOptionalError(res, errorMessage) {
        if (!res.ok) {
            const errorText = res.text();
            throw new Error(errorText || errorMessage);
        }
        return true;
    }

    function handleJsonWithOptionalErrorAndFallback(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirect(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrow(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatch(res, errorMessage) {
        if (!res.ok) {
            const errorData = res.json();
            const errMssg = errorData?.errors?.[0]?.message || errorMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleJsonWithOptionalErrorAndRedirectAndCatchAndThrowAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAndCatchAnd