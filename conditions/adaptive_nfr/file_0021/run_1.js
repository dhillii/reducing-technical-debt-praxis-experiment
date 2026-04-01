```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    /**
     * Constructs endpoint URL for members API
     * @param {string} resource - The resource path
     * @returns {string} The full endpoint URL
     */
    function endpointFor(resource) {
        return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
    }

    /**
     * Constructs content endpoint URL with API key
     * @param {string} resource - The resource path
     * @param {Object} params - Query parameters
     * @returns {string} The full content endpoint URL
     */
    function contentEndpointFor(resource, params = {}) {
        if (apiUrl && apiKey) {
            const searchParams = new URLSearchParams({
                ...params,
                key: apiKey
            });
            return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
        }
        return '';
    }

    /**
     * Makes an HTTP request
     * @param {Object} config - Request configuration
     * @returns {Promise<Response>} Fetch response promise
     */
    function makeRequest({url, method = 'GET', headers = {}, credentials = undefined, body = undefined}) {
        const options = {
            method,
            headers,
            credentials,
            body
        };
        return fetch(url, options);
    }

    /**
     * Handles successful JSON response
     * @param {Response} res - Fetch response
     * @param {string} errorMessage - Error message if response not ok
     * @returns {Promise<Object>} Parsed JSON response
     */
    async function handleJsonResponse(res, errorMessage) {
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    }

    /**
     * Handles response that may be null on 204 or error
     * @param {Response} res - Fetch response
     * @param {Function} parser - Function to parse response body
     * @returns {Promise<any>} Parsed response or null
     */
    async function handleOptionalResponse(res, parser) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return parser(res);
    }

    /**
     * Handles error response with human-readable error fallback
     * @param {Response} res - Fetch response
     * @param {string} fallbackMessage - Fallback error message
     * @returns {Promise<Error>} Error to throw
     */
    async function handleErrorResponse(res, fallbackMessage) {
        const humanError = await HumanReadableError.fromApiResponse(res);
        if (humanError) {
            return humanError;
        }
        return new Error(fallbackMessage);
    }

    const api = {};

    // Site API endpoints
    const siteEndpoints = {
        read: {
            resource: 'site',
            errorMessage: 'Failed to fetch site data'
        },
        newsletters: {
            resource: 'newsletters',
            params: {limit: 100},
            errorMessage: 'Failed to fetch site data'
        },
        tiers: {
            resource: 'tiers',
            params: {limit: 100, include: 'monthly_price,yearly_price,benefits'},
            errorMessage: 'Failed to fetch site data'
        },
        settings: {
            resource: 'settings',
            errorMessage: 'Failed to fetch site data'
        }
    };

    /**
     * Creates a site API method
     * @param {string} resource - Resource path
     * @param {Object} params - Query parameters
     * @param {string} errorMessage - Error message
     * @returns {Function} API method
     */
    function createSiteMethod(resource, params = {}, errorMessage) {
        return function() {
            const url = resource.startsWith('http') ? resource : contentEndpointFor(resource, params);
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(res => handleJsonResponse(res, errorMessage));
        };
    }

    api.site = {
        read() {
            const url = endpointFor('site');
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        newsletters: createSiteMethod('newsletters', {limit: 100}, 'Failed to fetch site data'),
        tiers: createSiteMethod('tiers', {limit: 100, include: 'monthly_price,yearly_price,benefits'}, 'Failed to fetch site data'),
        settings: createSiteMethod('settings', {}, 'Failed to fetch site data'),

        offer({offerId}) {
            const url = contentEndpointFor(`offers/${offerId}`);
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(res => handleJsonResponse(res, 'Failed to fetch offer data'));
        },

        recommendations({limit = 100} = {limit: 100}) {
            const url = contentEndpointFor('recommendations', {limit});
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(res => handleJsonResponse(res, 'Failed to fetch recommendations'));
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor('feedback');
            if (uuid && key) {
                url = url + `?uuid=${uuid}&key=${key}`;
            }
            const body = {
                feedback: [
                    {
                        post_id: postId,
                        score
                    }
                ]
            };
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            throw (await handleErrorResponse(res, 'Failed to save feedback'));
        }
    };

    api.recommendations = {
        trackClicked({recommendationId}) {
            const url = endpointFor(`recommendations/${recommendationId}/clicked`);
            navigator.sendBeacon(url);
        },

        trackSubscribed({recommendationId}) {
            const url = endpointFor(`recommendations/${recommendationId}/subscribed`);
            navigator.sendBeacon(url);
        }
    };

    api.member = {
        identity() {
            const url = endpointFor('session');
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(res => handleOptionalResponse(res, r => r.text()));
        },

        sessionData() {
            const url = endpointFor('member');
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(res => handleOptionalResponse(res, r => r.json()));
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor('member');
            const body = {
                name,
                subscribed,
                newsletters
            };
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }).then(function (res) {
                if (!res.ok) {
                    return null;
                }
                return res.json();
            });
        },

        deleteSuppression() {
            const url = endpointFor('member/suppression');

            return makeRequest({
                url,
                method: 'DELETE'
            }).then(function (res) {
                if (!res.ok) {
                    throw new Error('Your email has failed to resubscribe, please try again');
                }
                return true;
            });
        },

        async getIntegrityToken() {
            const url = endpointFor('integrity-token');
            const res = await makeRequest({
                url,
                method: 'GET'
            });

            if (res.ok) {
                return res.text();
            }
            throw (await handleErrorResponse(res, 'Failed to start a members session'));
        },

        /**
         * @returns {{
         *     inboxLinks?: {
         *         desktop: string;
         *         android: string;
         *         provider: 'gmail' | 'yahoo' | 'outlook' | 'proton' | 'icloud' | 'hey' | 'aol' | 'mailru';
         *     };
         *     otc_ref?: string;
         * }}
         */
        async sendMagicLink({email, emailType, labels, name, oldEmail, newsletters, redirect, integrityToken, phonenumber, customUrlHistory, token, autoRedirect = true, includeOTC}) {
            const url = endpointFor('send-magic-link');
            const body = {
                name,
                email,
                newsletters,
                oldEmail,
                emailType,
                labels,
                requestSrc: 'portal',
                redirect,
                integrityToken,
                honeypot: phonenumber,
                token,
                autoRedirect,
                includeOTC
            };
            const urlHistory = customUrlHistory ?? getUrlHistory();
            if (urlHistory) {
                body.urlHistory = urlHistory;
            }

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const contentType = (res.headers.get('content-type') || '').toLowerCase();
                if (contentType.includes('application/json')) {
                    try {
                        return await res.json();
                    } catch (e) {
                        // fall through to response used pre-OTC
                    }
                }
                return {};
            }
            throw (await handleErrorResponse(res, 'Failed to send magic link email'));
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = endpointFor('verify-otc');
            const body = {
                otc,
                otcRef,
                redirect,
                integrityToken
            };

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                return res.json();
            }
            throw (await handleErrorResponse(res, 'Failed to verify code'));
        },

        signout(all = false) {
            const url = endpointFor('session');
            return makeRequest({
                url,
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    all
                })
            }).then(function (res) {
                if (res.ok) {
                    window.location.replace(siteUrl);
                    return 'Success';
                }
                throw new Error('Failed to signout');
            });
        },

        async newsletters({uuid, key}) {
            let url = endpointFor('member/newsletters');
            url = url + `?uuid=${uuid}&key=${key}`;
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(res => handleOptionalResponse(res, r => r.json()));
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            let url = endpointFor('member/newsletters');
            url = url + `?uuid=${uuid}&key=${key}`;
            const body = {
                newsletters
            };

            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(res => handleJsonResponse(res, 'Failed to update email preferences'));
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor('member/email');
            const body = {
                email,
                identity
            };

            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(async function (res) {
                if (res.ok) {
                    return 'Success';
                }
                const errData = await res.json();
                const errMssg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
                throw new Error(errMssg);
            });
        },

        async checkoutPlan({plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {}} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = endpointFor('create-stripe-checkout-session');

            if (!cancelUrl) {
                const checkoutCancelUrl = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
                checkoutCancelUrl.searchParams.set('stripe', 'cancel');
                cancelUrl = checkoutCancelUrl.href;
            }
            const metadataObj = {
                name,
                newsletters: JSON.stringify(newsletters),
                requestSrc: 'portal',
                fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
                urlHistory: getUrlHistory(),
                ...metadata
            };

            const body = {
                priceId: offerId ? null : plan,
                offerId,
                identity: identity,
                metadata: metadataObj,
                successUrl,
                cancelUrl
            };

            if (customerEmail) {
                body.customerEmail = customerEmail;
            }

            if (tierId && cadence) {
                delete body.priceId;
                body.tierId = offerId ? null : tierId;
                body.cadence = offerId ? null : cadence;
            }
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(async function (res) {
                if (!res.ok) {
                    const errData = await res.json();
                    const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                    throw new Error(errMssg);
                }
                return res.json();
            }).then(function (responseBody) {
                if (responseBody.url) {
                    return window.location.assign(responseBody.url);
                }
                const stripe = window.Stripe(responseBody.publicKey);
                return stripe.redirectToCheckout({
                    sessionId: responseBody.sessionId
                }).then(function (redirectResult) {
                    if (redirectResult.error) {
                        throw new Error(redirectResult.error.message);