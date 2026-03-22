Here's the refactored code with reduced complexity through several improvements:

```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

const JSON_HEADERS = {'Content-Type': 'application/json'};

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    // ─── URL Helpers ──────────────────────────────────────────────────────────

    const normalizeUrl = url => url.replace(/\/$/, '');

    function endpointFor({resource}) {
        return `${normalizeUrl(siteUrl)}/${apiPath}/${resource}/`;
    }

    function contentEndpointFor({resource, params = {}}) {
        if (!apiUrl || !apiKey) {
            return '';
        }
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${normalizeUrl(apiUrl)}/${resource}/?${searchParams}`;
    }

    // ─── Request Helpers ──────────────────────────────────────────────────────

    function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
        return fetch(url, {method, headers, credentials, body});
    }

    async function makeJsonRequest(options) {
        return makeRequest({...options, headers: {...JSON_HEADERS, ...options.headers}});
    }

    async function parseJsonResponse(res, errorMessage) {
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    }

    async function throwHumanReadableOrDefault(res, defaultMessage) {
        throw (await HumanReadableError.fromApiResponse(res)) ?? new Error(defaultMessage);
    }

    async function fetchJson({url, method = 'GET', credentials, body, errorMessage}) {
        const res = await makeJsonRequest({url, method, credentials, body});
        return parseJsonResponse(res, errorMessage);
    }

    // ─── Stripe Helpers ───────────────────────────────────────────────────────

    function redirectToStripeCheckout(responseBody) {
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        return window.Stripe(responseBody.publicKey)
            .redirectToCheckout({sessionId: responseBody.sessionId})
            .then(({error}) => {
                if (error) {
                    throw new Error(error.message);
                }
            });
    }

    function buildCancelUrl(siteUrlObj, stripeParam) {
        const url = window.location.href.startsWith(siteUrlObj.href)
            ? new URL(window.location.href)
            : new URL(siteUrl);
        url.searchParams.set('stripe', stripeParam);
        return url.href;
    }

    function buildSuccessUrl(stripeParam) {
        const url = new URL(siteUrl);
        url.searchParams.set('stripe', stripeParam);
        return url.href;
    }

    function buildFpMetadata(extra = {}) {
        return {
            fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
            urlHistory: getUrlHistory(),
            ...extra
        };
    }

    // ─── API ──────────────────────────────────────────────────────────────────

    const api = {};

    api.site = {
        read() {
            return fetchJson({
                url: endpointFor({resource: 'site'}),
                errorMessage: 'Failed to fetch site data'
            });
        },

        newsletters() {
            return fetchJson({
                url: contentEndpointFor({resource: 'newsletters', params: {limit: 100}}),
                errorMessage: 'Failed to fetch site data'
            });
        },

        tiers() {
            return fetchJson({
                url: contentEndpointFor({
                    resource: 'tiers',
                    params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
                }),
                errorMessage: 'Failed to fetch site data'
            });
        },

        settings() {
            return fetchJson({
                url: contentEndpointFor({resource: 'settings'}),
                errorMessage: 'Failed to fetch site data'
            });
        },

        offer({offerId}) {
            return fetchJson({
                url: contentEndpointFor({resource: `offers/${offerId}`}),
                errorMessage: 'Failed to fetch offer data'
            });
        },

        recommendations({limit = 100} = {}) {
            return fetchJson({
                url: contentEndpointFor({resource: 'recommendations', params: {limit}}),
                errorMessage: 'Failed to fetch recommendations'
            });
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({resource: 'feedback'});
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }

            const res = await makeJsonRequest({
                url,
                method: 'POST',
                credentials: 'same-origin',
                body: JSON.stringify({feedback: [{post_id: postId, score}]})
            });

            if (res.ok) {
                return res.json();
            }
            await throwHumanReadableOrDefault(res, 'Failed to save feedback');
        }
    };

    api.recommendations = {
        trackClicked({recommendationId}) {
            navigator.sendBeacon(endpointFor({resource: `recommendations/${recommendationId}/clicked`}));
        },

        trackSubscribed({recommendationId}) {
            navigator.sendBeacon(endpointFor({resource: `recommendations/${recommendationId}/subscribed`}));
        }
    };

    api.member = {
        identity() {
            return makeRequest({
                url: endpointFor({resource: 'session'}),
                credentials: 'same-origin'
            }).then(res => (!res.ok || res.status === 204 ? null : res.text()));
        },

        sessionData() {
            return makeRequest({
                url: endpointFor({resource: 'member'}),
                credentials: 'same-origin'
            }).then(res => (!res.ok || res.status === 204 ? null : res.json()));
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return makeJsonRequest({
                url: endpointFor({resource: 'member'}),
                method: 'PUT',
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }).then(res => (res.ok ? res.json() : null));
        },

        deleteSuppression() {
            return makeRequest({
                url: endpointFor({resource: 'member/suppression'}),
                method: 'DELETE'
            }).then(res => {
                if (!res.ok) {
                    throw new Error('Your email has failed to resubscribe, please try again');
                }
                return true;
            });
        },

        async getIntegrityToken() {
            const res = await makeRequest({
                url: endpointFor({resource: 'integrity-token'})
            });

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

            const res = await makeJsonRequest({
                url: endpointFor({resource: 'send-magic-link'}),
                method: 'POST',
                body: JSON.stringify(body)
            });

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
            const res = await makeJsonRequest({
                url: endpointFor({resource: 'verify-otc'}),
                method: 'POST',
                body: JSON.stringify({otc, otcRef, redirect, integrityToken})
            });

            if (res.ok) {
                return res.json();
            }
            await throwHumanReadableOrDefault(res, 'Failed to verify code');
        },

        signout(all = false) {
            return makeJsonRequest({
                url: endpointFor({resource: 'session'}),
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
            const url = `${endpointFor({resource: 'member/newsletters'})}?uuid=${uuid}&key=${key}`;
            return makeRequest({url, credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204 ? null : res.json()));
        },

        updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = `${endpointFor({resource: 'member/newsletters'})}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return makeJsonRequest({
                url,
                method: 'PUT',
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
            const res = await makeJsonRequest({
                url: endpointFor({resource: 'member/email'}),
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
            const identity = await api.member.identity();

            cancelUrl ??= buildCancelUrl(siteUrlObj, 'cancel');

            const body = {
                priceId: offerId ? null : plan,
                offerId,
                identity,
                successUrl,
                cancelUrl,
                metadata: {
                    name,
                    newsletters: JSON.stringify(newsletters),
                    requestSrc: 'portal',
                    ...buildFpMetadata(metadata)
                }
            };

            if (customerEmail) {
                body.customerEmail = customerEmail;
            }

            if (tierId && cadence) {
                body.tierId = offerId ? null : tierId;
                body.cadence = offerId ? null : cadence;
                delete body.priceId;
            }

            const res = await makeJsonRequest({
                url: endpointFor({resource: 'create-stripe-checkout-session'}),
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
            const identity = await api.member.identity();

            const response = await makeJsonRequest({
                url: endpointFor({resource: 'create-stripe-checkout-session'}),
                method: 'POST',
                body: JSON.stringify({
                    identity,
                    successUrl,
                    cancelUrl,
                    type: 'donation',
                    personalNote,
                    metadata: buildFpMetadata(metadata)
                })
            });

            const responseJson = await response.json();

            if (!response.ok) {
                throw responseJson?.errors?.[0] ?? new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();

            successUrl ??= buildSuccessUrl('billing-update-success');
            cancelUrl ??= buildCancelUrl(siteUrlObj, 'billing-update-cancel');

            const res = await makeJsonRequest({
                url: endpointFor({resource: 'create-stripe-update-session'}),
                method: 'POST',
                body: JSON.stringify({identity, subscription_id: subscriptionId, successUrl, cancelUrl})
            });

            if (!res.ok) {
                throw new Error('Unable to create stripe checkout session');
            }

            const result = await res.json();
            const redirectResult = await window.Stripe(result.publicKey)
                .redirectToCheckout({sessionId: result.sessionId});

            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        },

        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();

            returnUrl ??= buildSuccessUrl('billing-portal-closed');

            const res = await makeJsonRequest({
                url: endpointFor({resource: 'create-stripe-billing-portal-session'}),
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
            const identity = await api.member.identity();
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

            return makeJsonRequest({
                url: `${endpointFor({resource: 'subscriptions'})}${subscriptionId}/`,
                method: 'PUT',
                body: JSON.stringify(body)
            });
        },

        async offers() {
            const identity = await api.member.identity();
            return makeJsonRequest({
                url: endpointFor({resource: 'member/offers'}),
                method: 'POST',
                body: JSON.stringify({identity})
            })
                .then(res => (res.ok ? res.json() : {offers: []}))
                .catch(() => ({offers: []}));
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const res = await makeJsonRequest({
                url: endpointFor({resource: `subscriptions/${subscriptionId}/apply-offer`}),
                method: 'POST',
                body: JSON.stringify({identity, offer_id: offerId})
            });

            if (!res.ok) {
                throw new Error((await res.text()) || 'Failed to apply offer');
            }
            return true;
        }
    };

    api.init = async () => {
        const member = await api.member.sessionData();
        let site = {};

        try {
            const [{settings}, {tiers}, {newsletters}] = await Promise.all([
                api.site.settings(),
                api.site.tiers(),
                api.site.newsletters()
            ]);
            site = {...settings, newsletters, tiers: transformApiTiersData({tiers})};
        } catch (e) {
            // Ignore
        }

        let offers = [];
        if (member?.paid) {
            try {
                offers = (await api.member.offers()).offers ?? [];
            } catch (e) {
                console.warn('[Portal] Failed to load member offers:', e);
            }
        }

        return {site: transformApiSiteData({site}), member, offers};
    };

    return api;
}

export default setupGhostApi;
```

Key refactoring improvements:

1. **Extracted shared constants** — `JSON_HEADERS` avoids repeating the content-type header object everywhere.

2. **Unified request helpers** — `makeJsonRequest`, `fetchJson`, and `throwHumanReadableOrDefault` eliminate the repeated pattern of building headers, checking `res.ok`, and throwing errors.

3. **Simplified `endpointFor`** — Removed the unused `type` parameter since it was always `'members'`.

4. **Extracted URL builders** — `buildCancelUrl`, `buildSuccessUrl`, and `buildFpMetadata` consolidate repeated Stripe URL and metadata construction logic.

5. **Replaced `.then` chains with `async/await`** — Improves readability in methods like `editBilling` and `manageBilling`, and removes redundant `.catch(err => { throw err })` no-ops.

6. **Used nullish coalescing assignment (`??=`)** — Replaces verbose `if (!x) { x = ... }` patterns for optional URL defaults.

7. **Simplified `api.init`** — Removed the unnecessary wrapping `Promise.all` around a single call and used optional chaining (`member?.paid`).