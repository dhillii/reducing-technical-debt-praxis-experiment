# Refactored Ghost API

Here's my analysis of the complexity issues and the refactored solution:

**Key problems identified:**
1. Massive repetition in `makeRequest` + response handling patterns
2. `api.site` methods are nearly identical (GET + JSON parse)
3. `api.member` is a monolithic object with 15+ methods
4. Inconsistent async patterns (mixing `.then()` and `async/await`)
5. Stripe redirect logic duplicated across checkout methods
6. URL building logic scattered throughout

```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    // ─── URL Builders ────────────────────────────────────────────────────────────

    function endpointFor({type, resource}) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
    }

    function membersEndpoint(resource) {
        return endpointFor({type: 'members', resource});
    }

    function contentEndpointFor({resource, params = {}}) {
        if (!apiUrl || !apiKey) {
            return '';
        }
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
    }

    function stripeCheckoutUrl(paramName) {
        const siteUrlObj = new URL(siteUrl);
        const isOnSite = window.location.href.startsWith(siteUrlObj.href);
        const base = isOnSite ? new URL(window.location.href) : new URL(siteUrl);
        base.searchParams.set('stripe', paramName);
        return base.href;
    }

    function siteUrlWithParam(paramName) {
        const url = new URL(siteUrl);
        url.searchParams.set('stripe', paramName);
        return url.href;
    }

    // ─── HTTP Helpers ─────────────────────────────────────────────────────────────

    const JSON_HEADERS = {'Content-Type': 'application/json'};

    function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
        return fetch(url, {method, headers, credentials, body});
    }

    async function getJson(url, {credentials, errorMessage = 'Request failed'} = {}) {
        const res = await makeRequest({url, headers: JSON_HEADERS, credentials});
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    }

    async function postJson(url, body, {credentials, errorMessage = 'Request failed'} = {}) {
        const res = await makeRequest({
            url,
            method: 'POST',
            headers: JSON_HEADERS,
            credentials,
            body: JSON.stringify(body)
        });
        return res;
    }

    async function throwHumanReadableOrDefault(res, defaultMessage) {
        const humanError = await HumanReadableError.fromApiResponse(res);
        throw humanError ?? new Error(defaultMessage);
    }

    async function getIdentity() {
        return api.member.identity();
    }

    // ─── Stripe Helpers ───────────────────────────────────────────────────────────

    async function redirectToStripeCheckout(res) {
        const body = await res.json();
        if (body.url) {
            return window.location.assign(body.url);
        }
        const stripe = window.Stripe(body.publicKey);
        const result = await stripe.redirectToCheckout({sessionId: body.sessionId});
        if (result.error) {
            throw new Error(result.error.message);
        }
    }

    function getFpTid() {
        return (window.FPROM || window.$FPROM)?.data?.tid;
    }

    // ─── API Modules ──────────────────────────────────────────────────────────────

    const api = {};

    // ─── Site ─────────────────────────────────────────────────────────────────────

    api.site = {
        read() {
            return getJson(membersEndpoint('site'), {errorMessage: 'Failed to fetch site data'});
        },

        newsletters() {
            return getJson(
                contentEndpointFor({resource: 'newsletters', params: {limit: 100}}),
                {errorMessage: 'Failed to fetch site data'}
            );
        },

        tiers() {
            return getJson(
                contentEndpointFor({
                    resource: 'tiers',
                    params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
                }),
                {errorMessage: 'Failed to fetch site data'}
            );
        },

        settings() {
            return getJson(
                contentEndpointFor({resource: 'settings'}),
                {errorMessage: 'Failed to fetch site data'}
            );
        },

        offer({offerId}) {
            return getJson(
                contentEndpointFor({resource: `offers/${offerId}`}),
                {errorMessage: 'Failed to fetch offer data'}
            );
        },

        recommendations({limit = 100} = {}) {
            return getJson(
                contentEndpointFor({resource: 'recommendations', params: {limit}}),
                {errorMessage: 'Failed to fetch recommendations'}
            );
        }
    };

    // ─── Feedback ─────────────────────────────────────────────────────────────────

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = membersEndpoint('feedback');
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }

            const res = await postJson(url, {
                feedback: [{post_id: postId, score}]
            }, {credentials: 'same-origin'});

            if (res.ok) {
                return res.json();
            }
            await throwHumanReadableOrDefault(res, 'Failed to save feedback');
        }
    };

    // ─── Recommendations ──────────────────────────────────────────────────────────

    api.recommendations = {
        trackClicked({recommendationId}) {
            navigator.sendBeacon(membersEndpoint(`recommendations/${recommendationId}/clicked`));
        },

        trackSubscribed({recommendationId}) {
            navigator.sendBeacon(membersEndpoint(`recommendations/${recommendationId}/subscribed`));
        }
    };

    // ─── Member ───────────────────────────────────────────────────────────────────

    api.member = {
        async identity() {
            const res = await makeRequest({
                url: membersEndpoint('session'),
                credentials: 'same-origin'
            });
            if (!res.ok || res.status === 204) {
                return null;
            }
            return res.text();
        },

        async sessionData() {
            const res = await makeRequest({
                url: membersEndpoint('member'),
                credentials: 'same-origin'
            });
            if (!res.ok || res.status === 204) {
                return null;
            }
            return res.json();
        },

        async update({name, subscribed, newsletters, enableCommentNotifications}) {
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            const res = await makeRequest({
                url: membersEndpoint('member'),
                method: 'PUT',
                headers: JSON_HEADERS,
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });

            return res.ok ? res.json() : null;
        },

        async deleteSuppression() {
            const res = await makeRequest({
                url: membersEndpoint('member/suppression'),
                method: 'DELETE'
            });
            if (!res.ok) {
                throw new Error('Your email has failed to resubscribe, please try again');
            }
            return true;
        },

        async getIntegrityToken() {
            const res = await makeRequest({url: membersEndpoint('integrity-token')});
            if (res.ok) {
                return res.text();
            }
            await throwHumanReadableOrDefault(res, 'Failed to start a members session');
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

            const res = await postJson(membersEndpoint('send-magic-link'), body);

            if (!res.ok) {
                await throwHumanReadableOrDefault(res, 'Failed to send magic link email');
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
            const res = await postJson(
                membersEndpoint('verify-otc'),
                {otc, otcRef, redirect, integrityToken}
            );

            if (res.ok) {
                return res.json();
            }
            await throwHumanReadableOrDefault(res, 'Failed to verify code');
        },

        async signout(all = false) {
            const res = await makeRequest({
                url: membersEndpoint('session'),
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
            const url = `${membersEndpoint('member/newsletters')}?uuid=${uuid}&key=${key}`;
            const res = await makeRequest({url, credentials: 'same-origin'});
            if (!res.ok || res.status === 204) {
                return null;
            }
            return res.json();
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = `${membersEndpoint('member/newsletters')}?uuid=${uuid}&key=${key}`;
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
            const identity = await getIdentity();
            const res = await postJson(membersEndpoint('member/email'), {email, identity});

            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            const errMssg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
            throw new Error(errMssg);
        },

        async checkoutPlan({
            plan, tierId, cadence, cancelUrl, successUrl,
            email: customerEmail, name, offerId, newsletters, metadata = {}
        } = {}) {
            const identity = await getIdentity();

            const body = {
                priceId: offerId ? null : plan,
                offerId,
                identity,
                successUrl,
                cancelUrl: cancelUrl ?? stripeCheckoutUrl('cancel'),
                metadata: {
                    name,
                    newsletters: JSON.stringify(newsletters),
                    requestSrc: 'portal',
                    fp_tid: getFpTid(),
                    urlHistory: getUrlHistory(),
                    ...metadata
                }
            };

            if (customerEmail) {
                body.customerEmail = customerEmail;
            }

            if (tierId && cadence) {
                delete body.priceId;
                body.tierId = offerId ? null : tierId;
                body.cadence = offerId ? null : cadence;
            }

            const res = await postJson(membersEndpoint('create-stripe-checkout-session'), body);

            if (!res.ok) {
                const errData = await res.json();
                const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                throw new Error(errMssg);
            }

            return redirectToStripeCheckout(res);
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await getIdentity();

            const res = await postJson(membersEndpoint('create-stripe-checkout-session'), {
                identity,
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote,
                metadata: {fp_tid: getFpTid(), urlHistory: getUrlHistory(), ...metadata}
            });

            const responseJson = await res.json();

            if (!res.ok) {
                const error = responseJson?.errors?.[0];
                throw error ?? new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const identity = await getIdentity();

            const res = await postJson(membersEndpoint('create-stripe-update-session'), {
                identity,
                subscription_id: subscriptionId,
                successUrl: successUrl ?? siteUrlWithParam('billing-update-success'),
                cancelUrl: cancelUrl ?? stripeCheckoutUrl('billing-update-cancel')
            });

            if (!res.ok) {
                throw new Error('Unable to create stripe checkout session');
            }

            return redirectToStripeCheckout(res);
        },

        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await getIdentity();

            const res = await postJson(membersEndpoint('create-stripe-billing-portal-session'), {
                identity,
                subscription_id: subscriptionId,
                returnUrl: returnUrl ?? siteUrlWithParam('billing-portal-closed')
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

            return makeRequest({
                url,
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });
        },

        async offers() {
            const identity = await getIdentity();
            try {
                const res = await postJson(membersEndpoint('member/offers'), {identity});
                return res.ok ? res.json() : {offers: []};
            } catch {
                return {offers: []};
            }
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await getIdentity();
            const res = await postJson(
                membersEndpoint(`subscriptions/${subscriptionId}/apply-offer`),
                {identity, offer_id: offerId}
            );

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }

            return true;
        }
    };

    // ─── Init ─────────────────────────────────────────────────────────────────────

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
        } catch (e) {
            // Ignore
        }

        if (member?.paid) {
            try {
                const offersData = await api.member.offers();
                offers = offersData.offers || [];
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('[Portal] Failed to load member offers:', e);
            }
        }

        return {site: transformApiSiteData({site}), member, offers};
    };

    return api;
}

export default setupGhostApi;
```

## Key Refactoring Changes

| Change | Benefit |
|--------|---------|
| `getJson()` helper | Eliminates 6 near-identical GET+parse blocks in `api.site` |
| `postJson()` helper | Centralizes POST request construction |
| `throwHumanReadableOrDefault()` | Removes duplicated error-handling pattern across 4 methods |
| `membersEndpoint()` shorthand | Removes repetitive `endpointFor({type: 'members', ...})` calls |
| `stripeCheckoutUrl()` / `siteUrlWithParam()` | Deduplicates URL-building logic across 3 Stripe methods |
| `redirectToStripeCheckout()` | Consolidates Stripe redirect logic shared by `checkoutPlan` and `editBilling` |
| `getFpTid()` | Extracts repeated fingerprint tracker lookup |
| `getIdentity()` | Wraps `api.member.identity()` to avoid circular self-reference |
| Unified `async/await` | Removes mixed `.then()`/`async` patterns for consistency |
| Removed redundant `.catch(err => { throw err })` | These were no-ops in `editBilling`/`manageBilling` |