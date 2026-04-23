import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    function endpointFor({type, resource}) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
    }

    function contentEndpointFor({resource, params = {}}) {
        if (apiUrl && apiKey) {
            const searchParams = new URLSearchParams({
                ...params,
                key: apiKey
            });
            return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
        }
        return '';
    }

    function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
        return fetch(url, {method, headers, credentials, body});
    }

    /** @returns {Promise<any>} */
    function requestJson(url, {method = 'GET', headers = {}, credentials, body} = {}, errorMessage) {
        return makeRequest({url, method, headers, credentials, body}).then(res => {
            if (res.ok) {
                return res.json();
            }
            throw new Error(errorMessage);
        });
    }

    /** @returns {Promise<string>} */
    function requestText(url, {method = 'GET', headers = {}, credentials, body} = {}, errorMessage) {
        return makeRequest({url, method, headers, credentials, body}).then(res => {
            if (res.ok) {
                return res.text();
            }
            throw new Error(errorMessage);
        });
    }

    /** @returns {Promise<any>} */
    function requestJsonOrNull(url, options = {}) {
        return makeRequest({url, ...options}).then(res => {
            if (!res.ok || res.status === 204) {
                return null;
            }
            return res.json();
        });
    }

    /** @returns {Promise<any>} */
    function postJson(url, bodyObj, errorMessage, credentials) {
        return requestJson(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials,
            body: JSON.stringify(bodyObj)
        }, errorMessage);
    }

    const api = {};

    // ---------- Site ----------
    const siteError = 'Failed to fetch site data';
    const siteResources = {
        newsletters: {resource: 'newsletters', params: {limit: 100}, error: siteError},
        tiers: {resource: 'tiers', params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}, error: siteError},
        settings: {resource: 'settings', params: {}, error: siteError},
        offer: {resource: id => `offers/${id}`, params: {}, error: 'Failed to fetch offer data'},
        recommendations: {resource: 'recommendations', params: {limit: 100}, error: 'Failed to fetch recommendations'}
    };

    api.site = {
        read() {
            const url = endpointFor({type: 'members', resource: 'site'});
            return requestJson(url, {
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            }, siteError);
        },
        newsletters() {
            const {resource, params, error} = siteResources.newsletters;
            const url = contentEndpointFor({resource, params});
            return requestJson(url, {method: 'GET', headers: {'Content-Type': 'application/json'}}, error);
        },
        tiers() {
            const {resource, params, error} = siteResources.tiers;
            const url = contentEndpointFor({resource, params});
            return requestJson(url, {method: 'GET', headers: {'Content-Type': 'application/json'}}, error);
        },
        settings() {
            const {resource, params, error} = siteResources.settings;
            const url = contentEndpointFor({resource, params});
            return requestJson(url, {method: 'GET', headers: {'Content-Type': 'application/json'}}, error);
        },
        offer({offerId}) {
            const url = contentEndpointFor({resource: siteResources.offer.resource(offerId)});
            return requestJson(url, {method: 'GET', headers: {'Content-Type': 'application/json'}}, siteResources.offer.error);
        },
        recommendations({limit = 100} = {}) {
            const {resource, params, error} = siteResources.recommendations;
            const url = contentEndpointFor({resource, params: {...params, limit}});
            return requestJson(url, {method: 'GET', headers: {'Content-Type': 'application/json'}}, error);
        }
    };

    // ---------- Feedback ----------
    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
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
            const human = await HumanReadableError.fromApiResponse(res);
            throw human ?? new Error('Failed to save feedback');
        }
    };

    // ---------- Recommendations ----------
    api.recommendations = {
        trackClicked({recommendationId}) {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/clicked`});
            navigator.sendBeacon(url);
        },
        trackSubscribed({recommendationId}) {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/subscribed`});
            navigator.sendBeacon(url);
        }
    };

    // ---------- Member ----------
    api.member = {
        identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({url, credentials: 'same-origin'}).then(res => {
                if (!res.ok || res.status === 204) {
                    return null;
                }
                return res.text();
            });
        },
        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({url, credentials: 'same-origin'}).then(res => {
                if (!res.ok || res.status === 204) {
                    return null;
                }
                return res.json();
            });
        },
        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return requestJson(url, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }, 'Failed to update member').catch(() => null);
        },
        deleteSuppression() {
            const url = endpointFor({type: 'members', resource: 'member/suppression'});
            return requestJson(url, {method: 'DELETE'}, 'Your email has failed to resubscribe, please try again').then(() => true);
        },
        async getIntegrityToken() {
            const url = endpointFor({type: 'members', resource: 'integrity-token'});
            const res = await makeRequest({url, method: 'GET'});
            if (res.ok) {
                return res.text();
            }
            const human = await HumanReadableError.fromApiResponse(res);
            if (human) {
                throw human;
            }
            throw new Error('Failed to start a members session');
        },
        async sendMagicLink({email, emailType, labels, name, oldEmail, newsletters, redirect, integrityToken, phonenumber, customUrlHistory, token, autoRedirect = true, includeOTC}) {
            const url = endpointFor({type: 'members', resource: 'send-magic-link'});
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
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const ct = (res.headers.get('content-type') || '').toLowerCase();
                if (ct.includes('application/json')) {
                    try {
                        return await res.json();
                    } catch {}
                }
                return {};
            }
            const human = await HumanReadableError.fromApiResponse(res);
            if (human) {
                throw human;
            }
            throw new Error('Failed to send magic link email');
        },
        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = endpointFor({type: 'members', resource: 'verify-otc'});
            const body = {otc, otcRef, redirect, integrityToken};
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return await res.json();
            }
            const human = await HumanReadableError.fromApiResponse(res);
            if (human) {
                throw human;
            }
            throw new Error('Failed to verify code');
        },
        signout(all = false) {
            const url = endpointFor({type: 'members', resource: 'session'});
            return requestJson(url, {
                method: 'DELETE',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({all})
            }, 'Failed to signout').then(() => {
                window.location.replace(siteUrl);
                return 'Success';
            });
        },
        async newsletters({uuid, key}) {
            const base = endpointFor({type: 'members', resource: 'member/newsletters'});
            const url = `${base}?uuid=${uuid}&key=${key}`;
            return requestJsonOrNull(url);
        },
        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const base = endpointFor({type: 'members', resource: 'member/newsletters'});
            const url = `${base}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return requestJson(url, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            }, 'Failed to update email preferences');
        },
        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/email'});
            const body = {email, identity};
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            const msg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
            throw new Error(msg);
        },
        async checkoutPlan({plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {}} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'});

            if (!cancelUrl) {
                const cancel = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
                cancel.searchParams.set('stripe', 'cancel');
                cancelUrl = cancel.href;
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
            if (customerEmail) body.customerEmail = customerEmail;
            if (tierId && cadence) {
                delete body.priceId;
                body.tierId = offerId ? null : tierId;
                body.cadence = offerId ? null : cadence;
            }

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.json();
                const msg = err?.errors?.[0]?.message || 'Failed to signup, please try again.';
                throw new Error(msg);
            }
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
            const url = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'});
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
            const response = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            const json = await response.json();
            if (!response.ok) {
                const err = json?.errors?.[0];
                if (err) {
                    throw err;
                }
                throw new Error("We're unable to process your payment right now. Please try again later.");
            }
            return json;
        },
        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-update-session'});

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

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, subscription_id: subscriptionId, successUrl, cancelUrl})
            });
            if (!res.ok) {
                throw new Error('Unable to create stripe checkout session');
            }
            const result = await res.json();
            const stripe = window.Stripe(result.publicKey);
            const redirect = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirect.error) {
                throw new Error(redirect.error.message);
            }
        },
        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-billing-portal-session'});
            if (!returnUrl) {
                const ret = new URL(siteUrl);
                ret.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = ret.href;
            }
            const res = await makeRequest({
                url,
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
            const url = `${endpointFor({type: 'members', resource: 'subscriptions'})}${subscriptionId}/`;
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
            const url = endpointFor({type: 'members', resource: 'member/offers'});
            return requestJson(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity})
            }, 'Failed to load offers')
                .then(res => res)
                .catch(() => ({offers: []}));
        },
        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer`});
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, offer_id: offerId})
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'Failed to apply offer');
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
        } catch {}

        if (member?.paid) {
            try {
                const data = await api.member.offers();
                offers = data.offers || [];
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

export default setupGhostApi