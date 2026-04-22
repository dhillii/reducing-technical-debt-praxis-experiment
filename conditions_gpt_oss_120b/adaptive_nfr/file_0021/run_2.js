import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

/**
 * Perform a fetch request and return the raw response.
 */
function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
    return fetch(url, {
        method,
        headers,
        credentials,
        body
    });
}

/**
 * Resolve JSON response or throw a human‑readable error.
 */
async function resolveJson(res, fallbackMessage) {
    if (res.ok) {
        return res.json();
    }
    const humanError = HumanReadableError.fromApiResponse(res);
    if (humanError) {
        throw humanError;
    }
    throw new Error(fallbackMessage);
}

/**
 * Resolve text response or return null on empty/invalid response.
 */
async function resolveText(res) {
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.text();
}

/**
 * Resolve JSON response or return null on empty/invalid response.
 */
async function resolveJsonOrNull(res) {
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.json();
}

/**
 * Build endpoint URL for members API.
 */
function endpointFor({type, resource}, siteUrl, apiPath) {
    if (type === 'members') {
        return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
    }
    return '';
}

/**
 * Build content endpoint URL for Ghost content API.
 */
function contentEndpointFor({resource, params = {}}, apiUrl, apiKey) {
    if (apiUrl && apiKey) {
        const searchParams = new URLSearchParams({
            ...params,
            key: apiKey
        });
        return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams}`;
    }
    return '';
}

/**
 * Common GET JSON request.
 */
async function getJson(url, errorMessage) {
    const res = await makeRequest({url});
    return resolveJson(res, errorMessage);
}

/**
 * Common POST JSON request.
 */
async function postJson(url, body, errorMessage) {
    const res = await makeRequest({
        url,
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    return resolveJson(res, errorMessage);
}

/**
 * Common PUT JSON request.
 */
async function putJson(url, body, errorMessage) {
    const res = await makeRequest({
        url,
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    return resolveJson(res, errorMessage);
}

/**
 * Common DELETE request.
 */
async function deleteRequest(url, errorMessage) {
    const res = await makeRequest({url, method: 'DELETE'});
    if (!res.ok) {
        throw new Error(errorMessage);
    }
    return true;
}

/**
 * Setup Ghost API client.
 */
function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';
    const api = {};

    // ---------- Site ----------
    api.site = {
        read: () => getJson(
            endpointFor({type: 'members', resource: 'site'}, siteUrl, apiPath),
            'Failed to fetch site data'
        ),
        newsletters: () => getJson(
            contentEndpointFor({resource: 'newsletters', params: {limit: 100}}, apiUrl, apiKey),
            'Failed to fetch site data'
        ),
        tiers: () => getJson(
            contentEndpointFor({resource: 'tiers', params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}}, apiUrl, apiKey),
            'Failed to fetch site data'
        ),
        settings: () => getJson(
            contentEndpointFor({resource: 'settings'}, apiUrl, apiKey),
            'Failed to fetch site data'
        ),
        offer: ({offerId}) => getJson(
            contentEndpointFor({resource: `offers/${offerId}`}, apiUrl, apiKey),
            'Failed to fetch offer data'
        ),
        recommendations: ({limit = 100} = {}) => getJson(
            contentEndpointFor({resource: 'recommendations', params: {limit}}, apiUrl, apiKey),
            'Failed to fetch recommendations'
        )
    };

    // ---------- Feedback ----------
    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'}, siteUrl, apiPath);
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const body = {feedback: [{post_id: postId, score}]};
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            const humanError = HumanReadableError.fromApiResponse(res);
            throw humanError ?? new Error('Failed to save feedback');
        }
    };

    // ---------- Recommendations ----------
    api.recommendations = {
        trackClicked: ({recommendationId}) => {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/clicked`}, siteUrl, apiPath);
            navigator.sendBeacon(url);
        },
        trackSubscribed: ({recommendationId}) => {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/subscribed`}, siteUrl, apiPath);
            navigator.sendBeacon(url);
        }
    };

    // ---------- Member ----------
    api.member = {
        identity: () => resolveText(
            makeRequest({
                url: endpointFor({type: 'members', resource: 'session'}, siteUrl, apiPath),
                credentials: 'same-origin'
            })
        ),
        sessionData: () => resolveJsonOrNull(
            makeRequest({
                url: endpointFor({type: 'members', resource: 'member'}, siteUrl, apiPath),
                credentials: 'same-origin'
            })
        ),
        update: ({name, subscribed, newsletters, enableCommentNotifications}) => {
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return putJson(
                endpointFor({type: 'members', resource: 'member'}, siteUrl, apiPath),
                body,
                'Failed to update member'
            );
        },
        deleteSuppression: () => deleteRequest(
            endpointFor({type: 'members', resource: 'member/suppression'}, siteUrl, apiPath),
            'Your email has failed to resubscribe, please try again'
        ),
        async getIntegrityToken() {
            const res = await makeRequest({
                url: endpointFor({type: 'members', resource: 'integrity-token'}, siteUrl, apiPath),
                method: 'GET'
            });
            if (res.ok) {
                return res.text();
            }
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error('Failed to start a members session');
        },
        async sendMagicLink({
            email,
            emailType,
            labels,
            name,
            oldEmail,
            newsletters,
            redirect,
            integrityToken,
            phonenumber,
            customUrlHistory,
            token,
            autoRedirect = true,
            includeOTC
        }) {
            const body = {
                name,
                email,
                newsletters,
                oldEmail,
                emailType,
                labels,
                requestSrc: 'portal',
                redirect,
                integrityToken,
                honeypot: phonenumber,
                token,
                autoRedirect,
                includeOTC
            };
            const urlHistory = customUrlHistory ?? getUrlHistory();
            if (urlHistory) {
                body.urlHistory = urlHistory;
            }
            const res = await postJson(
                endpointFor({type: 'members', resource: 'send-magic-link'}, siteUrl, apiPath),
                body,
                'Failed to send magic link email'
            );
            const contentType = (res.headers?.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                return res;
            }
            return {};
        },
        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const body = {otc, otcRef, redirect, integrityToken};
            return postJson(
                endpointFor({type: 'members', resource: 'verify-otc'}, siteUrl, apiPath),
                body,
                'Failed to verify code'
            );
        },
        signout: (all = false) => {
            const url = endpointFor({type: 'members', resource: 'session'}, siteUrl, apiPath);
            return makeRequest({
                url,
                method: 'DELETE',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({all})
            }).then(res => {
                if (res.ok) {
                    window.location.replace(siteUrl);
                    return 'Success';
                }
                throw new Error('Failed to signout');
            });
        },
        newsletters: async ({uuid, key}) => {
            const url = `${endpointFor({type: 'members', resource: 'member/newsletters'}, siteUrl, apiPath)}?uuid=${uuid}&key=${key}`;
            return resolveJsonOrNull(makeRequest({url, credentials: 'same-origin'}));
        },
        updateNewsletters: async ({uuid, newsletters, key, enableCommentNotifications}) => {
            const url = `${endpointFor({type: 'members', resource: 'member/newsletters'}, siteUrl, apiPath)}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return putJson(url, body, 'Failed to update email preferences');
        },
        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const body = {email, identity};
            const res = await postJson(
                endpointFor({type: 'members', resource: 'member/email'}, siteUrl, apiPath),
                body,
                'Failed to send email address verification email'
            );
            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            const errMsg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
            throw new Error(errMsg);
        },
        async checkoutPlan({
            plan,
            tierId,
            cadence,
            cancelUrl,
            successUrl,
            email: customerEmail,
            name,
            offerId,
            newsletters,
            metadata = {}
        } = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const endpoint = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'}, siteUrl, apiPath);

            if (!cancelUrl) {
                const base = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
                base.searchParams.set('stripe', 'cancel');
                cancelUrl = base.href;
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

            const res = await postJson(endpoint, body, 'Failed to create checkout session');
            const data = await res.json();

            if (data.url) {
                window.location.assign(data.url);
                return;
            }

            const stripe = window.Stripe(data.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: data.sessionId});
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        },
        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await api.member.identity();
            const endpoint = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'}, siteUrl, apiPath);
            const metadataObj = {
                fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
                urlHistory: getUrlHistory(),
                ...metadata
            };
            const body = {
                identity,
                metadata: metadataObj,
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote
            };
            const response = await postJson(endpoint, body, 'Failed to create donation checkout');
            const json = await response.json();

            if (!response.ok) {
                const error = json?.errors?.[0];
                if (error) {
                    throw error;
                }
                throw new Error('We\'re unable to process your payment right now. Please try again later.');
            }
            return json;
        },
        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const endpoint = endpointFor({type: 'members', resource: 'create-stripe-update-session'}, siteUrl, apiPath);

            if (!successUrl) {
                const success = new URL(siteUrl);
                success.searchParams.set('stripe', 'billing-update-success');
                successUrl = success.href;
            }
            if (!cancelUrl) {
                const cancel = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
                cancel.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = cancel.href;
            }

            const res = await postJson(endpoint, {
                identity,
                subscription_id: subscriptionId,
                successUrl,
                cancelUrl
            }, 'Unable to create stripe checkout session');

            const result = await res.json();
            const stripe = window.Stripe(result.publicKey);
            const redirect = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirect.error) {
                throw new Error(redirect.error.message);
            }
        },
        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();
            const endpoint = endpointFor({type: 'members', resource: 'create-stripe-billing-portal-session'}, siteUrl, apiPath);
            if (!returnUrl) {
                const ret = new URL(siteUrl);
                ret.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = ret.href;
            }
            const res = await postJson(endpoint, {
                identity,
                subscription_id: subscriptionId,
                returnUrl
            }, 'Unable to create Stripe billing portal session');
            const result = await res.json();
            window.location.assign(result.url);
        },
        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await api.member.identity();
            const url = `${endpointFor({type: 'members', resource: 'subscriptions'}, siteUrl, apiPath)}${subscriptionId}/`;
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
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
        },
        async offers() {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/offers'}, siteUrl, apiPath);
            const res = await postJson(url, {identity}, 'Failed to load offers');
            if (!res.ok) {
                return {offers: []};
            }
            return res.json();
        },
        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer`}, siteUrl, apiPath);
            const res = await postJson(url, {identity, offer_id: offerId}, 'Failed to apply offer');
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Failed to apply offer');
            }
            return true;
        }
    };

    // ---------- Init ----------
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
            // ignore
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

        return {
            site: transformApiSiteData({site}),
            member,
            offers
        };
    };

    return api;
}

export default setupGhostApi;