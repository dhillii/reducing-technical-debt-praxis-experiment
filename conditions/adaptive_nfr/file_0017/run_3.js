# Refactored Ghost API

Here's my analysis of the complexity issues and the refactored solution:

**Key problems identified:**
1. Massive repeated boilerplate for HTTP requests and response handling
2. `api.member` is a monolithic object with 15+ methods
3. Inconsistent async patterns (mixed `.then()` and `async/await`)
4. Duplicated error handling logic
5. URL construction scattered throughout
6. `checkoutPlan` and `editBilling` do too much (URL building + Stripe redirect)

```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

// ─── Constants ───────────────────────────────────────────────────────────────

const API_PATH = 'members/api';
const JSON_HEADERS = {'Content-Type': 'application/json'};

// ─── Low-level helpers ────────────────────────────────────────────────────────

function stripTrailingSlash(url) {
    return url.replace(/\/$/, '');
}

function buildMembersUrl(siteUrl, resource) {
    return `${stripTrailingSlash(siteUrl)}/${API_PATH}/${resource}/`;
}

function buildContentUrl(apiUrl, apiKey, resource, params = {}) {
    if (!apiUrl || !apiKey) {
        return '';
    }
    const searchParams = new URLSearchParams({...params, key: apiKey});
    return `${stripTrailingSlash(apiUrl)}/${resource}/?${searchParams}`;
}

function fetchFpTid() {
    return (window.FPROM || window.$FPROM)?.data?.tid;
}

// ─── Request / response primitives ───────────────────────────────────────────

async function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
    return fetch(url, {method, headers, credentials, body});
}

async function fetchJson(url, options = {}) {
    const res = await makeRequest({url, ...options});
    if (res.ok) {
        return res.json();
    }
    throw new Error(options.errorMessage ?? 'Request failed');
}

async function fetchJsonOrNull(url, options = {}) {
    const res = await makeRequest({url, ...options});
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.json();
}

/**
 * Throws a HumanReadableError when available, otherwise throws a generic Error.
 */
async function throwApiError(res, fallbackMessage) {
    throw (await HumanReadableError.fromApiResponse(res)) ?? new Error(fallbackMessage);
}

// ─── Stripe helpers ───────────────────────────────────────────────────────────

async function redirectViaStripe({publicKey, sessionId}) {
    const stripe = window.Stripe(publicKey);
    const result = await stripe.redirectToCheckout({sessionId});
    if (result.error) {
        throw new Error(result.error.message);
    }
}

function buildCancelUrl(siteUrl, paramValue) {
    const siteUrlObj = new URL(siteUrl);
    const base = window.location.href.startsWith(siteUrlObj.href)
        ? new URL(window.location.href)
        : new URL(siteUrl);
    base.searchParams.set('stripe', paramValue);
    return base.href;
}

function buildSuccessUrl(siteUrl, paramValue) {
    const url = new URL(siteUrl);
    url.searchParams.set('stripe', paramValue);
    return url.href;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    // Bound URL builders
    const membersUrl = (resource) => buildMembersUrl(siteUrl, resource);
    const contentUrl = (resource, params) => buildContentUrl(apiUrl, apiKey, resource, params);

    // ── site ────────────────────────────────────────────────────────────────

    const site = {
        read() {
            return fetchJson(membersUrl('site'), {
                headers: JSON_HEADERS,
                errorMessage: 'Failed to fetch site data'
            });
        },

        newsletters() {
            return fetchJson(contentUrl('newsletters', {limit: 100}), {
                headers: JSON_HEADERS,
                errorMessage: 'Failed to fetch site data'
            });
        },

        tiers() {
            return fetchJson(
                contentUrl('tiers', {limit: 100, include: 'monthly_price,yearly_price,benefits'}),
                {headers: JSON_HEADERS, errorMessage: 'Failed to fetch site data'}
            );
        },

        settings() {
            return fetchJson(contentUrl('settings'), {
                headers: JSON_HEADERS,
                errorMessage: 'Failed to fetch site data'
            });
        },

        offer({offerId}) {
            return fetchJson(contentUrl(`offers/${offerId}`), {
                headers: JSON_HEADERS,
                errorMessage: 'Failed to fetch offer data'
            });
        },

        recommendations({limit = 100} = {}) {
            return fetchJson(contentUrl('recommendations', {limit}), {
                headers: JSON_HEADERS,
                errorMessage: 'Failed to fetch recommendations'
            });
        }
    };

    // ── feedback ─────────────────────────────────────────────────────────────

    const feedback = {
        async add({uuid, key, postId, score}) {
            let url = membersUrl('feedback');
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: JSON_HEADERS,
                credentials: 'same-origin',
                body: JSON.stringify({feedback: [{post_id: postId, score}]})
            });

            if (res.ok) {
                return res.json();
            }
            await throwApiError(res, 'Failed to save feedback');
        }
    };

    // ── recommendations ───────────────────────────────────────────────────────

    const recommendations = {
        trackClicked({recommendationId}) {
            navigator.sendBeacon(membersUrl(`recommendations/${recommendationId}/clicked`));
        },

        trackSubscribed({recommendationId}) {
            navigator.sendBeacon(membersUrl(`recommendations/${recommendationId}/subscribed`));
        }
    };

    // ── member ────────────────────────────────────────────────────────────────

    const member = {
        identity() {
            return makeRequest({url: membersUrl('session'), credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204 ? null : res.text()));
        },

        sessionData() {
            return fetchJsonOrNull(membersUrl('member'), {credentials: 'same-origin'});
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return makeRequest({
                url: membersUrl('member'),
                method: 'PUT',
                headers: JSON_HEADERS,
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }).then(res => (res.ok ? res.json() : null));
        },

        deleteSuppression() {
            return makeRequest({url: membersUrl('member/suppression'), method: 'DELETE'})
                .then(res => {
                    if (!res.ok) {
                        throw new Error('Your email has failed to resubscribe, please try again');
                    }
                    return true;
                });
        },

        async getIntegrityToken() {
            const res = await makeRequest({url: membersUrl('integrity-token')});
            if (res.ok) {
                return res.text();
            }
            await throwApiError(res, 'Failed to start a members session');
        },

        /**
         * @returns {{
         *   inboxLinks?: {
         *     desktop: string; android: string;
         *     provider: 'gmail'|'yahoo'|'outlook'|'proton'|'icloud'|'hey'|'aol'|'mailru';
         *   };
         *   otc_ref?: string;
         * }}
         */
        async sendMagicLink({
            email, emailType, labels, name, oldEmail, newsletters,
            redirect, integrityToken, phonenumber, customUrlHistory,
            token, autoRedirect = true, includeOTC
        }) {
            const urlHistory = customUrlHistory ?? getUrlHistory();
            const body = {
                name, email, newsletters, oldEmail, emailType, labels,
                requestSrc: 'portal', redirect, integrityToken,
                honeypot: phonenumber, token, autoRedirect, includeOTC,
                ...(urlHistory && {urlHistory})
            };

            const res = await makeRequest({
                url: membersUrl('send-magic-link'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                await throwApiError(res, 'Failed to send magic link email');
            }

            const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
            if (contentType.includes('application/json')) {
                try {
                    return await res.json();
                } catch (_) {
                    // fall through to pre-OTC response
                }
            }
            return {};
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const res = await makeRequest({
                url: membersUrl('verify-otc'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({otc, otcRef, redirect, integrityToken})
            });

            if (res.ok) {
                return res.json();
            }
            await throwApiError(res, 'Failed to verify code');
        },

        signout(all = false) {
            return makeRequest({
                url: membersUrl('session'),
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
            const url = `${membersUrl('member/newsletters')}?uuid=${uuid}&key=${key}`;
            return fetchJsonOrNull(url, {credentials: 'same-origin'});
        },

        updateNewsletters({uuid, newsletters: nl, key, enableCommentNotifications}) {
            const url = `${membersUrl('member/newsletters')}?uuid=${uuid}&key=${key}`;
            const body = {newsletters: nl};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            return fetchJson(url, {
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify(body),
                errorMessage: 'Failed to update email preferences'
            });
        },

        async updateEmailAddress({email}) {
            const identity = await member.identity();
            const res = await makeRequest({
                url: membersUrl('member/email'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({email, identity})
            });

            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            throw new Error(
                errData?.errors?.[0]?.message ?? 'Failed to send email address verification email'
            );
        },

        async checkoutPlan({
            plan, tierId, cadence, cancelUrl, successUrl,
            email: customerEmail, name, offerId, newsletters, metadata = {}
        } = {}) {
            const identity = await member.identity();

            const resolvedCancelUrl = cancelUrl ?? buildCancelUrl(siteUrl, 'cancel');
            const metadataObj = {
                name,
                newsletters: JSON.stringify(newsletters),
                requestSrc: 'portal',
                fp_tid: fetchFpTid(),
                urlHistory: getUrlHistory(),
                ...metadata
            };

            const body = {
                priceId: offerId ? null : plan,
                offerId,
                identity,
                metadata: metadataObj,
                successUrl,
                cancelUrl: resolvedCancelUrl,
                ...(customerEmail && {customerEmail}),
                ...(tierId && cadence && {
                    tierId: offerId ? null : tierId,
                    cadence: offerId ? null : cadence
                })
            };

            const res = await makeRequest({
                url: membersUrl('create-stripe-checkout-session'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData?.errors?.[0]?.message ?? 'Failed to signup, please try again.');
            }

            const responseBody = await res.json();

            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            return redirectViaStripe(responseBody);
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await member.identity();
            const body = {
                identity,
                metadata: {fp_tid: fetchFpTid(), urlHistory: getUrlHistory(), ...metadata},
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote
            };

            const response = await makeRequest({
                url: membersUrl('create-stripe-checkout-session'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });

            const responseJson = await response.json();

            if (!response.ok) {
                throw responseJson?.errors?.[0]
                    ?? new Error("We're unable to process your payment right now. Please try again later.");
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const identity = await member.identity();

            const resolvedSuccessUrl = successUrl ?? buildSuccessUrl(siteUrl, 'billing-update-success');
            const resolvedCancelUrl = cancelUrl ?? buildCancelUrl(siteUrl, 'billing-update-cancel');

            const res = await makeRequest({
                url: membersUrl('create-stripe-update-session'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    identity,
                    subscription_id: subscriptionId,
                    successUrl: resolvedSuccessUrl,
                    cancelUrl: resolvedCancelUrl
                })
            });

            if (!res.ok) {
                throw new Error('Unable to create stripe checkout session');
            }

            return redirectViaStripe(await res.json());
        },

        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await member.identity();

            const resolvedReturnUrl = returnUrl ?? buildSuccessUrl(siteUrl, 'billing-portal-closed');

            const res = await makeRequest({
                url: membersUrl('create-stripe-billing-portal-session'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({identity, subscription_id: subscriptionId, returnUrl: resolvedReturnUrl})
            });

            if (!res.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }

            const result = await res.json();
            return window.location.assign(result.url);
        },

        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await member.identity();
            const body = {
                smart_cancel: smartCancel,
                cancel_at_period_end: cancelAtPeriodEnd,
                cancellation_reason: cancellationReason,
                identity,
                priceId: planId,
                ...(tierId && cadence && {tierId, cadence})
            };

            if (tierId && cadence) {
                delete body.priceId;
            }

            return makeRequest({
                url: `${membersUrl('subscriptions')}${subscriptionId}/`,
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });
        },

        async offers() {
            const identity = await member.identity();
            try {
                const res = await makeRequest({
                    url: membersUrl('member/offers'),
                    method: 'POST',
                    headers: JSON_HEADERS,
                    body: JSON.stringify({identity})
                });
                return res.ok ? res.json() : {offers: []};
            } catch {
                return {offers: []};
            }
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await member.identity();
            const res = await makeRequest({
                url: membersUrl(`subscriptions/${subscriptionId}/apply-offer`),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({identity, offer_id: offerId})
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }
            return true;
        }
    };

    // ── init ──────────────────────────────────────────────────────────────────

    async function init() {
        const [memberData] = await Promise.all([member.sessionData()]);

        let siteData = {};
        let offers = [];

        try {
            const [{settings}, {tiers}, {newsletters: nl}] = await Promise.all([
                site.settings(),
                site.tiers(),
                site.newsletters()
            ]);
            siteData = transformApiSiteData({
                site: {
                    ...settings,
                    newsletters: nl,
                    tiers: transformApiTiersData({tiers})
                }
            });
        } catch {
            // Non-fatal: proceed with empty site data
        }

        if (memberData?.paid) {
            try {
                const offersData = await member.offers();
                offers = offersData.offers ?? [];
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('[Portal] Failed to load member offers:', e);
            }
        }

        return {site: siteData, member: memberData, offers};
    }

    return {site, feedback, recommendations, member, init};
}

export default setupGhostApi;
```

## Summary of Changes

| Issue | Before | After |
|---|---|---|
| **HTTP boilerplate** | Repeated `makeRequest` + `.then(res => res.ok ? res.json() : throw)` in every method | `fetchJson` / `fetchJsonOrNull` helpers absorb the pattern |
| **Error handling** | Duplicated `HumanReadableError` checks inline | `throwApiError` centralises human-readable error promotion |
| **Async style** | Mixed `.then()` chains and `async/await` | Consistently `async/await`; `.then()` only where it reads more clearly |
| **URL construction** | `endpointFor` / `contentEndpointFor` called with verbose objects | `membersUrl(resource)` / `contentUrl(resource, params)` bound closures |
| **Stripe logic** | Inline in `checkoutPlan` / `editBilling` | Extracted to `redirectViaStripe`, `buildCancelUrl`, `buildSuccessUrl` |
| **`api.member` monolith** | Single giant object literal | Same structure, but each method is now shorter and self-contained |
| **`init` double transform** | `transformApiSiteData` called after building `site` object separately | Collapsed into one expression |
| **Redundant `.catch(err => { throw err })`** | Present in `editBilling` / `manageBilling` | Removed (no-op) |