Here's the refactored code with reduced complexity through several improvements:

```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

const JSON_HEADERS = {'Content-Type': 'application/json'};

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    // URL Helpers
    const stripTrailingSlash = url => url.replace(/\/$/, '');

    function endpointFor({type, resource}) {
        if (type === 'members') {
            return `${stripTrailingSlash(siteUrl)}/${apiPath}/${resource}/`;
        }
    }

    function contentEndpointFor({resource, params = {}}) {
        if (!apiUrl || !apiKey) {
            return '';
        }
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${stripTrailingSlash(apiUrl)}/${resource}/?${searchParams}`;
    }

    function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
        return fetch(url, {method, headers, credentials, body});
    }

    // Response Handlers
    async function handleJsonResponse(res, errorMessage) {
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    }

    async function handleHumanReadableError(res, fallbackMessage) {
        const humanError = await HumanReadableError.fromApiResponse(res);
        throw humanError ?? new Error(fallbackMessage);
    }

    // Request Helpers
    async function getRequest({url, credentials}) {
        return makeRequest({url, method: 'GET', headers: JSON_HEADERS, credentials});
    }

    async function postRequest({url, body, credentials}) {
        return makeRequest({url, method: 'POST', headers: JSON_HEADERS, credentials, body: JSON.stringify(body)});
    }

    async function putRequest({url, body, credentials}) {
        return makeRequest({url, method: 'PUT', headers: JSON_HEADERS, credentials, body: JSON.stringify(body)});
    }

    async function fetchContentResource({resource, params, errorMessage = 'Failed to fetch site data'}) {
        const url = contentEndpointFor({resource, params});
        const res = await getRequest({url});
        return handleJsonResponse(res, errorMessage);
    }

    // Stripe Helpers
    function redirectToStripeCheckout(responseBody) {
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        return stripe.redirectToCheckout({sessionId: responseBody.sessionId})
            .then(({error}) => {
                if (error) {
                    throw new Error(error.message);
                }
            });
    }

    function buildCancelUrl(siteUrlObj) {
        const cancelUrl = window.location.href.startsWith(siteUrlObj.href)
            ? new URL(window.location.href)
            : new URL(siteUrl);
        cancelUrl.searchParams.set('stripe', 'cancel');
        return cancelUrl.href;
    }

    function buildFpMetadata(extra = {}) {
        return {
            fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
            urlHistory: getUrlHistory(),
            ...extra
        };
    }

    const api = {};

    api.site = {
        read: () => getRequest({url: endpointFor({type: 'members', resource: 'site'})})
            .then(res => handleJsonResponse(res, 'Failed to fetch site data')),

        newsletters: () => fetchContentResource({resource: 'newsletters', params: {limit: 100}}),

        tiers: () => fetchContentResource({
            resource: 'tiers',
            params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
        }),

        settings: () => fetchContentResource({resource: 'settings'}),

        offer: ({offerId}) => fetchContentResource({
            resource: `offers/${offerId}`,
            errorMessage: 'Failed to fetch offer data'
        }),

        recommendations: ({limit = 100} = {}) => fetchContentResource({
            resource: 'recommendations',
            params: {limit},
            errorMessage: 'Failed to fetch recommendations'
        })
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }

            const res = await postRequest({
                url,
                body: {feedback: [{post_id: postId, score}]},
                credentials: 'same-origin'
            });

            if (res.ok) {
                return res.json();
            }
            throw (await HumanReadableError.fromApiResponse(res)) ?? new Error('Failed to save feedback');
        }
    };

    api.recommendations = {
        trackClicked: ({recommendationId}) =>
            navigator.sendBeacon(endpointFor({type: 'members', resource: `recommendations/${recommendationId}/clicked`})),

        trackSubscribed: ({recommendationId}) =>
            navigator.sendBeacon(endpointFor({type: 'members', resource: `recommendations/${recommendationId}/subscribed`}))
    };

    api.member = {
        async identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            const res = await makeRequest({url, credentials: 'same-origin'});
            return (!res.ok || res.status === 204) ? null : res.text();
        },

        async sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            const res = await makeRequest({url, credentials: 'same-origin'});
            return (!res.ok || res.status === 204) ? null : res.json();
        },

        async update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            const res = await putRequest({url, body, credentials: 'same-origin'});
            return res.ok ? res.json() : null;
        },

        async deleteSuppression() {
            const url = endpointFor({type: 'members', resource: 'member/suppression'});
            const res = await makeRequest({url, method: 'DELETE'});
            if (!res.ok) {
                throw new Error('Your email has failed to resubscribe, please try again');
            }
            return true;
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

            const res = await postRequest({url, body});

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
            const res = await postRequest({url, body: {otc, otcRef, redirect, integrityToken}});

            if (res.ok) {
                return res.json();
            }
            await handleHumanReadableError(res, 'Failed to verify code');
        },

        async signout(all = false) {
            const url = endpointFor({type: 'members', resource: 'session'});
            const res = await makeRequest({
                url, method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({all})
            });
            if (res.ok) {
                window.location.replace(siteUrl);
                return 'Success';
            }
            throw new Error('Failed to signout');
        },

        async newsletters({uuid, key}) {
            const url = endpointFor({type: 'members', resource: 'member/newsletters'}) + `?uuid=${uuid}&key=${key}`;
            const res = await makeRequest({url, credentials: 'same-origin'});
            return (!res.ok || res.status === 204) ? null : res.json();
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member/newsletters'}) + `?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            const res = await putRequest({url, body});
            if (res.ok) {
                return res.json();
            }
            throw new Error('Failed to update email preferences');
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/email'});
            const res = await postRequest({url, body: {email, identity}});

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

            const resolvedCancelUrl = cancelUrl ?? (() => {
                const url = buildCancelUrl(siteUrlObj);
                return url;
            })();

            const body = {
                priceId: offerId ? null : plan,
                offerId,
                identity,
                metadata: buildFpMetadata({name, newsletters: JSON.stringify(newsletters), requestSrc: 'portal', ...metadata}),
                successUrl,
                cancelUrl: resolvedCancelUrl,
                ...(customerEmail && {customerEmail}),
                ...(tierId && cadence && {tierId: offerId ? null : tierId, cadence: offerId ? null : cadence})
            };

            if (tierId && cadence) {
                delete body.priceId;
            }

            const res = await postRequest({url, body});
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData?.errors?.[0]?.message || 'Failed to signup, please try again.');
            }

            return redirectToStripeCheckout(await res.json());
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'});

            const response = await postRequest({
                url,
                body: {
                    identity,
                    metadata: buildFpMetadata(metadata),
                    successUrl, cancelUrl,
                    type: 'donation',
                    personalNote
                }
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
            const url = endpointFor({type: 'members', resource: 'create-stripe-update-session'});

            if (!successUrl) {
                const successUrlObj = new URL(siteUrl);
                successUrlObj.searchParams.set('stripe', 'billing-update-success');
                successUrl = successUrlObj.href;
            }

            if (!cancelUrl) {
                cancelUrl = buildCancelUrl(siteUrlObj).replace('stripe=cancel', 'stripe=billing-update-cancel');
            }

            const res = await postRequest({
                url,
                body: {identity, subscription_id: subscriptionId, successUrl, cancelUrl}
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
            const url = endpointFor({type: 'members', resource: 'create-stripe-billing-portal-session'});

            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const res = await postRequest({
                url,
                body: {identity, subscription_id: subscriptionId, returnUrl}
            });

            if (!res.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }

            const result = await res.json();
            return window.location.assign(result.url);
        },

        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'subscriptions'}) + subscriptionId + '/';
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

            return putRequest({url, body});
        },

        async offers() {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/offers'});

            try {
                const res = await postRequest({url, body: {identity}});
                return res.ok ? res.json() : {offers: []};
            } catch {
                return {offers: []};
            }
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer`});

            const res = await postRequest({url, body: {identity, offer_id: offerId}});
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
            site = {...settings, newsletters, tiers: transformApiTiersData({tiers})};
        } catch {
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

        return {site: transformApiSiteData({site}), member, offers};
    };

    return api;
}

export default setupGhostApi;
```

Key refactoring improvements:

1. **Extracted shared constants**: `JSON_HEADERS` constant eliminates repeated header objects across all requests.

2. **Created HTTP method helpers**: `getRequest`, `postRequest`, and `putRequest` wrap `makeRequest` with sensible defaults, reducing boilerplate in every API call.

3. **Extracted `fetchContentResource`**: Consolidates the repeated pattern of building a content URL, making a GET request, and handling the JSON response used across `site.*` methods.

4. **Extracted `handleJsonResponse` and `handleHumanReadableError`**: Centralizes the two common response-handling patterns, reducing duplication.

5. **Extracted Stripe helpers**: `redirectToStripeCheckout`, `buildCancelUrl`, and `buildFpMetadata` eliminate duplicated Stripe-related logic across `checkoutPlan`, `checkoutDonation`, and `editBilling`.

6. **Converted `.then()` chains to `async/await`**: Methods like `signout`, `deleteSuppression`, `updateNewsletters`, and `editBilling` are now cleaner and easier to follow.

7. **Removed redundant `.catch(err => { throw err })`**: These were no-ops and have been removed.

8. **Simplified `api.init`**: Removed unnecessary variable declarations and used optional chaining (`member?.paid`).

9. **Simplified `stripTrailingSlash`**: Extracted as a named helper to avoid repeating the regex.