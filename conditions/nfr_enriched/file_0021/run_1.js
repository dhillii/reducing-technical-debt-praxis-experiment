```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

const JSON_HEADERS = {'Content-Type': 'application/json'};

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    const endpointFor = (resource) =>
        `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;

    const contentEndpointFor = (resource, params = {}) => {
        if (!apiUrl || !apiKey) {
            return '';
        }
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
    };

    const makeRequest = ({url, method = 'GET', headers = {}, credentials, body}) =>
        fetch(url, {method, headers, credentials, body});

    const makeJsonRequest = (url, options = {}) =>
        makeRequest({url, headers: JSON_HEADERS, ...options});

    const parseJsonResponse = async (res, errorMessage) => {
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    };

    const parseHumanReadableResponse = async (res, fallbackMessage) => {
        if (res.ok) {
            return res.json();
        }
        throw (await HumanReadableError.fromApiResponse(res)) ?? new Error(fallbackMessage);
    };

    const getContentResource = (resource, params) =>
        makeJsonRequest(contentEndpointFor(resource, params))
            .then(res => parseJsonResponse(res, 'Failed to fetch site data'));

    const getIdentityWithUrl = async (resource) => {
        const identity = await api.member.identity();
        return {identity, url: endpointFor(resource)};
    };

    const buildStripeCheckoutBody = (base, tierId, cadence, offerId) => {
        const body = {...base};
        if (tierId && cadence) {
            delete body.priceId;
            body.tierId = offerId ? null : tierId;
            body.cadence = offerId ? null : cadence;
        }
        return body;
    };

    const buildFpMetadata = (extra = {}) => ({
        fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
        urlHistory: getUrlHistory(),
        ...extra
    });

    const buildCancelUrl = (siteUrlObj) => {
        const url = window.location.href.startsWith(siteUrlObj.href)
            ? new URL(window.location.href)
            : new URL(siteUrl);
        url.searchParams.set('stripe', 'cancel');
        return url.href;
    };

    const redirectViaStripe = async (responseBody) => {
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        const result = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        if (result.error) {
            throw new Error(result.error.message);
        }
    };

    const handleStripeCheckoutResponse = async (res) => {
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData?.errors?.[0]?.message || 'Failed to signup, please try again.');
        }
        return res.json();
    };

    const buildNewsletterUrl = (resource, uuid, key) => {
        const base = endpointFor(resource);
        return `${base}?uuid=${uuid}&key=${key}`;
    };

    const api = {};

    api.site = {
        read: () =>
            makeJsonRequest(endpointFor('site'))
                .then(res => parseJsonResponse(res, 'Failed to fetch site data')),

        newsletters: () => getContentResource('newsletters', {limit: 100}),

        tiers: () => getContentResource('tiers', {
            limit: 100,
            include: 'monthly_price,yearly_price,benefits'
        }),

        settings: () => getContentResource('settings'),

        offer: ({offerId}) => getContentResource(`offers/${offerId}`),

        recommendations: ({limit = 100} = {}) =>
            getContentResource('recommendations', {limit})
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor('feedback');
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const res = await makeJsonRequest(url, {
                method: 'POST',
                credentials: 'same-origin',
                body: JSON.stringify({feedback: [{post_id: postId, score}]})
            });
            return parseHumanReadableResponse(res, 'Failed to save feedback');
        }
    };

    api.recommendations = {
        trackClicked: ({recommendationId}) =>
            navigator.sendBeacon(endpointFor(`recommendations/${recommendationId}/clicked`)),

        trackSubscribed: ({recommendationId}) =>
            navigator.sendBeacon(endpointFor(`recommendations/${recommendationId}/subscribed`))
    };

    api.member = {
        identity() {
            return makeRequest({url: endpointFor('session'), credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.text());
        },

        sessionData() {
            return makeRequest({url: endpointFor('member'), credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.json());
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makeJsonRequest(endpointFor('member'), {
                method: 'PUT',
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }).then(res => res.ok ? res.json() : null);
        },

        deleteSuppression() {
            return makeRequest({url: endpointFor('member/suppression'), method: 'DELETE'})
                .then(res => {
                    if (!res.ok) {
                        throw new Error('Your email has failed to resubscribe, please try again');
                    }
                    return true;
                });
        },

        async getIntegrityToken() {
            const res = await makeRequest({url: endpointFor('integrity-token'), method: 'GET'});
            if (res.ok) {
                return res.text();
            }
            throw (await HumanReadableError.fromApiResponse(res)) ?? new Error('Failed to start a members session');
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
            const body = {
                name, email, newsletters, oldEmail, emailType, labels,
                requestSrc: 'portal', redirect, integrityToken,
                honeypot: phonenumber, token, autoRedirect, includeOTC
            };
            const urlHistory = customUrlHistory ?? getUrlHistory();
            if (urlHistory) {
                body.urlHistory = urlHistory;
            }

            const res = await makeJsonRequest(endpointFor('send-magic-link'), {
                method: 'POST',
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                throw (await HumanReadableError.fromApiResponse(res)) ?? new Error('Failed to send magic link email');
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
            const res = await makeJsonRequest(endpointFor('verify-otc'), {
                method: 'POST',
                body: JSON.stringify({otc, otcRef, redirect, integrityToken})
            });
            return parseHumanReadableResponse(res, 'Failed to verify code');
        },

        signout(all = false) {
            return makeJsonRequest(endpointFor('session'), {
                method: 'DELETE',
                body: JSON.stringify({all})
            }).then(res => {
                if (res.ok) {
                    window.location.replace(siteUrl);
                    return 'Success';
                }
                throw new Error('Failed to signout');
            });
        },

        newsletters({uuid, key}) {
            return makeRequest({
                url: buildNewsletterUrl('member/newsletters', uuid, key),
                credentials: 'same-origin'
            }).then(res => (!res.ok || res.status === 204) ? null : res.json());
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makeJsonRequest(buildNewsletterUrl('member/newsletters', uuid, key), {
                method: 'PUT',
                body: JSON.stringify(body)
            }).then(res => parseJsonResponse(res, 'Failed to update email preferences'));
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const res = await makeJsonRequest(endpointFor('member/email'), {
                method: 'POST',
                body: JSON.stringify({email, identity})
            });
            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            throw new Error(errData?.errors?.[0]?.message || 'Failed to send email address verification email');
        },

        async checkoutPlan({plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {}} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const {identity, url} = await getIdentityWithUrl('create-stripe-checkout-session');

            if (!cancelUrl) {
                cancelUrl = buildCancelUrl(siteUrlObj);
            }

            const metadataObj = buildFpMetadata({
                name,
                newsletters: JSON.stringify(newsletters),
                requestSrc: 'portal',
                ...metadata
            });

            const baseBody = {
                priceId: offerId ? null : plan,
                offerId,
                identity,
                metadata: metadataObj,
                successUrl,
                cancelUrl,
                ...(customerEmail && {customerEmail})
            };

            const body = buildStripeCheckoutBody(baseBody, tierId, cadence, offerId);

            return makeJsonRequest(url, {method: 'POST', body: JSON.stringify(body)})
                .then(handleStripeCheckoutResponse)
                .then(redirectViaStripe);
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const {identity, url} = await getIdentityWithUrl('create-stripe-checkout-session');
            const body = {
                identity,
                metadata: buildFpMetadata(metadata),
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote
            };

            const response = await makeJsonRequest(url, {method: 'POST', body: JSON.stringify(body)});
            const responseJson = await response.json();

            if (!response.ok) {
                throw responseJson?.errors?.[0] ?? new Error('We\'re unable to process your payment right now. Please try again later.');
            }
            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const {identity, url} = await getIdentityWithUrl('create-stripe-update-session');

            if (!successUrl) {
                const successUrlObj = new URL(siteUrl);
                successUrlObj.searchParams.set('stripe', 'billing-update-success');
                successUrl = successUrlObj.href;
            }
            if (!cancelUrl) {
                const cancelUrlObj = window.location.href.startsWith(siteUrlObj.href)
                    ? new URL(window.location.href)
                    : new URL(siteUrl);
                cancelUrlObj.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = cancelUrlObj.href;
            }

            const res = await makeJsonRequest(url, {
                method: 'POST',
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
            const {identity, url} = await getIdentityWithUrl('create-stripe-billing-portal-session');

            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const res = await makeJsonRequest(url, {
                method: 'POST',
                body: JSON.stringify({identity, subscription_id: subscriptionId, returnUrl})
            });

            if (!res.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }

            const result = await res.json();
            return window.location.assign(result.url);
        },

        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const {identity, url} = await getIdentityWithUrl(`subscriptions/${subscriptionId}`);
            const baseBody = {
                smart_cancel: smartCancel,
                cancel_at_period_end: cancelAtPeriodEnd,
                cancellation_reason: cancellationReason,
                identity,
                priceId: planId
            };
            const body = buildStripeCheckoutBody(baseBody, tierId, cadence, null);

            return makeJsonRequest(url, {method: 'PUT', body: JSON.stringify(body)});
        },

        async offers() {
            const {identity, url} = await getIdentityWithUrl('member/offers');
            return makeJsonRequest(url, {method: 'POST', body: JSON.stringify({identity})})
                .then(res => res.ok ? res.json() : {offers: []})
                .catch(() => ({offers: []}));
        },

        async applyOffer({offerId, subscriptionId}) {
            const {identity, url} = await getIdentityWithUrl(`subscriptions/${subscriptionId}/apply-offer`);
            const res = await makeJsonRequest(url, {
                method: 'POST',