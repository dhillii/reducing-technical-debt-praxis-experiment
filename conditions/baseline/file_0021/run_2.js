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

    const membersEndpoint = resource => endpointFor({type: 'members', resource});

    const api = {};

    api.site = {
        read: () =>
            getJsonRequest(membersEndpoint('site'))
                .then(res => handleJsonResponse(res, 'Failed to fetch site data')),

        newsletters: () =>
            getJsonRequest(contentEndpointFor({resource: 'newsletters', params: {limit: 100}}))
                .then(res => handleJsonResponse(res, 'Failed to fetch site data')),

        tiers: () =>
            getJsonRequest(contentEndpointFor({
                resource: 'tiers',
                params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
            })).then(res => handleJsonResponse(res, 'Failed to fetch site data')),

        settings: () =>
            getJsonRequest(contentEndpointFor({resource: 'settings'}))
                .then(res => handleJsonResponse(res, 'Failed to fetch site data')),

        offer: ({offerId}) =>
            getJsonRequest(contentEndpointFor({resource: `offers/${offerId}`}))
                .then(res => handleJsonResponse(res, 'Failed to fetch offer data')),

        recommendations: ({limit = 100} = {}) =>
            getJsonRequest(contentEndpointFor({resource: 'recommendations', params: {limit}}))
                .then(res => handleJsonResponse(res, 'Failed to fetch recommendations'))
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = membersEndpoint('feedback');
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const res = await postJsonRequest(
                url,
                {feedback: [{post_id: postId, score}]},
                {credentials: 'same-origin'}
            );
            if (res.ok) {
                return res.json();
            }
            await handleHumanReadableError(res, 'Failed to save feedback');
        }
    };

    api.recommendations = {
        trackClicked: ({recommendationId}) =>
            navigator.sendBeacon(membersEndpoint(`recommendations/${recommendationId}/clicked`)),

        trackSubscribed: ({recommendationId}) =>
            navigator.sendBeacon(membersEndpoint(`recommendations/${recommendationId}/subscribed`))
    };

    api.member = {
        identity: () =>
            makeRequest({url: membersEndpoint('session'), credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.text()),

        sessionData: () =>
            makeRequest({url: membersEndpoint('member'), credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.json()),

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return putJsonRequest(membersEndpoint('member'), body, {credentials: 'same-origin'})
                .then(res => res.ok ? res.json() : null);
        },

        deleteSuppression: () =>
            makeRequest({url: membersEndpoint('member/suppression'), method: 'DELETE'})
                .then(res => {
                    if (!res.ok) {
                        throw new Error('Your email has failed to resubscribe, please try again');
                    }
                    return true;
                }),

        async getIntegrityToken() {
            const res = await makeRequest({url: membersEndpoint('integrity-token'), method: 'GET'});
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
        async sendMagicLink({
            email, emailType, labels, name, oldEmail, newsletters,
            redirect, integrityToken, phonenumber, customUrlHistory,
            token, autoRedirect = true, includeOTC
        }) {
            const body = {
                name, email, newsletters, oldEmail, emailType, labels,
                requestSrc: 'portal', redirect, integrityToken,
                honeypot: phonenumber, token, autoRedirect, includeOTC
            };

            const urlHistory = customUrlHistory ?? getUrlHistory();
            if (urlHistory) {
                body.urlHistory = urlHistory;
            }

            const res = await postJsonRequest(membersEndpoint('send-magic-link'), body);

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
            const res = await postJsonRequest(
                membersEndpoint('verify-otc'),
                {otc, otcRef, redirect, integrityToken}
            );
            if (res.ok) {
                return res.json();
            }
            await handleHumanReadableError(res, 'Failed to verify code');
        },

        signout(all = false) {
            return makeRequest({
                url: membersEndpoint('session'),
                method: 'DELETE',
                headers: JSON_HEADERS,
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
            const url = `${membersEndpoint('member/newsletters')}?uuid=${uuid}&key=${key}`;
            return makeRequest({url, credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.json());
        },

        updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = `${membersEndpoint('member/newsletters')}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return putJsonRequest(url, body)
                .then(res => {
                    if (res.ok) {
                        return res.json();
                    }
                    throw new Error('Failed to update email preferences');
                });
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const res = await postJsonRequest(membersEndpoint('member/email'), {email, identity});
            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            throw new Error(errData?.errors?.[0]?.message || 'Failed to send email address verification email');
        },

        async checkoutPlan({
            plan, tierId, cadence, cancelUrl, successUrl,
            email: customerEmail, name, offerId, newsletters, metadata = {}
        } = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();

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

            const res = await postJsonRequest(membersEndpoint('create-stripe-checkout-session'), body);

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

            const body = {
                identity,
                metadata: {
                    fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
                    urlHistory: getUrlHistory(),
                    ...metadata
                },
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote
            };

            const response = await postJsonRequest(membersEndpoint('create-stripe-checkout-session'), body);
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

            const res = await postJsonRequest(
                membersEndpoint('create-stripe-update-session'),
                {identity, subscription_id: subscriptionId, successUrl, cancelUrl}
            );

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

            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const res = await postJsonRequest(
                membersEndpoint('create-stripe-billing-portal-session'),
                {identity, subscription_id: subscriptionId, returnUrl}
            );

            if (!res.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }

            const result = await res.json();
            return window.location.assign(result.url);
        },

        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await api.member.identity();
            const url = `${membersEndpoint('subscriptions')}${subscriptionId}/`;
            const body = {
                smart_cancel: smartCancel,
                cancel_at_period_end: cancelAtPeriodEnd,
                cancellation_reason: cancellationReason,
                identity,
                priceId: planId
            };

            if (tierId && cadence) {
                delete body.priceId;
                body.tierId = tierId;
                body.cadence = cadence;
            }

            return putJsonRequest(url, body);
        },

        async offers() {
            const identity = await api.member.identity();
            try {
                const res = await postJsonRequest(membersEndpoint('member/offers'), {identity});
                return res.ok ? res.json() : {offers: []};
            } catch {
                return {offers: []};
            }
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const res = await postJsonRequest(
                membersEndpoint(`subscriptions/${subscriptionId}/apply-offer`),
                {identity, offer_id: offerId}