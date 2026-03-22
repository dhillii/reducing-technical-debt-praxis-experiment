# Refactored Ghost API

Here's my analysis of the complexity issues and the refactored code:

**Key problems identified:**
1. Massive repeated boilerplate for GET requests with JSON headers
2. Inconsistent error handling patterns mixed throughout
3. `api.member` is a monolithic object with 15+ methods
4. Stripe-related logic embedded in member methods
5. Redundant `.catch(err => { throw err })` chains
6. URL construction logic scattered across methods

```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

// ─── Constants ───────────────────────────────────────────────────────────────

const API_PATH = 'members/api';
const JSON_HEADERS = {'Content-Type': 'application/json'};

// ─── URL Builders ────────────────────────────────────────────────────────────

function buildMembersUrl(siteUrl, resource) {
    return `${siteUrl.replace(/\/$/, '')}/${API_PATH}/${resource}/`;
}

function buildContentUrl(apiUrl, apiKey, resource, params = {}) {
    if (!apiUrl || !apiKey) {
        return '';
    }
    const searchParams = new URLSearchParams({...params, key: apiKey});
    return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
}

function buildStripeReturnUrl(siteUrl, stripeParam) {
    const url = new URL(siteUrl);
    url.searchParams.set('stripe', stripeParam);
    return url.href;
}

function buildCancelUrl(siteUrl) {
    const base = window.location.href.startsWith(new URL(siteUrl).href)
        ? new URL(window.location.href)
        : new URL(siteUrl);
    base.searchParams.set('stripe', 'cancel');
    return base.href;
}

// ─── Request Helpers ─────────────────────────────────────────────────────────

function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
    return fetch(url, {method, headers, credentials, body});
}

async function getJson(url, options = {}) {
    const res = await makeRequest({url, headers: JSON_HEADERS, ...options});
    if (res.ok) {
        return res.json();
    }
    throw new Error(options.errorMessage ?? 'Request failed');
}

async function handleHumanReadableError(res, fallbackMessage) {
    const humanError = await HumanReadableError.fromApiResponse(res);
    throw humanError ?? new Error(fallbackMessage);
}

async function parseErrorMessage(res, fallback) {
    const errData = await res.json();
    return errData?.errors?.[0]?.message || fallback;
}

// ─── Stripe Helpers ──────────────────────────────────────────────────────────

function redirectViaStripe(responseBody) {
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

function buildFingerprintId() {
    return (window.FPROM || window.$FPROM)?.data?.tid;
}

// ─── Main Factory ─────────────────────────────────────────────────────────────

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const membersUrl = (resource) => buildMembersUrl(siteUrl, resource);
    const contentUrl = (resource, params) => buildContentUrl(apiUrl, apiKey, resource, params);

    // ── Site API ─────────────────────────────────────────────────────────────

    const site = {
        read: () => getJson(membersUrl('site'), {errorMessage: 'Failed to fetch site data'}),

        newsletters: () => getJson(
            contentUrl('newsletters', {limit: 100}),
            {errorMessage: 'Failed to fetch site data'}
        ),

        tiers: () => getJson(
            contentUrl('tiers', {limit: 100, include: 'monthly_price,yearly_price,benefits'}),
            {errorMessage: 'Failed to fetch site data'}
        ),

        settings: () => getJson(
            contentUrl('settings'),
            {errorMessage: 'Failed to fetch site data'}
        ),

        offer: ({offerId}) => getJson(
            contentUrl(`offers/${offerId}`),
            {errorMessage: 'Failed to fetch offer data'}
        ),

        recommendations: ({limit = 100} = {}) => getJson(
            contentUrl('recommendations', {limit}),
            {errorMessage: 'Failed to fetch recommendations'}
        )
    };

    // ── Feedback API ──────────────────────────────────────────────────────────

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
            await handleHumanReadableError(res, 'Failed to save feedback');
        }
    };

    // ── Recommendations API ───────────────────────────────────────────────────

    const recommendations = {
        trackClicked: ({recommendationId}) =>
            navigator.sendBeacon(membersUrl(`recommendations/${recommendationId}/clicked`)),

        trackSubscribed: ({recommendationId}) =>
            navigator.sendBeacon(membersUrl(`recommendations/${recommendationId}/subscribed`))
    };

    // ── Member Core ───────────────────────────────────────────────────────────

    const memberCore = {
        identity() {
            return makeRequest({url: membersUrl('session'), credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.text());
        },

        sessionData() {
            return makeRequest({url: membersUrl('member'), credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.json());
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
            }).then(res => res.ok ? res.json() : null);
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
            await handleHumanReadableError(res, 'Failed to start a members session');
        }
    };

    // ── Member Auth ───────────────────────────────────────────────────────────

    const memberAuth = {
        /**
         * @returns {{
         *   inboxLinks?: { desktop: string; android: string;
         *     provider: 'gmail'|'yahoo'|'outlook'|'proton'|'icloud'|'hey'|'aol'|'mailru' };
         *   otc_ref?: string;
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

            const res = await makeRequest({
                url: membersUrl('send-magic-link'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                await handleHumanReadableError(res, 'Failed to send magic link email');
            }

            const contentType = (res.headers.get('content-type') || '').toLowerCase();
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
            await handleHumanReadableError(res, 'Failed to verify code');
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
        }
    };

    // ── Member Newsletters ────────────────────────────────────────────────────

    const memberNewsletters = {
        newsletters({uuid, key}) {
            const url = membersUrl('member/newsletters') + `?uuid=${uuid}&key=${key}`;
            return makeRequest({url, credentials: 'same-origin'})
                .then(res => (!res.ok || res.status === 204) ? null : res.json());
        },

        updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = membersUrl('member/newsletters') + `?uuid=${uuid}&key=${key}`;
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
            const identity = await memberCore.identity();
            const res = await makeRequest({
                url: membersUrl('member/email'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({email, identity})
            });

            if (res.ok) {
                return 'Success';
            }
            const message = await parseErrorMessage(res, 'Failed to send email address verification email');
            throw new Error(message);
        }
    };

    // ── Member Billing ────────────────────────────────────────────────────────

    const memberBilling = {
        async checkoutPlan({
            plan, tierId, cadence, cancelUrl, successUrl,
            email: customerEmail, name, offerId, newsletters, metadata = {}
        } = {}) {
            const identity = await memberCore.identity();

            const body = {
                priceId: offerId ? null : plan,
                offerId,
                identity,
                successUrl,
                cancelUrl: cancelUrl ?? buildCancelUrl(siteUrl),
                metadata: {
                    name,
                    newsletters: JSON.stringify(newsletters),
                    requestSrc: 'portal',
                    fp_tid: buildFingerprintId(),
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

            const res = await makeRequest({
                url: membersUrl('create-stripe-checkout-session'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const message = await parseErrorMessage(res, 'Failed to signup, please try again.');
                throw new Error(message);
            }

            return redirectViaStripe(await res.json());
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await memberCore.identity();

            const response = await makeRequest({
                url: membersUrl('create-stripe-checkout-session'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    identity,
                    successUrl,
                    cancelUrl,
                    type: 'donation',
                    personalNote,
                    metadata: {
                        fp_tid: buildFingerprintId(),
                        urlHistory: getUrlHistory(),
                        ...metadata
                    }
                })
            });

            const responseJson = await response.json();

            if (!response.ok) {
                throw responseJson?.errors?.[0] ?? new Error(
                    "We're unable to process your payment right now. Please try again later."
                );
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const identity = await memberCore.identity();
            const siteUrlObj = new URL(siteUrl);

            const resolvedSuccessUrl = successUrl ?? buildStripeReturnUrl(siteUrl, 'billing-update-success');
            const resolvedCancelUrl = cancelUrl ?? (() => {
                const base = window.location.href.startsWith(siteUrlObj.href)
                    ? new URL(window.location.href)
                    : new URL(siteUrl);
                base.searchParams.set('stripe', 'billing-update-cancel');
                return base.href;
            })();

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

            const result = await res.json();
            const redirectResult = await window.Stripe(result.publicKey)
                .redirectToCheckout({sessionId: result.sessionId});

            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        },

        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await memberCore.identity();

            const res = await makeRequest({
                url: membersUrl('create-stripe-billing-portal-session'),
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    identity,
                    subscription_id: subscriptionId,
                    returnUrl: returnUrl ?? buildStripeReturnUrl(siteUrl, 'billing-portal-closed')
                })
            });

            if (!res.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }

            const result = await res.json();
            return window.location.assign(result.url);
        },

        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await memberCore.identity();
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
                url: membersUrl('subscriptions') + subscriptionId + '/',
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify(body)
            });
        }
    };

    // ── Member Offers ─────────────────────────────────────────────────────────

    const memberOffers = {
        async offers() {
            const identity = await memberCore.identity();
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
            const identity = await memberCore.identity();
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

    // ── Compose API ───────────────────────────────────────────────────────────

    const member = {
        ...memberCore,
        ...memberAuth,
        ...memberNewsletters,
        ...memberBilling,
        ...memberOffers
    };

    // ── Init ──────────────────────────────────────────────────────────────────

    async function init() {
        const [memberData] = await Promise.all([member.sessionData()]);

        let site = {};
        let offers = [];

        try {
            const [{settings}, {tiers}, {newsletters}] = await Promise.all([
                api.site.settings(),
                api.site.tiers(),
                api.site.newsletters()
            ]);
            site = {...settings, newsletters, tiers: transformApiTiersData({tiers})};
        } catch {
            // Ignore — site data is non-critical
        }

        if (memberData?.paid) {
            try {
                const offersData = await member.offers();
                offers = offersData.offers || [];
            } catch (e) {
                console.warn('[Portal] Failed to load member offers:', e);
            }
        }

        return {site: transformApiSiteData({site}), member: memberData, offers};
    }

    const api = {site, feedback, recommendations, member, init};
    return api;
}

export default setupGhostApi;
```

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| Repeated GET boilerplate (6× identical pattern) | `getJson()` helper absorbs method, headers, and error throwing |
| Scattered error handling | `handleHumanReadableError()` and `parseErrorMessage()` centralize the two error patterns |
| Monolithic `api.member` (15 methods, ~300 lines) | Split into `memberCore`, `memberAuth`, `memberNewsletters`, `memberBilling`, `memberOffers` — composed via spread |
| Stripe redirect logic duplicated | `redirectViaStripe()` and `buildFingerprintId()` extracted |
| URL construction inline everywhere | `buildMembersUrl`, `buildContentUrl`, `buildStripeReturnUrl`, `buildCancelUrl` at module level |
| Redundant `.catch(err => { throw err })` | Removed — rethrowing without transformation is a no-op |
| `JSON_HEADERS` repeated 20+ times | Single constant at module level |