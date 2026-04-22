import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

/* Helper: construct base endpoint URL */
function buildEndpoint({siteUrl, apiPath, type, resource}) {
    if (type === 'members') {
        return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
    }
    return '';
}

/* Helper: construct content endpoint URL (requires apiUrl & apiKey) */
function buildContentEndpoint({apiUrl, apiKey, resource, params = {}}) {
    if (!apiUrl || !apiKey) {
        return '';
    }
    const searchParams = new URLSearchParams({
        ...params,
        key: apiKey
    });
    return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
}

/* Helper: perform fetch */
function fetchRequest(url, {method = 'GET', headers = {}, credentials, body} = {}) {
    return fetch(url, {method, headers, credentials, body});
}

/* Helper: parse JSON response or throw readable error */
async function parseJsonResponse(res, fallbackMessage) {
    if (res.ok) {
        return res.json();
    }
    const humanError = await HumanReadableError.fromApiResponse(res);
    throw humanError ?? new Error(fallbackMessage);
}

/* Helper: parse text response or return null */
async function parseTextResponse(res) {
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.text();
}

/* Helper: parse JSON or null response */
async function parseJsonOrNullResponse(res) {
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.json();
}

/* Helper: send beacon */
function sendBeacon(url) {
    navigator.sendBeacon(url);
}

/* Main API factory */
function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    const api = {};

    /* Site related endpoints */
    api.site = {
        async read() {
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'site'});
            const res = await fetchRequest(url, {headers: {'Content-Type': 'application/json'}});
            return parseJsonResponse(res, 'Failed to fetch site data');
        },

        async newsletters() {
            const url = buildContentEndpoint({apiUrl, apiKey, resource: 'newsletters', params: {limit: 100}});
            const res = await fetchRequest(url, {headers: {'Content-Type': 'application/json'}});
            return parseJsonResponse(res, 'Failed to fetch site data');
        },

        async tiers() {
            const url = buildContentEndpoint({
                apiUrl,
                apiKey,
                resource: 'tiers',
                params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
            });
            const res = await fetchRequest(url, {headers: {'Content-Type': 'application/json'}});
            return parseJsonResponse(res, 'Failed to fetch site data');
        },

        async settings() {
            const url = buildContentEndpoint({apiUrl, apiKey, resource: 'settings'});
            const res = await fetchRequest(url, {headers: {'Content-Type': 'application/json'}});
            return parseJsonResponse(res, 'Failed to fetch site data');
        },

        async offer({offerId}) {
            const url = buildContentEndpoint({apiUrl, apiKey, resource: `offers/${offerId}`});
            const res = await fetchRequest(url, {headers: {'Content-Type': 'application/json'}});
            return parseJsonResponse(res, 'Failed to fetch offer data');
        },

        async recommendations({limit = 100} = {}) {
            const url = buildContentEndpoint({
                apiUrl,
                apiKey,
                resource: 'recommendations',
                params: {limit}
            });
            const res = await fetchRequest(url, {headers: {'Content-Type': 'application/json'}});
            return parseJsonResponse(res, 'Failed to fetch recommendations');
        }
    };

    /* Feedback endpoint */
    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const body = {feedback: [{post_id: postId, score}]};
            const res = await fetchRequest(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            throw humanError ?? new Error('Failed to save feedback');
        }
    };

    /* Recommendation tracking */
    api.recommendations = {
        trackClicked({recommendationId}) {
            const url = buildEndpoint({
                siteUrl,
                apiPath,
                type: 'members',
                resource: `recommendations/${recommendationId}/clicked`
            });
            sendBeacon(url);
        },

        trackSubscribed({recommendationId}) {
            const url = buildEndpoint({
                siteUrl,
                apiPath,
                type: 'members',
                resource: `recommendations/${recommendationId}/subscribed`
            });
            sendBeacon(url);
        }
    };

    /* Member related endpoints */
    api.member = {
        async identity() {
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'session'});
            const res = await fetchRequest(url, {credentials: 'same-origin'});
            return parseTextResponse(res);
        },

        async sessionData() {
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'member'});
            const res = await fetchRequest(url, {credentials: 'same-origin'});
            return parseJsonOrNullResponse(res);
        },

        async update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            const res = await fetchRequest(url, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                return null;
            }
            return res.json();
        },

        async deleteSuppression() {
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'member/suppression'});
            const res = await fetchRequest(url, {method: 'DELETE'});
            if (!res.ok) {
                throw new Error('Your email has failed to resubscribe, please try again');
            }
            return true;
        },

        async getIntegrityToken() {
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'integrity-token'});
            const res = await fetchRequest(url);
            if (res.ok) {
                return res.text();
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            throw humanError ?? new Error('Failed to start a members session');
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
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'send-magic-link'});
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
            const res = await fetchRequest(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const contentType = (res.headers.get('content-type') || '').toLowerCase();
                if (contentType.includes('application/json')) {
                    try {
                        return await res.json();
                    } catch {
                        // fall through
                    }
                }
                return {};
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            throw humanError ?? new Error('Failed to send magic link email');
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'verify-otc'});
            const body = {otc, otcRef, redirect, integrityToken};
            const res = await fetchRequest(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            throw humanError ?? new Error('Failed to verify code');
        },

        async signout(all = false) {
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'session'});
            const res = await fetchRequest(url, {
                method: 'DELETE',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({all})
            });
            if (res.ok) {
                window.location.replace(siteUrl);
                return 'Success';
            }
            throw new Error('Failed to signout');
        },

        async newsletters({uuid, key}) {
            const base = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'member/newsletters'});
            const url = `${base}?uuid=${uuid}&key=${key}`;
            const res = await fetchRequest(url, {credentials: 'same-origin'});
            return parseJsonOrNullResponse(res);
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const base = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'member/newsletters'});
            const url = `${base}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            const res = await fetchRequest(url, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            throw new Error('Failed to update email preferences');
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'member/email'});
            const body = {email, identity};
            const res = await fetchRequest(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
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
            const endpoint = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'create-stripe-checkout-session'});

            if (!cancelUrl) {
                const fallback = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
                fallback.searchParams.set('stripe', 'cancel');
                cancelUrl = fallback.href;
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

            const res = await fetchRequest(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errData = await res.json();
                const errMsg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                throw new Error(errMsg);
            }

            const responseBody = await res.json();

            if (responseBody.url) {
                window.location.assign(responseBody.url);
                return;
            }

            const stripe = window.Stripe(responseBody.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await api.member.identity();
            const endpoint = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'create-stripe-checkout-session'});

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

            const res = await fetchRequest(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });

            const json = await res.json();

            if (!res.ok) {
                const error = json?.errors?.[0];
                throw error ?? new Error("We're unable to process your payment right now. Please try again later.");
            }

            return json;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const endpoint = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'create-stripe-update-session'});

            if (!successUrl) {
                const success = new URL(siteUrl);
                success.searchParams.set('stripe', 'billing-update-success');
                successUrl = success.href;
            }

            if (!cancelUrl) {
                const fallback = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
                fallback.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = fallback.href;
            }

            const res = await fetchRequest(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
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
            const identity = await api.member.identity();
            const endpoint = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'create-stripe-billing-portal-session'});

            if (!returnUrl) {
                const ret = new URL(siteUrl);
                ret.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = ret.href;
            }

            const res = await fetchRequest(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, subscription_id: subscriptionId, returnUrl})
            });

            if (!res.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }

            const result = await res.json();
            window.location.assign(result.url);
        },

        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await api.member.identity();
            const base = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'subscriptions'});
            const url = `${base}${subscriptionId}/`;
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
            return fetchRequest(url, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
        },

        async offers() {
            const identity = await api.member.identity();
            const url = buildEndpoint({siteUrl, apiPath, type: 'members', resource: 'member/offers'});
            const res = await fetchRequest(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity})
            });
            if (!res.ok) {
                return {offers: []};
            }
            try {
                return await res.json();
            } catch {
                return {offers: []};
            }
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const url = buildEndpoint({
                siteUrl,
                apiPath,
                type: 'members',
                resource: `subscriptions/${subscriptionId}/apply-offer`
            });
            const res = await fetchRequest(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, offer_id: offerId})
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }
            return true;
        }
    };

    /* Initialization */
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
            // ignore errors
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

        site = transformApiSiteData({site});
        return {site, member, offers};
    };

    return api;
}

export default setupGhostApi;