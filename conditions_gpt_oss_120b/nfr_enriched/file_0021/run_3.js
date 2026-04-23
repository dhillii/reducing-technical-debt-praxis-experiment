import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    // Build endpoint URLs
    const buildMemberEndpoint = ({resource}) => `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
    const buildContentEndpoint = ({resource, params = {}}) => {
        if (apiUrl && apiKey) {
            const searchParams = new URLSearchParams({...params, key: apiKey});
            return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
        }
        return '';
    };

    // Generic fetch helpers
    const fetchRequest = (url, {method = 'GET', headers = {}, credentials, body} = {}) => {
        const options = {method, headers, credentials, body};
        return fetch(url, options);
    };

    const fetchJson = async (url, opts) => {
        const res = await fetchRequest(url, opts);
        if (res.ok) {
            return res.json();
        }
        const humanError = HumanReadableError.fromApiResponse(res);
        throw humanError ?? new Error('Request failed');
    };

    const fetchJsonOrNull = async (url, opts) => {
        const res = await fetchRequest(url, opts);
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    };

    const fetchTextOrNull = async (url, opts) => {
        const res = await fetchRequest(url, opts);
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.text();
    };

    const handleHumanError = async (res, fallbackMessage) => {
        const humanError = HumanReadableError.fromApiResponse(res);
        if (humanError) {
            throw humanError;
        }
        throw new Error(fallbackMessage);
    };

    const api = {};

    // Site related endpoints
    api.site = {
        read: () => fetchJson(buildMemberEndpoint({resource: 'site'}), {
            headers: {'Content-Type': 'application/json'}
        }),

        newsletters: () => fetchJson(buildContentEndpoint({resource: 'newsletters', params: {limit: 100}}), {
            headers: {'Content-Type': 'application/json'}
        }),

        tiers: () => fetchJson(buildContentEndpoint({
            resource: 'tiers',
            params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
        }), {
            headers: {'Content-Type': 'application/json'}
        }),

        settings: () => fetchJson(buildContentEndpoint({resource: 'settings'}), {
            headers: {'Content-Type': 'application/json'}
        }),

        offer: ({offerId}) => fetchJson(buildContentEndpoint({resource: `offers/${offerId}`}), {
            headers: {'Content-Type': 'application/json'}
        }),

        recommendations: ({limit = 100} = {}) => fetchJson(buildContentEndpoint({
            resource: 'recommendations',
            params: {limit}
        }), {
            headers: {'Content-Type': 'application/json'}
        })
    };

    // Feedback endpoint
    api.feedback = {
        /** Add feedback for a post */
        async add({uuid, key, postId, score}) {
            let url = buildMemberEndpoint({resource: 'feedback'});
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
            await handleHumanError(res, 'Failed to save feedback');
        }
    };

    // Recommendation tracking
    api.recommendations = {
        trackClicked: ({recommendationId}) => {
            const url = buildMemberEndpoint({resource: `recommendations/${recommendationId}/clicked`});
            navigator.sendBeacon(url);
        },

        trackSubscribed: ({recommendationId}) => {
            const url = buildMemberEndpoint({resource: `recommendations/${recommendationId}/subscribed`});
            navigator.sendBeacon(url);
        }
    };

    // Member related endpoints
    api.member = {
        identity: () => fetchTextOrNull(buildMemberEndpoint({resource: 'session'}), {
            credentials: 'same-origin'
        }),

        sessionData: () => fetchJsonOrNull(buildMemberEndpoint({resource: 'member'}), {
            credentials: 'same-origin'
        }),

        update: ({name, subscribed, newsletters, enableCommentNotifications}) => {
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return fetchJsonOrNull(buildMemberEndpoint({resource: 'member'}), {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
        },

        deleteSuppression: async () => {
            const res = await fetchRequest(buildMemberEndpoint({resource: 'member/suppression'}), {
                method: 'DELETE'
            });
            if (!res.ok) {
                throw new Error('Your email has failed to resubscribe, please try again');
            }
            return true;
        },

        getIntegrityToken: async () => {
            const res = await fetchRequest(buildMemberEndpoint({resource: 'integrity-token'}), {
                method: 'GET'
            });
            if (res.ok) {
                return res.text();
            }
            await handleHumanError(res, 'Failed to start a members session');
        },

        /** Send a magic link email */
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
            const url = buildMemberEndpoint({resource: 'send-magic-link'});
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
                    } catch {}
                }
                return {};
            }
            await handleHumanError(res, 'Failed to send magic link email');
        },

        /** Verify one‑time code */
        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = buildMemberEndpoint({resource: 'verify-otc'});
            const body = {otc, otcRef, redirect, integrityToken};

            const res = await fetchRequest(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });

            if (res.ok) {
                return res.json();
            }
            await handleHumanError(res, 'Failed to verify code');
        },

        signout: (all = false) => {
            const url = buildMemberEndpoint({resource: 'session'});
            return fetchRequest(url, {
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
            const url = `${buildMemberEndpoint({resource: 'member/newsletters'})}?uuid=${uuid}&key=${key}`;
            return fetchJsonOrNull(url, {credentials: 'same-origin'});
        },

        updateNewsletters: async ({uuid, newsletters, key, enableCommentNotifications}) => {
            const url = `${buildMemberEndpoint({resource: 'member/newsletters'})}?uuid=${uuid}&key=${key}`;
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

        updateEmailAddress: async ({email}) => {
            const identity = await api.member.identity();
            const url = buildMemberEndpoint({resource: 'member/email'});
            const res = await fetchRequest(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email, identity})
            });
            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            const errMsg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
            throw new Error(errMsg);
        },

        /** Checkout flow for a plan */
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
            const endpoint = buildMemberEndpoint({resource: 'create-stripe-checkout-session'});

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

        /** Checkout flow for a donation */
        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await api.member.identity();
            const endpoint = buildMemberEndpoint({resource: 'create-stripe-checkout-session'});

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

            const data = await res.json();

            if (!res.ok) {
                const error = data?.errors?.[0];
                if (error) {
                    throw error;
                }
                throw new Error("We're unable to process your payment right now. Please try again later.");
            }

            return data;
        },

        /** Edit billing details */
        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const endpoint = buildMemberEndpoint({resource: 'create-stripe-update-session'});

            if (!successUrl) {
                const success = new URL(siteUrl);
                success.searchParams.set('stripe', 'billing-update-success');
                successUrl = success.href;
            }

            if (!cancelUrl) {
                const base = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
                base.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = base.href;
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

        /** Open billing portal */
        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();
            const endpoint = buildMemberEndpoint({resource: 'create-stripe-billing-portal-session'});

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

        /** Update an existing subscription */
        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await api.member.identity();
            const endpoint = `${buildMemberEndpoint({resource: 'subscriptions'})}${subscriptionId}/`;
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
            return fetchRequest(endpoint, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
        },

        /** Retrieve member offers */
        async offers() {
            const identity = await api.member.identity();
            const endpoint = buildMemberEndpoint({resource: 'member/offers'});
            const res = await fetchRequest(endpoint, {
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

        /** Apply a specific offer to a subscription */
        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const endpoint = buildMemberEndpoint({resource: `subscriptions/${subscriptionId}/apply-offer`});
            const res = await fetchRequest(endpoint, {
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

    // Initialization routine
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

export default setupGhostApi