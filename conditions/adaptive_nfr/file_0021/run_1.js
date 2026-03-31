```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

const DEFAULT_HEADERS = {'Content-Type': 'application/json'};
const API_PATH = 'members/api';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const normalizeUrl = (url) => url.replace(/\/$/, '');

    const endpointFor = ({type, resource}) => {
        if (type === 'members') {
            return `${normalizeUrl(siteUrl)}/${API_PATH}/${resource}/`;
        }
    };

    const contentEndpointFor = ({resource, params = {}}) => {
        if (!apiUrl || !apiKey) return '';
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${normalizeUrl(apiUrl)}/${resource}/?${searchParams.toString()}`;
    };

    const makeRequest = ({url, method = 'GET', headers = {}, credentials = undefined, body = undefined}) => {
        return fetch(url, {method, headers, credentials, body});
    };

    const handleJsonResponse = async (res, errorMessage = 'Request failed') => {
        if (res.ok) {
            return res.json();
        }
        const humanError = await HumanReadableError.fromApiResponse(res);
        throw humanError ?? new Error(errorMessage);
    };

    const handleTextResponse = async (res, errorMessage = 'Request failed') => {
        if (res.ok) {
            return res.text();
        }
        const humanError = await HumanReadableError.fromApiResponse(res);
        throw humanError ?? new Error(errorMessage);
    };

    const makeGetRequest = (url, errorMessage) => {
        return makeRequest({url, headers: DEFAULT_HEADERS})
            .then(res => handleJsonResponse(res, errorMessage));
    };

    const makePostRequest = (url, body, errorMessage) => {
        return makeRequest({
            url,
            method: 'POST',
            headers: DEFAULT_HEADERS,
            body: JSON.stringify(body)
        }).then(res => handleJsonResponse(res, errorMessage));
    };

    const makePutRequest = (url, body, errorMessage) => {
        return makeRequest({
            url,
            method: 'PUT',
            headers: DEFAULT_HEADERS,
            body: JSON.stringify(body)
        }).then(res => handleJsonResponse(res, errorMessage));
    };

    const api = {};

    api.site = {
        read() {
            const url = endpointFor({type: 'members', resource: 'site'});
            return makeGetRequest(url, 'Failed to fetch site data');
        },

        newsletters() {
            const url = contentEndpointFor({resource: 'newsletters', params: {limit: 100}});
            return makeGetRequest(url, 'Failed to fetch site data');
        },

        tiers() {
            const url = contentEndpointFor({
                resource: 'tiers',
                params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
            });
            return makeGetRequest(url, 'Failed to fetch site data');
        },

        settings() {
            const url = contentEndpointFor({resource: 'settings'});
            return makeGetRequest(url, 'Failed to fetch site data');
        },

        offer({offerId}) {
            const url = contentEndpointFor({resource: `offers/${offerId}`});
            return makeGetRequest(url, 'Failed to fetch offer data');
        },

        recommendations({limit = 100} = {limit: 100}) {
            const url = contentEndpointFor({resource: 'recommendations', params: {limit}});
            return makeGetRequest(url, 'Failed to fetch recommendations');
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url = `${url}?uuid=${uuid}&key=${key}`;
            }
            const body = {feedback: [{post_id: postId, score}]};
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: DEFAULT_HEADERS,
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            throw (await HumanReadableError.fromApiResponse(res)) ?? new Error('Failed to save feedback');
        }
    };

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

    const buildUrlWithParams = (baseUrl, uuid, key) => `${baseUrl}?uuid=${uuid}&key=${key}`;

    const handleOptionalJsonResponse = async (res) => {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    };

    const handleOptionalTextResponse = async (res) => {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.text();
    };

    api.member = {
        identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({url, credentials: 'same-origin'})
                .then(handleOptionalTextResponse);
        },

        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({url, credentials: 'same-origin'})
                .then(handleOptionalJsonResponse);
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
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
            return makeRequest({url, method: 'DELETE'})
                .then(res => {
                    if (!res.ok) {
                        throw new Error('Your email has failed to resubscribe, please try again');
                    }
                    return true;
                });
        },

        async getIntegrityToken() {
            const url = endpointFor({type: 'members', resource: 'integrity-token'});
            const res = await makeRequest({url, method: 'GET'});
            return handleTextResponse(res, 'Failed to start a members session');
        },

        async sendMagicLink({
            email, emailType, labels, name, oldEmail, newsletters, redirect,
            integrityToken, phonenumber, customUrlHistory, token, autoRedirect = true, includeOTC
        }) {
            const url = endpointFor({type: 'members', resource: 'send-magic-link'});
            const body = {
                name, email, newsletters, oldEmail, emailType, labels,
                requestSrc: 'portal', redirect, integrityToken,
                honeypot: phonenumber, token, autoRedirect, includeOTC
            };
            const urlHistory = customUrlHistory ?? getUrlHistory();
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
            const humanError = await HumanReadableError.fromApiResponse(res);
            throw humanError ?? new Error('Failed to send magic link email');
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = endpointFor({type: 'members', resource: 'verify-otc'});
            const body = {otc, otcRef, redirect, integrityToken};
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            throw humanError ?? new Error('Failed to verify code');
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
            const url = buildUrlWithParams(
                endpointFor({type: 'members', resource: 'member/newsletters'}),
                uuid, key
            );
            return makeRequest({url, credentials: 'same-origin'})
                .then(handleOptionalJsonResponse);
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = buildUrlWithParams(
                endpointFor({type: 'members', resource: 'member/newsletters'}),
                uuid, key
            );
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makePutRequest(url, body, 'Failed to update email preferences');
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/email'});
            const body = {email, identity};
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            const errMsg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
            throw new Error(errMsg);
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
                const errMsg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                throw new Error(errMsg);
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
                throw error ?? new Error('We\'re unable to process your payment right now. Please try again later.');
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