```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

const API_PATH = 'members/api';
const DEFAULT_LIMIT = 100;
const JSON_HEADERS = {'Content-Type': 'application/json'};
const SAME_ORIGIN_CREDENTIALS = 'same-origin';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const normalizeUrl = (url) => url.replace(/\/$/, '');
    const siteUrlNormalized = normalizeUrl(siteUrl);

    function endpointFor({type, resource}) {
        if (type === 'members') {
            return `${siteUrlNormalized}/${API_PATH}/${resource}/`;
        }
    }

    function contentEndpointFor({resource, params = {}}) {
        if (!apiUrl || !apiKey) {
            return '';
        }
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${normalizeUrl(apiUrl)}/${resource}/?${searchParams.toString()}`;
    }

    function makeRequest({url, method = 'GET', headers = {}, credentials = undefined, body = undefined}) {
        return fetch(url, {method, headers, credentials, body});
    }

    async function handleJsonResponse(res, errorMessage) {
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    }

    async function handleTextResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.text();
    }

    async function handleJsonOrNullResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    }

    function createContentRequest(resource, params = {}, errorMessage) {
        return async () => {
            const url = contentEndpointFor({resource, params});
            const res = await makeRequest({url, headers: JSON_HEADERS});
            return handleJsonResponse(res, errorMessage);
        };
    }

    const api = {};

    api.site = {
        read: createContentRequest('site', {}, 'Failed to fetch site data'),
        newsletters: createContentRequest('newsletters', {limit: DEFAULT_LIMIT}, 'Failed to fetch site data'),
        tiers: createContentRequest('tiers', {limit: DEFAULT_LIMIT, include: 'monthly_price,yearly_price,benefits'}, 'Failed to fetch site data'),
        settings: createContentRequest('settings', {}, 'Failed to fetch site data'),

        async offer({offerId}) {
            const url = contentEndpointFor({resource: `offers/${offerId}`});
            const res = await makeRequest({url, headers: JSON_HEADERS});
            return handleJsonResponse(res, 'Failed to fetch offer data');
        },

        async recommendations({limit = DEFAULT_LIMIT} = {}) {
            const url = contentEndpointFor({resource: 'recommendations', params: {limit}});
            const res = await makeRequest({url, headers: JSON_HEADERS});
            return handleJsonResponse(res, 'Failed to fetch recommendations');
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const body = {feedback: [{post_id: postId, score}]};
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: JSON_HEADERS,
                credentials: SAME_ORIGIN_CREDENTIALS,
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

    api.member = {
        identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({url, credentials: SAME_ORIGIN_CREDENTIALS}).then(handleTextResponse);
        },

        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({url, credentials: SAME_ORIGIN_CREDENTIALS}).then(handleJsonOrNullResponse);
        },

        async update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            const res = await makeRequest({
                url,
                method: 'PUT',
                headers: JSON_HEADERS,
                credentials: SAME_ORIGIN_CREDENTIALS,
                body: JSON.stringify(body)
            });
            return res.ok ? res.json() : null;
        },

        async deleteSuppression() {
            const url = endpointFor({type: 'members', resource: 'member/suppression'});
            const res = await makeRequest({url, method: 'DELETE'});
            if (!res.ok) {
                throw new Error('Your email has failed to resubscribe, please try again');
            }
            return true;
        },

        async getIntegrityToken() {
            const url = endpointFor({type: 'members', resource: 'integrity-token'});
            const res = await makeRequest({url, method: 'GET'});
            if (res.ok) {
                return res.text();
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            throw humanError || new Error('Failed to start a members session');
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
                headers: JSON_HEADERS,
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
            throw humanError || new Error('Failed to send magic link email');
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = endpointFor({type: 'members', resource: 'verify-otc'});
            const body = {otc, otcRef, redirect, integrityToken};
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            throw humanError || new Error('Failed to verify code');
        },

        async signout(all = false) {
            const url = endpointFor({type: 'members', resource: 'session'});
            const res = await makeRequest({
                url,
                method: 'DELETE',
                headers: JSON_HEADERS,
                body: JSON.stringify({all})
            });
            if (res.ok) {
                window.location.replace(siteUrl);
                return 'Success';
            }
            throw new Error('Failed to signout');
        },

        async newsletters({uuid, key}) {
            const url = endpointFor({type: 'members', resource: 'member/newsletters'}) + `?uuid=${uuid}&key=${key}`;
            const res = await makeRequest({url, credentials: SAME_ORIGIN_CREDENTIALS});
            return handleJsonOrNullResponse(res);
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member/newsletters'}) + `?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            const res = await makeRequest({
                url,
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            throw new Error('Failed to update email preferences');
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/email'});
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({email, identity})
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
                headers: JSON_HEADERS,
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

            const body = {identity, metadata: metadataObj, successUrl, cancelUrl, type: 'donation', personalNote};

            const response = await makeRequest({
                url,
                method: 'POST',
                headers: JSON_HEADERS,
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
                headers: JSON_HEADERS,
                body: JSON.stringify({identity, subscription_id: subscriptionId, successUrl, cancelUrl})
            });

            if (!res.ok) {
                throw new Error('Unable to create stripe checkout session');
            }

            const result = await res.json();
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        },

        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-billing-portal-session'});

            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({identity, subscription