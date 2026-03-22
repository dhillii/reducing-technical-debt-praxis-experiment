Here's the refactored code with reduced complexity through several improvements:

```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

const JSON_HEADERS = {'Content-Type': 'application/json'};

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    // ─── URL Helpers ──────────────────────────────────────────────────────────

    const stripTrailingSlash = url => url.replace(/\/$/, '');

    function endpointFor({resource}) {
        return `${stripTrailingSlash(siteUrl)}/${apiPath}/${resource}/`;
    }

    function contentEndpointFor({resource, params = {}}) {
        if (!apiUrl || !apiKey) {
            return '';
        }
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${stripTrailingSlash(apiUrl)}/${resource}/?${searchParams}`;
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

    async function getIdentity() {
        return api.member.identity();
    }

    function buildStripeUrl(base, param, value) {
        const url = new URL(base);
        url.searchParams.set('stripe', value);
        return url.href;
    }

    function resolveUrl(href, fallback) {
        return href.startsWith(new URL(fallback).href) ? new URL(href) : new URL(fallback);
    }

    // ─── API ──────────────────────────────────────────────────────────────────

    const api = {};

    // ─── Site ─────────────────────────────────────────────────────────────────

    function makeContentRequest(resource, params) {
        const url = contentEndpointFor({resource, params});
        return makeJsonRequest({url}).then(res => parseJsonResponse(res, 'Failed to fetch site data'));
    }

    api.site = {
        read: () => {
            const url = endpointFor({resource: 'site'});
            return makeJsonRequest({url}).then(res => parseJsonResponse(res, 'Failed to fetch site data'));
        },
        newsletters: () => makeContentRequest('newsletters', {limit: 100}),
        tiers: () => makeContentRequest('tiers', {limit: 100, include: 'monthly_price,yearly_price,benefits'}),
        settings: () => makeContentRequest('settings'),
        offer: ({offerId}) => makeContentRequest(`offers/${offerId}`),
        recommendations: ({limit = 100} = {}) => makeContentRequest('recommendations', {limit})
    };

    // ─── Feedback ─────────────────────────────────────────────────────────────

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

    // ─── Recommendations ──────────────────────────────────────────────────────

    api.recommendations = {
        trackClicked: ({recommendationId}) =>
            navigator.sendBeacon(endpointFor({resource: `recommendations/${recommendationId}/clicked`})),

        trackSubscribed: ({recommendationId}) =>
            navigator.sendBeacon(endpointFor({resource: `recommendations/${recommendationId}/subscribed`}))
    };

    // ─── Member ───────────────────────────────────────────────────────────────

    api.member = {
        identity() {
            const url = endpointFor({resource: 'session'});
            return makeRequest({url, credentials: 'same-origin'}).then(res =>
                (!res.ok || res.status === 204) ? null : res.text()
            );
        },

        sessionData() {
            const url = endpointFor({resource: 'member'});
            return makeRequest({url, credentials: 'same-origin'}).then(res =>
                (!res.ok || res.status === 204) ? null : res.json()
            );
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor({resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return makeJsonRequest({
                url,
                method: 'PUT',
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }).then(res => res.ok ? res.json() : null);
        },

        deleteSuppression() {
            const url = endpointFor({resource: 'member/suppression'});
            return makeRequest({url, method: 'DELETE'}).then(res => {
                if (!res.ok) {
                    throw new Error('Your email has failed to resubscribe, please try again');
                }
                return true;
            });
        },

        async getIntegrityToken() {
            const url = endpointFor({resource: 'integrity-token'});
            const res = await makeRequest({url});
            if (res.ok) {
                return res.text();
            }
            await throwHumanReadableOrDefault(res, 'Failed to start a members session');
        },

        /**
         * @returns {{
         *   inboxLinks?: {
         *     desktop: string;
         *     android: string;
         *     provider: 'gmail' | 'yahoo' | 'outlook' | 'proton' | 'icloud' | 'hey' | 'aol' | 'mailru';
         *   };
         *   otc_ref?: string;
         * }}
         */
        async sendMagicLink({
            email, emailType, labels, name, oldEmail, newsletters,
            redirect, integrityToken, phonenumber, customUrlHistory,
            token, autoRedirect = true, includeOTC
        }) {
            const url = endpointFor({resource: 'send-magic-link'});
            const body = {
                name, email, newsletters, oldEmail, emailType, labels,
                requestSrc: 'portal', redirect, integrityToken,
                honeypot: phonenumber, token, autoRedirect, includeOTC,
                urlHistory: customUrlHistory ?? getUrlHistory()
            };

            // Remove urlHistory if falsy
            if (!body.urlHistory) {
                delete body.urlHistory;
            }

            const res = await makeJsonRequest({url, method: 'POST', body: JSON.stringify(body)});

            if (!res.ok) {
                await throwHumanReadableOrDefault(res, 'Failed to send magic link email');
            }

            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return await res.json();
                } catch (_) {
                    // fall through to response used pre-OTC
                }
            }
            return {};
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = endpointFor({resource: 'verify-otc'});
            const res = await makeJsonRequest({
                url,
                method: 'POST',
                body: JSON.stringify({otc, otcRef, redirect, integrityToken})
            });

            if (res.ok) {
                return res.json();
            }
            await throwHumanReadableOrDefault(res, 'Failed to verify code');
        },

        signout(all = false) {
            const url = endpointFor({resource: 'session'});
            return makeJsonRequest({
                url,
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
            const url = endpointFor({resource: 'member/newsletters'}) + `?uuid=${uuid}&key=${key}`;
            return makeRequest({url, credentials: 'same-origin'}).then(res =>
                (!res.ok || res.status === 204) ? null : res.json()
            );
        },

        updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = endpointFor({resource: 'member/newsletters'}) + `?uuid=${uuid}&key=${key}`;
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
            const identity = await getIdentity();
            const url = endpointFor({resource: 'member/email'});

            return makeJsonRequest({
                url,
                method: 'POST',
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
            plan, tierId, cadence, cancelUrl, successUrl,
            email: customerEmail, name, offerId, newsletters, metadata = {}
        } = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await getIdentity();
            const url = endpointFor({resource: 'create-stripe-checkout-session'});

            if (!cancelUrl) {
                const cancelUrlObj = resolveUrl(window.location.href, siteUrl);
                cancelUrlObj.searchParams.set('stripe', 'cancel');
                cancelUrl = cancelUrlObj.href;
            }

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
                    fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
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

            const res = await makeJsonRequest({url, method: 'POST', body: JSON.stringify(body)});

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
            const identity = await getIdentity();
            const url = endpointFor({resource: 'create-stripe-checkout-session'});

            const res = await makeJsonRequest({
                url,
                method: 'POST',
                body: JSON.stringify({
                    identity,
                    successUrl,
                    cancelUrl,
                    type: 'donation',
                    personalNote,
                    metadata: {
                        fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
                        urlHistory: getUrlHistory(),
                        ...metadata
                    }
                })
            });

            const responseJson = await res.json();

            if (!res.ok) {
                throw responseJson?.errors?.[0] ?? new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await getIdentity();
            const url = endpointFor({resource: 'create-stripe-update-session'});

            if (!successUrl) {
                successUrl = buildStripeUrl(siteUrl, 'stripe', 'billing-update-success');
            }

            if (!cancelUrl) {
                cancelUrl = resolveUrl(window.location.href, siteUrl);
                cancelUrl.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = cancelUrl.href;
            }

            const res = await makeJsonRequest({
                url,
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
            const url = endpointFor({resource: 'create-stripe-billing-portal-session'});

            if (!returnUrl) {
                returnUrl = buildStripeUrl(siteUrl, 'stripe', 'billing-portal-closed');
            }

            const res = await makeJsonRequest({
                url,
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
            const url = endpointFor({resource: 'subscriptions'}) + subscriptionId + '/';
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

            return makeJsonRequest({url, method: 'PUT', body: JSON.stringify(body)});
        },

        async offers() {
            const identity = await getIdentity();
            const url = endpointFor({resource: 'member/offers'});

            try {
                const res = await makeJsonRequest({url, method: 'POST', body: JSON.stringify({identity})});
                return res.ok ? res.json() : {offers: []};
            } catch (_) {
                return {offers: []};
            }
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await getIdentity();
            const url = endpointFor({resource: `subscriptions/${subscriptionId}/apply-offer`});

            const res = await makeJsonRequest({
                url,
                method: 'POST',
                body: JSON.stringify({identity, offer_id: offerId})
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }

            return true;
        }
    };

    // ─── Init ─────────────────────────────────────────────────────────────────

    api.init = async () => {
        const member = await api.member.sessionData();
        let site = {};
        let offers = [];

        try {
            const [{settings}, {tiers}, {newsletters}] = await Promise.all([
                api.site.settings(),
                api.site.tiers(),
                api.site.newsletters()
            ]);
            site = transformApiSiteData({
                site: {
                    ...settings,
                    newsletters,
                    tiers: transformApiTiersData({tiers})
                }
            });
        } catch (_) {
            // Ignore
        }

        if (member?.paid) {
            try {
                const offersData = await api.member.offers();
                offers = offersData.offers || [];
            } catch (e) {
                console.warn('[Portal] Failed to load member offers:', e);
            }
        }

        return {site, member, offers};
    };

    return api;
}

export default setupGhostApi;
```

Key refactoring improvements:

1. **Extracted shared constants**: `JSON_HEADERS` constant eliminates repeated header objects across all requests.

2. **Consolidated helper functions**:
   - `makeJsonRequest` wraps `makeRequest` with JSON headers automatically
   - `parseJsonResponse` handles the common ok/error response pattern
   - `throwHumanReadableOrDefault` centralises the `HumanReadableError` pattern
   - `getIdentity` wraps `api.member.identity()` to avoid repeated `api.member` references
   - `buildStripeUrl` and `resolveUrl` reduce URL construction duplication
   - `stripTrailingSlash` replaces repeated inline regex

3. **Simplified `endpointFor`**: Removed the unused `type` parameter since it was always `'members'`.

4. **Collapsed `makeContentRequest`**: The five near-identical `api.site` methods now delegate to a single helper.

5. **Flattened async chains**: Replaced `.then().then().catch()` chains with `async/await` for readability (e.g. `checkoutPlan`, `editBilling`, `manageBilling`).

6. **Simplified `api.init`**: Removed redundant intermediate variables and inlined the `transformApiSiteData` call.

7. **Removed redundant `.catch(err => { throw err })`** blocks that added no value.