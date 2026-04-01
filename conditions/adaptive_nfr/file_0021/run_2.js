```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    /**
     * Builds endpoint URL for members API
     * @param {string} resource - The resource path
     * @returns {string} The complete endpoint URL
     */
    function endpointFor(resource) {
        return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
    }

    /**
     * Builds content endpoint URL with query parameters
     * @param {string} resource - The resource path
     * @param {Object} params - Query parameters
     * @returns {string} The complete content endpoint URL
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
     * Handles JSON response with error checking
     * @param {Response} res - Fetch response
     * @param {string} errorMessage - Error message if response not ok
     * @returns {Promise<any>} Parsed JSON or throws error
     */
    async function handleJsonResponse(res, errorMessage) {
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    }

    /**
     * Handles text response with error checking
     * @param {Response} res - Fetch response
     * @returns {Promise<string|null>} Response text or null if not ok/204
     */
    async function handleTextResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.text();
    }

    /**
     * Handles JSON response with null fallback for not ok/204
     * @param {Response} res - Fetch response
     * @returns {Promise<any|null>} Parsed JSON or null if not ok/204
     */
    async function handleJsonResponseWithNull(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    }

    /**
     * Handles response with human-readable error conversion
     * @param {Response} res - Fetch response
     * @param {string} fallbackMessage - Fallback error message
     * @returns {Promise<any>} Parsed JSON or throws error
     */
    async function handleResponseWithHumanError(res, fallbackMessage) {
        if (res.ok) {
            return res.json();
        }
        const humanError = await HumanReadableError.fromApiResponse(res);
        if (humanError) {
            throw humanError;
        }
        throw new Error(fallbackMessage);
    }

    /**
     * Creates a GET request handler for JSON endpoints
     * @param {string} resource - The resource path
     * @param {string} errorMessage - Error message on failure
     * @param {Object} params - Optional query parameters
     * @returns {Function} Handler function
     */
    function createGetHandler(resource, errorMessage, params = {}) {
        return async function() {
            const url = contentEndpointFor(resource, params);
            const res = await makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return handleJsonResponse(res, errorMessage);
        };
    }

    const api = {};

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

        newsletters: createGetHandler('newsletters', 'Failed to fetch site data', {limit: 100}),

        tiers: createGetHandler('tiers', 'Failed to fetch site data', {limit: 100, include: 'monthly_price,yearly_price,benefits'}),

        settings: createGetHandler('settings', 'Failed to fetch site data'),

        async offer({offerId}) {
            const url = contentEndpointFor(`offers/${offerId}`);
            const res = await makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return handleJsonResponse(res, 'Failed to fetch offer data');
        },

        async recommendations({limit = 100} = {limit: 100}) {
            const url = contentEndpointFor('recommendations', {limit});
            const res = await makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return handleJsonResponse(res, 'Failed to fetch recommendations');
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
            return handleResponseWithHumanError(res, 'Failed to save feedback');
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
            }).then(res => handleTextResponse(res));
        },

        sessionData() {
            const url = endpointFor('member');
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(res => handleJsonResponseWithNull(res));
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
            }).then(res => handleJsonResponseWithNull(res));
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
            const humanError = await HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error('Failed to start a members session');
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
            const humanError = await HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error('Failed to send magic link email');
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

            return handleResponseWithHumanError(res, 'Failed to verify code');
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
            const res = await makeRequest({
                url,
                credentials: 'same-origin'
            });
            return handleJsonResponseWithNull(res);
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

            const res = await makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            return handleJsonResponse(res, 'Failed to update email preferences');
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor('member/email');
            const body = {
                email,
                identity
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
                return 'Success';
            }
            const errData = await res.json();
            const errMssg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
            throw new Error(errMssg);
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
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errData = await res.json();
                const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                throw new Error(errMssg);
            }
            const responseBody = await res.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            const redirectResult = await stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            });
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await api.member.identity();
            const url = endpointFor('create-stripe-checkout-session');

            const metadataObj = {
                fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,