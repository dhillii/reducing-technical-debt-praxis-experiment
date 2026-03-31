```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

const API_PATH = 'members/api';
const DEFAULT_HEADERS = {'Content-Type': 'application/json'};
const DEFAULT_LIMIT = 100;

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const normalizedSiteUrl = siteUrl.replace(/\/$/, '');

    // URL builders
    const endpointFor = ({type, resource}) => {
        if (type === 'members') {
            return `${normalizedSiteUrl}/${API_PATH}/${resource}/`;
        }
    };

    const contentEndpointFor = ({resource, params = {}}) => {
        if (!apiUrl || !apiKey) return '';
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
    };

    // Request handler
    const makeRequest = ({url, method = 'GET', headers = {}, credentials, body}) => {
        return fetch(url, {method, headers, credentials, body});
    };

    // Response handlers
    const handleJsonResponse = async (res, errorMessage = 'Request failed') => {
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    };

    const handleTextResponse = async (res) => {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.text();
    };

    const handleJsonOrNullResponse = async (res) => {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    };

    const handleApiError = async (res, defaultMessage) => {
        const humanError = await HumanReadableError.fromApiResponse(res);
        if (humanError) {
            throw humanError;
        }
        throw new Error(defaultMessage);
    };

    // Generic content request
    const contentRequest = async ({resource, params = {}, errorMessage = 'Failed to fetch data'}) => {
        const url = contentEndpointFor({resource, params});
        const res = await makeRequest({url, headers: DEFAULT_HEADERS});
        return handleJsonResponse(res, errorMessage);
    };

    // Generic member endpoint request
    const memberRequest = async ({resource, method = 'GET', body, errorMessage = 'Request failed'}) => {
        const url = endpointFor({type: 'members', resource});
        const res = await makeRequest({
            url,
            method,
            headers: DEFAULT_HEADERS,
            credentials: 'same-origin',
            body: body ? JSON.stringify(body) : undefined
        });
        return handleJsonResponse(res, errorMessage);
    };

    const api = {};

    // Site API
    api.site = {
        read() {
            const url = endpointFor({type: 'members', resource: 'site'});
            return makeRequest({url, headers: DEFAULT_HEADERS}).then(
                res => handleJsonResponse(res, 'Failed to fetch site data')
            );
        },

        newsletters() {
            return contentRequest({
                resource: 'newsletters',
                params: {limit: DEFAULT_LIMIT},
                errorMessage: 'Failed to fetch newsletters'
            });
        },

        tiers() {
            return contentRequest({
                resource: 'tiers',
                params: {limit: DEFAULT_LIMIT, include: 'monthly_price,yearly_price,benefits'},
                errorMessage: 'Failed to fetch tiers'
            });
        },

        settings() {
            return contentRequest({
                resource: 'settings',
                errorMessage: 'Failed to fetch settings'
            });
        },

        offer({offerId}) {
            return contentRequest({
                resource: `offers/${offerId}`,
                errorMessage: 'Failed to fetch offer data'
            });
        },

        recommendations({limit = DEFAULT_LIMIT} = {}) {
            return contentRequest({
                resource: 'recommendations',
                params: {limit},
                errorMessage: 'Failed to fetch recommendations'
            });
        }
    };

    // Feedback API
    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: DEFAULT_HEADERS,
                credentials: 'same-origin',
                body: JSON.stringify({feedback: [{post_id: postId, score}]})
            });

            if (res.ok) {
                return res.json();
            }
            throw (await HumanReadableError.fromApiResponse(res)) ?? new Error('Failed to save feedback');
        }
    };

    // Recommendations tracking API
    api.recommendations = {
        trackClicked({recommendationId}) {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/clicked`});
            navigator.sendBeacon(url);
        },

        trackSubscribed({recommendationId}) {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/subscribed`});
            navigator.sendBeacon(url);
        }
    };

    // Member API
    api.member = {
        identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({url, credentials: 'same-origin'}).then(handleTextResponse);
        },

        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({url, credentials: 'same-origin'}).then(handleJsonOrNullResponse);
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({
                url,
                method: 'PUT',
                headers: DEFAULT_HEADERS,
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }).then(res => res.ok ? res.json() : null);
        },

        deleteSuppression() {
            const url = endpointFor({type: 'members', resource: 'member/suppression'});
            return makeRequest({url, method: 'DELETE'}).then(res => {
                if (!res.ok) {
                    throw new Error('Your email has failed to resubscribe, please try again');
                }
                return true;
            });
        },

        async getIntegrityToken() {
            const url = endpointFor({type: 'members', resource: 'integrity-token'});
            const res = await makeRequest({url, method: 'GET'});

            if (res.ok) {
                return res.text();
            }
            return handleApiError(res, 'Failed to start a members session');
        },

        async sendMagicLink({
            email, emailType, labels, name, oldEmail, newsletters, redirect,
            integrityToken, phonenumber, customUrlHistory, token, autoRedirect = true, includeOTC
        }) {
            const url = endpointFor({type: 'members', resource: 'send-magic-link'});
            const urlHistory = customUrlHistory ?? getUrlHistory();

            const body = {
                name, email, newsletters, oldEmail, emailType, labels,
                requestSrc: 'portal', redirect, integrityToken,
                honeypot: phonenumber, token, autoRedirect, includeOTC
            };

            if (urlHistory) {
                body.urlHistory = urlHistory;
            }

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const contentType = (res.headers.get('content-type') || '').toLowerCase();
                if (contentType.includes('application/json')) {
                    try {
                        return await res.json();
                    } catch (e) {
                        return {};
                    }
                }
                return {};
            }
            return handleApiError(res, 'Failed to send magic link email');
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = endpointFor({type: 'members', resource: 'verify-otc'});
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify({otc, otcRef, redirect, integrityToken})
            });

            if (res.ok) {
                return res.json();
            }
            return handleApiError(res, 'Failed to verify code');
        },

        signout(all = false) {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({
                url,
                method: 'DELETE',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify({all})
            }).then(res => {
                if (res.ok) {
                    window.location.replace(siteUrl);
                    return 'Success';
                }
                throw new Error('Failed to signout');
            });
        },

        async newsletters({uuid, key}) {
            const url = endpointFor({type: 'members', resource: 'member/newsletters'}) + `?uuid=${uuid}&key=${key}`;
            return makeRequest({url, credentials: 'same-origin'}).then(handleJsonOrNullResponse);
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member/newsletters'}) + `?uuid=${uuid}&key=${key}`;
            const body = {newsletters};

            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return makeRequest({
                url,
                method: 'PUT',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(body)
            }).then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to update email preferences')));
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/email'});

            return makeRequest({
                url,
                method: 'POST',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify({email, identity})
            }).then(async res => {
                if (res.ok) {
                    return 'Success';
                }
                const errData = await res.json();
                throw new Error(errData?.errors?.[0]?.message || 'Failed to send email address verification email');
            });
        },

        async checkoutPlan({
            plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail,
            name, offerId, newsletters, metadata = {}
        } = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'});

            if (!cancelUrl) {
                const checkoutCancelUrl = window.location.href.startsWith(siteUrlObj.href)
                    ? new URL(window.location.href)
                    : new URL(siteUrl);
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
                identity,
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
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData?.errors?.[0]?.message || 'Failed to signup, please try again.');
            }

            const responseBody = await res.json();

            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }

            const stripe = window.Stripe(responseBody.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});

            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'});

            const metadataObj = {
                fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
                urlHistory: getUrlHistory(),
                ...metadata
            };

            const body = {
                identity,
                metadata: metadataObj,
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote
            };

            const response = await makeRequest({
                url,
                method: 'POST',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(body)
            });

            const responseJson = await response.json();

            if (!response.ok) {
                const error = responseJson?.errors?.[0];
                throw error || new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-update-session'});

            if (!successUrl) {
                const checkoutSuccessUrl = new URL(siteUrl);
                checkoutSuccessUrl.searchParams.set('stripe', 'billing-update-success');
                successUrl = checkoutSuccessUrl.href;
            }

            if (!cancelUrl) {
                const checkoutCancelUrl = window.location.href.startsWith(siteUrlObj.href)
                    ? new URL(window.location.href)
                    : new URL(siteUrl);
                checkoutCancelUrl.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = checkoutCancelUrl.href;
            }

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify({identity, subscription_id: subscriptionId, successUrl, cancelUrl})
            });

            if (!res.ok) {
                throw new Error('Unable to create stripe checkout session');
            }

            const result = await res.json();
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});