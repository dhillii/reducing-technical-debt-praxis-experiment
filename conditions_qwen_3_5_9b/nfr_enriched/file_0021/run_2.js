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

    function handleResponse(res, successMessage) {
        if (res.ok) {
            return res.json();
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(successMessage || 'Request failed');
        }
    }

    function handleTextResponse(res, successMessage) {
        if (res.ok) {
            return res.text();
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(successMessage || 'Request failed');
        }
    }

    function handleJsonResponse(res, successMessage) {
        if (res.ok) {
            return res.json();
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(successMessage || 'Request failed');
        }
    }

    function handleOptionalJsonResponse(res, successMessage) {
        if (res.ok) {
            return res.json();
        } else {
            return null;
        }
    }

    function handleOptionalTextResponse(res, successMessage) {
        if (res.ok) {
            return res.text();
        } else {
            return null;
        }
    }

    function handleOptionalTextOrJsonResponse(res, successMessage) {
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
            throw new Error(successMessage || 'Request failed');
        }
    }

    function handleOptionalTextOrJsonResponseWithError(res, successMessage) {
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
            throw new Error(successMessage || 'Request failed');
        }
    }

    function handleOptionalTextResponseWithError(res, successMessage) {
        if (res.ok) {
            return res.text();
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(successMessage || 'Request failed');
        }
    }

    function handleOptionalJsonResponseWithError(res, successMessage) {
        if (res.ok) {
            return res.json();
        } else {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error(successMessage || 'Request failed');
        }
    }

    function handleOptionalJsonResponseWithFallback(res, successMessage) {
        if (res.ok) {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
        return 'Success';
    }

    function handleOptionalJsonResponseWithFallbackAndRedirect(res, successMessage) {
        if (res.ok) {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
        return res.json();
    }

    function handleOptionalJsonResponseWithRedirect(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatch(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw new Error(errMssg);
        }
    }

    function handleOptionalJsonResponseWithRedirectAndCatchAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallbackAndFallback(res, successMessage) {
        if (res.ok) {
            const responseBody = res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        } else {
            const errData = res.json();
            const errMssg = errData?.errors?.[0]?.message || successMessage;
            throw