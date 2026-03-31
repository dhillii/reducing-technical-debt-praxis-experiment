```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

const JSON_HEADERS = {'Content-Type': 'application/json'};

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    const endpointFor = ({type, resource}) =>
        type === 'members' ? `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/` : '';

    const contentEndpointFor = ({resource, params = {}}) => {
        if (!apiUrl || !apiKey) {
            return '';
        }
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
    };

    const makeRequest = ({url, method = 'GET', headers = {}, credentials, body}) =>
        fetch(url, {method, headers, credentials, body});

    const handleJsonResponse = async (res, errorMessage) => {
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    };

    const handleHumanReadableError = async (res, fallbackMessage) => {
        const humanError = await HumanReadableError.fromApiResponse(res);
        throw humanError ?? new Error(fallbackMessage);
    };

    const getJsonRequest = (url, extra = {}) =>
        makeRequest({url, method: 'GET', headers: JSON_HEADERS, ...extra});

    const postJsonRequest = (url, body, extra = {}) =>
        makeRequest({url, method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body), ...extra});

    const putJsonRequest = (url, body, extra = {}) =>
        makeRequest({url, method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body), ...extra});

    const buildFpTid = () => (window.FPROM || window.$FPROM)?.data?.tid;

    const buildStripeMetadata = (extra = {}) => ({
        fp_tid: buildFpTid(),
        urlHistory: getUrlHistory(),
        ...extra
    });

    const redirectToStripeCheckout = async (res) => {
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
        }
    };

    const buildNewsletterUrl = ({uuid, key, resource = 'member/newsletters'}) => {
        const base = endpointFor({type: 'members', resource});
        return `${base}?uuid=${uuid}&key=${key}`;
    };

    const api = {};

    api.site = {
        read() {
            const url = endpointFor({type: 'members', resource: 'site'});
            return getJsonRequest(url).then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        newsletters() {
            const url = contentEndpointFor({resource: 'newsletters', params: {limit: 100}});
            return getJsonRequest(url).then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        tiers() {
            const url = contentEndpointFor({
                resource: 'tiers',
                params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
            });
            return getJsonRequest(url).then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        settings() {
            const url = contentEndpointFor({resource: 'settings'});
            return getJsonRequest(url).then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        offer({offerId}) {
            const url = contentEndpointFor({resource: `offers/${offerId}`});
            return getJsonRequest(url).then(res => handleJsonResponse(res, 'Failed to fetch offer data'));
        },

        recommendations({limit = 100} = {}) {
            const url = contentEndpointFor({resource: 'recommendations', params: {limit}});
            return getJsonRequest(url).then(res => handleJsonResponse(res, 'Failed to fetch recommendations'));
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const res = await postJsonRequest(url, {feedback: [{post_id: postId, score}]}, {credentials: 'same-origin'});
            if (res.ok) {
                return res.json();
            }
            await handleHumanReadableError(res, 'Failed to save feedback');
        }
    };

    api.recommendations = {
        trackClicked({recommendationId}) {
            navigator.sendBeacon(endpointFor({type: 'members', resource: `recommendations/${recommendationId}/clicked`}));
        },

        trackSubscribed({recommendationId}) {
            navigator.sendBeacon(endpointFor({type: 'members', resource: `recommendations/${recommendationId}/subscribed`}));
        }
    };

    api.member = {
        identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({url, credentials: 'same-origin'}).then(res =>
                (!res.ok || res.status === 204) ? null : res.text()
            );
        },

        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({url, credentials: 'same-origin'}).then(res =>
                (!res.ok || res.status === 204) ? null : res.json()
            );
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return putJsonRequest(url, body, {credentials: 'same-origin'}).then(res =>
                res.ok ? res.json() : null
            );
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
            await handleHumanReadableError(res, 'Failed to start a members session');
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

            const res = await postJsonRequest(url, body);
            if (!res.ok) {
                await handleHumanReadableError(res, 'Failed to send magic link email');
            }

            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return await res.json();
                } catch (e) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = endpointFor({type: 'members', resource: 'verify-otc'});
            const res = await postJsonRequest(url, {otc, otcRef, redirect, integrityToken});
            if (res.ok) {
                return res.json();
            }
            await handleHumanReadableError(res, 'Failed to verify code');
        },

        signout(all = false) {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({url, method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({all})})
                .then(res => {
                    if (res.ok) {
                        window.location.replace(siteUrl);
                        return 'Success';
                    }
                    throw new Error('Failed to signout');
                });
        },

        newsletters({uuid, key}) {
            const url = buildNewsletterUrl({uuid, key});
            return makeRequest({url, credentials: 'same-origin'}).then(res =>
                (!res.ok || res.status === 204) ? null : res.json()
            );
        },

        updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = buildNewsletterUrl({uuid, key});
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return putJsonRequest(url, body).then(res => {
                if (res.ok) {
                    return res.json();
                }
                throw new Error('Failed to update email preferences');
            });
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/email'});
            const res = await postJsonRequest(url, {email, identity});
            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            throw new Error(errData?.errors?.[0]?.message || 'Failed to send email address verification email');
        },

        async checkoutPlan({plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {}} = {}) {
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

            const body = {
                priceId: offerId ? null : plan,
                offerId,
                identity,
                metadata: buildStripeMetadata({
                    name,
                    newsletters: JSON.stringify(newsletters),
                    requestSrc: 'portal',
                    ...metadata
                }),
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

            const res = await postJsonRequest(url, body);
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

            const body = {
                identity,
                metadata: buildStripeMetadata(metadata),
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote
            };

            const response = await postJsonRequest(url, body);
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

            const res = await postJsonRequest(url, {identity, subscription_id: subscriptionId, successUrl, cancelUrl});
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

            const res = await postJsonRequest(url, {identity, subscription_id: subscriptionId, returnUrl});