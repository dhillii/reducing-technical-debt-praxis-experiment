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

    function handleResponseText(res, errorMessage) {
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

    function handleResponseJson(res, errorMessage) {
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

    function handleResponseWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJson(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackText(res, errorMessage) {
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

    function handleResponseWithFallbackJsonOrText(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrError(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(errorMessage);
        }
    }

    function handleResponseWithFallbackJsonOrTextOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallbackOrErrorWithFallback(res, errorMessage) {
        if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }