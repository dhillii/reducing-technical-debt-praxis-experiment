import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    function endpointFor({type, resource}) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
        return '';
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

    async function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
        const options = {method, headers, credentials, body};
        return fetch(url, options);
    }

    async function handleJsonResponse(res, fallbackMessage) {
        if (res.ok) {
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('application/json')) {
                return await res.json();
            }
            return {};
        }
        const humanError = await Promise.resolve(HumanReadableError.fromApiResponse(res));
        throw humanError ?? new Error(fallbackMessage);
    }

    async function handleTextResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return await res.text();
    }

    async function handleJsonOrNullResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return await res.json();
    }

    const api = {};

    // ---------- Site ----------
    api.site = {
        read() {
            const url = endpointFor({type: 'members', resource: 'site'});
            return makeRequest({url, headers: {'Content-Type': 'application/json'}})
                .then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        newsletters() {
            const url = contentEndpointFor({resource: 'newsletters', params: {limit: 100}});
            return makeRequest({url, headers: {'Content-Type': 'application/json'}})
                .then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        tiers() {
            const url = contentEndpointFor({
                resource: 'tiers',
                params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
            });
            return makeRequest({url, headers: {'Content-Type': 'application/json'}})
                .then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        settings() {
            const url = contentEndpointFor({resource: 'settings'});
            return makeRequest({url, headers: {'Content-Type': 'application/json'}})
                .then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        offer({offerId}) {
            const url = contentEndpointFor({resource: `offers/${offerId}`});
            return makeRequest({url, headers: {'Content-Type': 'application/json'}})
                .then(res => handleJsonResponse(res, 'Failed to fetch offer data'));
        },

        recommendations({limit = 100} = {}) {
            const url = contentEndpointFor({resource: 'recommendations', params: {limit}});
            return makeRequest({url, headers: {'Content-Type': 'application/json'}})
                .then(res => handleJsonResponse(res, 'Failed to fetch recommendations'));
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
            return await handleJsonResponse(res, 'Failed to save feedback');
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
            return makeRequest({url, credentials: 'same-origin'}).then(handleTextResponse);
        },

        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({url, credentials: 'same-origin'}).then(handleJsonOrNullResponse);
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makeRequest({
                url,
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }).then(res => (res.ok ? res.json() : null));
        },

        deleteSuppression() {
            const url = endpointFor({type: 'members', resource: 'member/suppression'});
            return makeRequest({url, method: 'DELETE'}).then(res => {
                if (!res.ok) {
                    throw new Error('Your email has failed to resubscribe, please try again');
                }
                return true;
            });
        },

        async getIntegrityToken() {
            const url = endpointFor({type: 'members', resource: 'integrity-token'});
            const res = await makeRequest({url, method: 'GET'});
            if (res.ok) {
                return await res.text();
            }
            const humanError = await Promise.resolve(HumanReadableError.fromApiResponse(res));
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
            return await handleJsonResponse(res, 'Failed to send magic link email');
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
            return await handleJsonResponse(res, 'Failed to verify code');
        },

        signout(all = false) {
            const url = endpointFor({type: 'members', resource: 'session'});
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

        async newsletters({uuid, key}) {
            const url = `${endpointFor({type: 'members', resource: 'member/newsletters'})}?uuid=${uuid}&key=${key}`;
            return makeRequest({url, credentials: 'same-origin'}).then(handleJsonOrNullResponse);
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = `${endpointFor({type: 'members', resource: 'member/newsletters'})}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makeRequest({
                url,
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
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

            if (customerEmail) {
                body.customerEmail = customerEmail;
            }

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
                const error = json?.errors?.[0];
                if (error) {
                    throw error;
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
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
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
            const res = await makeRequest({
                url,
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
            const url = endpointFor({type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer`});
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, offer_id: offerId})
            });
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
            // ignore errors fetching site data
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