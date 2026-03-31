```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    const membersEndpoint = (resource) =>
        `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;

    const contentEndpoint = (resource, params = {}) => {
        if (!apiUrl || !apiKey) {
            return '';
        }
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
    };

    const makeRequest = ({url, method = 'GET', headers = {}, credentials, body}) =>
        fetch(url, {method, headers, credentials, body});

    const jsonRequest = (url, options = {}) =>
        makeRequest({
            url,
            headers: {'Content-Type': 'application/json'},
            ...options
        });

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

    const getIdentity = () => api.member.identity();

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

    const redirectToStripeCheckout = async (responseBody) => {
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        const result = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        if (result.error) {
            throw new Error(result.error.message);
        }
    };

    const api = {};

    api.site = {
        read() {
            return jsonRequest(membersEndpoint('site'))
                .then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        newsletters() {
            return jsonRequest(contentEndpoint('newsletters', {limit: 100}))
                .then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        tiers() {
            return jsonRequest(contentEndpoint('tiers', {
                limit: 100,
                include: 'monthly_price,yearly_price,benefits'
            })).then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        settings() {
            return jsonRequest(contentEndpoint('settings'))
                .then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        offer({offerId}) {
            return jsonRequest(contentEndpoint(`offers/${offerId}`))
                .then(res => handleJsonResponse(res, 'Failed to fetch offer data'));
        },

        recommendations({limit = 100} = {}) {
            return jsonRequest(contentEndpoint('recommendations', {limit}))
                .then(res => handleJsonResponse(res, 'Failed to fetch recommendations'));
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = membersEndpoint('feedback');
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }

            const res = await jsonRequest(url, {
                method: 'POST',
                credentials: 'same-origin',
                body: JSON.stringify({feedback: [{post_id: postId, score}]})
            });

            if (res.ok) {
                return res.json();
            }
            await handleHumanReadableError(res, 'Failed to save feedback');
        }
    };

    api.recommendations = {
        trackClicked({recommendationId}) {
            navigator.sendBeacon(membersEndpoint(`recommendations/${recommendationId}/clicked`));
        },

        trackSubscribed({recommendationId}) {
            navigator.sendBeacon(membersEndpoint(`recommendations/${recommendationId}/subscribed`));
        }
    };

    api.member = {
        identity() {
            return makeRequest({url: membersEndpoint('session'), credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.text());
        },

        sessionData() {
            return makeRequest({url: membersEndpoint('member'), credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.json());
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return jsonRequest(membersEndpoint('member'), {
                method: 'PUT',
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }).then(res => res.ok ? res.json() : null);
        },

        deleteSuppression() {
            return makeRequest({url: membersEndpoint('member/suppression'), method: 'DELETE'})
                .then(res => {
                    if (!res.ok) {
                        throw new Error('Your email has failed to resubscribe, please try again');
                    }
                    return true;
                });
        },

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

            const res = await jsonRequest(membersEndpoint('send-magic-link'), {
                method: 'POST',
                body: JSON.stringify(body)
            });

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
            const res = await jsonRequest(membersEndpoint('verify-otc'), {
                method: 'POST',
                body: JSON.stringify({otc, otcRef, redirect, integrityToken})
            });

            if (res.ok) {
                return res.json();
            }
            await handleHumanReadableError(res, 'Failed to verify code');
        },

        signout(all = false) {
            return jsonRequest(membersEndpoint('session'), {
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

            return jsonRequest(url, {
                method: 'PUT',
                body: JSON.stringify(body)
            }).then(res => handleJsonResponse(res, 'Failed to update email preferences'));
        },

        async updateEmailAddress({email}) {
            const identity = await getIdentity();
            const res = await jsonRequest(membersEndpoint('member/email'), {
                method: 'POST',
                body: JSON.stringify({email, identity})
            });

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
            const identity = await getIdentity();

            if (!cancelUrl) {
                cancelUrl = buildCancelUrl(siteUrlObj);
            }

            const metadataObj = buildFpMetadata({
                name,
                newsletters: JSON.stringify(newsletters),
                requestSrc: 'portal',
                ...metadata
            });

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

            const res = await jsonRequest(membersEndpoint('create-stripe-checkout-session'), {
                method: 'POST',
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData?.errors?.[0]?.message || 'Failed to signup, please try again.');
            }

            return redirectToStripeCheckout(await res.json());
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await getIdentity();
            const body = {
                identity,
                metadata: buildFpMetadata(metadata),
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote
            };

            const response = await jsonRequest(membersEndpoint('create-stripe-checkout-session'), {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const responseJson = await response.json();

            if (!response.ok) {
                throw responseJson?.errors?.[0] ?? new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await getIdentity();

            if (!successUrl) {
                const url = new URL(siteUrl);
                url.searchParams.set('stripe', 'billing-update-success');
                successUrl = url.href;
            }

            if (!cancelUrl) {
                const url = window.location.href.startsWith(siteUrlObj.href)
                    ? new URL(window.location.href)
                    : new URL(siteUrl);
                url.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = url.href;
            }

            const res = await jsonRequest(membersEndpoint('create-stripe-update-session'), {
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
            const identity = await getIdentity();

            if (!returnUrl) {
                const url = new URL(siteUrl);
                url.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = url.href;
            }

            const res = await jsonRequest(membersEndpoint('create-stripe-billing-portal-session'), {
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
            const identity = await getIdentity();
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

            return jsonRequest(url, {method: 'PUT', body: JSON.stringify(body)});
        },

        async offers() {
            const identity = await getIdentity();
            return jsonRequest(membersEndpoint('member/offers'), {
                method: 'POST',
                body: JSON.stringify({identity})
            }).then(res => res.ok ? res.json() : {offers: []})
                .catch(() => ({offers: []}));
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await getIdentity();
            const res = await jsonRequest(membersEndpoint(`subscriptions/${subscriptionId}/apply-offer`), {
                method: 'POST',
                body: JSON.stringify({identity, offer_id: offerId})
            });

            if (!res.ok) {
                const errorText = await res.text();