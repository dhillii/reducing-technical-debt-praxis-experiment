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

    const getJson = (url, errorMessage) =>
        makeRequest({url, method: 'GET', headers: JSON_HEADERS})
            .then(res => handleJsonResponse(res, errorMessage));

    const postJson = (url, body, options = {}) =>
        makeRequest({
            url,
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(body),
            ...options
        });

    const buildStripeCheckoutUrl = (baseUrl, stripe, searchParam) => {
        const siteUrlObj = new URL(siteUrl);
        const url = window.location.href.startsWith(siteUrlObj.href)
            ? new URL(window.location.href)
            : new URL(siteUrl);
        url.searchParams.set(stripe, searchParam);
        return url.href;
    };

    const getFpTid = () => (window.FPROM || window.$FPROM)?.data?.tid;

    const api = {};

    api.site = {
        read: () => getJson(endpointFor('site'), 'Failed to fetch site data'),
        newsletters: () => getJson(contentEndpointFor('newsletters', {limit: 100}), 'Failed to fetch site data'),
        tiers: () => getJson(contentEndpointFor('tiers', {limit: 100, include: 'monthly_price,yearly_price,benefits'}), 'Failed to fetch site data'),
        settings: () => getJson(contentEndpointFor('settings'), 'Failed to fetch site data'),
        offer: ({offerId}) => getJson(contentEndpointFor(`offers/${offerId}`), 'Failed to fetch offer data'),
        recommendations: ({limit = 100} = {}) => getJson(contentEndpointFor('recommendations', {limit}), 'Failed to fetch recommendations')
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor('feedback');
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }

            const res = await postJson(url, {
                feedback: [{post_id: postId, score}]
            }, {credentials: 'same-origin'});

            if (res.ok) {
                return res.json();
            }
            await handleHumanReadableError(res, 'Failed to save feedback');
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

            return makeRequest({
                url: endpointFor('member'),
                method: 'PUT',
                headers: JSON_HEADERS,
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
            const body = {
                name, email, newsletters, oldEmail, emailType, labels,
                requestSrc: 'portal', redirect, integrityToken,
                honeypot: phonenumber, token, autoRedirect, includeOTC
            };

            const urlHistory = customUrlHistory ?? getUrlHistory();
            if (urlHistory) {
                body.urlHistory = urlHistory;
            }

            const res = await postJson(endpointFor('send-magic-link'), body);

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
            const res = await postJson(endpointFor('verify-otc'), {otc, otcRef, redirect, integrityToken});

            if (res.ok) {
                return res.json();
            }
            await handleHumanReadableError(res, 'Failed to verify code');
        },

        signout(all = false) {
            return makeRequest({
                url: endpointFor('session'),
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
            const url = `${endpointFor('member/newsletters')}?uuid=${uuid}&key=${key}`;
            return makeRequest({url, credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.json());
        },

        updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = `${endpointFor('member/newsletters')}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return makeRequest({
                url,
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            }).then(res => {
                if (res.ok) {
                    return res.json();
                }
                throw new Error('Failed to update email preferences');
            });
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const res = await postJson(endpointFor('member/email'), {email, identity});

            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            throw new Error(errData?.errors?.[0]?.message || 'Failed to send email address verification email');
        },

        async checkoutPlan({plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {}} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();

            if (!cancelUrl) {
                cancelUrl = buildStripeCheckoutUrl(siteUrlObj, 'stripe', 'cancel');
            }

            const metadataObj = {
                name,
                newsletters: JSON.stringify(newsletters),
                requestSrc: 'portal',
                fp_tid: getFpTid(),
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

            const res = await postJson(endpointFor('create-stripe-checkout-session'), body);

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
                metadata: {fp_tid: getFpTid(), urlHistory: getUrlHistory(), ...metadata},
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote
            };

            const response = await postJson(endpointFor('create-stripe-checkout-session'), body);
            const responseJson = await response.json();

            if (!response.ok) {
                throw responseJson?.errors?.[0] ?? new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();

            if (!successUrl) {
                const url = new URL(siteUrl);
                url.searchParams.set('stripe', 'billing-update-success');
                successUrl = url.href;
            }

            if (!cancelUrl) {
                cancelUrl = buildStripeCheckoutUrl(siteUrlObj, 'stripe', 'billing-update-cancel');
            }

            const res = await postJson(endpointFor('create-stripe-update-session'), {
                identity,
                subscription_id: subscriptionId,
                successUrl,
                cancelUrl
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

            if (!returnUrl) {
                const url = new URL(siteUrl);
                url.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = url.href;
            }

            const res = await postJson(endpointFor('create-stripe-billing-portal-session'), {
                identity,
                subscription_id: subscriptionId,
                returnUrl
            });

            if (!res.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }

            const result = await res.json();
            return window.location.assign(result.url);
        },

        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await api.member.identity();
            const url = `${endpointFor('subscriptions')}${subscriptionId}/`;

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

            return makeRequest({url, method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body)});
        },

        async offers() {
            const identity = await api.member.identity();

            try {
                const res = await postJson(endpointFor('member/offers'), {identity});
                return res.ok ? res.json() : {offers: []};
            } catch {
                return {offers: []};
            }
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const res = await postJson(endpointFor(`subscriptions/${subscriptionId}/apply-offer`), {
                identity,
                offer_id: offerId
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }

            return true;
        }
    };

    api.init = async () => {
        const [member] = await Promise.all([api.member.sessionData()]);

        let site = {};
        let offers = [];

        try {
            const [{settings}, {tiers}, {newsletters}] = await Promise.all([
                api.site.settings(),
                api.site.tiers(),
                api.site.newsletters()
            ]);
            site = {
                ...settings,
                newsletters,
                tiers: transformApiTiersData({tiers})
            };
        } catch {
            //