import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    // --------------------------------------------------------------------
    // URL helpers
    // --------------------------------------------------------------------
    function buildEndpoint({type, resource}) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
        return '';
    }

    function buildContentEndpoint({resource, params = {}}) {
        if (!apiUrl || !apiKey) return '';
        const searchParams = new URLSearchParams({
            ...params,
            key: apiKey
        });
        return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
    }

    // --------------------------------------------------------------------
    // Request helpers
    // --------------------------------------------------------------------
    function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
        const options = {method, headers, credentials, body};
        return fetch(url, options);
    }

    async function parseJsonOrThrow(res, errorMessage) {
        if (!res.ok) {
            await handleHumanReadableError(res, errorMessage);
        }
        return res.json();
    }

    async function parseTextOrNull(res) {
        if (!res.ok || res.status === 204) return null;
        return res.text();
    }

    async function parseJsonOrNull(res) {
        if (!res.ok || res.status === 204) return null;
        return res.json();
    }

    async function parseJsonOrEmpty(res, errorMessage) {
        if (!res.ok) {
            await handleHumanReadableError(res, errorMessage);
        }
        return res.json();
    }

    async function handleHumanReadableError(res, defaultMessage) {
        const humanError = HumanReadableError.fromApiResponse(res);
        if (humanError && typeof humanError.then === 'function') {
            const err = await humanError;
            if (err) throw err;
        } else if (humanError) {
            throw humanError;
        }
        throw new Error(defaultMessage);
    }

    // --------------------------------------------------------------------
    // API groups
    // --------------------------------------------------------------------
    const api = {};

    // Site related endpoints
    api.site = {
        async read() {
            const url = buildEndpoint({type: 'members', resource: 'site'});
            const res = await makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            });
            return parseJsonOrThrow(res, 'Failed to fetch site data');
        },

        async newsletters() {
            const url = buildContentEndpoint({resource: 'newsletters', params: {limit: 100}});
            const res = await makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            });
            return parseJsonOrThrow(res, 'Failed to fetch site data');
        },

        async tiers() {
            const url = buildContentEndpoint({
                resource: 'tiers',
                params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
            });
            const res = await makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            });
            return parseJsonOrThrow(res, 'Failed to fetch site data');
        },

        async settings() {
            const url = buildContentEndpoint({resource: 'settings'});
            const res = await makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            });
            return parseJsonOrThrow(res, 'Failed to fetch site data');
        },

        async offer({offerId}) {
            const url = buildContentEndpoint({resource: `offers/${offerId}`});
            const res = await makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            });
            return parseJsonOrThrow(res, 'Failed to fetch offer data');
        },

        async recommendations({limit = 100} = {limit: 100}) {
            const url = buildContentEndpoint({resource: 'recommendations', params: {limit}});
            const res = await makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            });
            return parseJsonOrThrow(res, 'Failed to fetch recommendations');
        }
    };

    // Feedback endpoints
    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = buildEndpoint({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const body = {
                feedback: [{post_id: postId, score}]
            };
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (res.ok) return res.json();
            await handleHumanReadableError(res, 'Failed to save feedback');
        }
    };

    // Recommendation tracking
    api.recommendations = {
        trackClicked({recommendationId}) {
            const url = buildEndpoint({
                type: 'members',
                resource: `recommendations/${recommendationId}/clicked`
            });
            navigator.sendBeacon(url);
        },

        trackSubscribed({recommendationId}) {
            const url = buildEndpoint({
                type: 'members',
                resource: `recommendations/${recommendationId}/subscribed`
            });
            navigator.sendBeacon(url);
        }
    };

    // Member endpoints
    api.member = {
        async identity() {
            const url = buildEndpoint({type: 'members', resource: 'session'});
            const res = await makeRequest({url, credentials: 'same-origin'});
            return parseTextOrNull(res);
        },

        async sessionData() {
            const url = buildEndpoint({type: 'members', resource: 'member'});
            const res = await makeRequest({url, credentials: 'same-origin'});
            return parseJsonOrNull(res);
        },

        async update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = buildEndpoint({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            const res = await makeRequest({
                url,
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (!res.ok) return null;
            return res.json();
        },

        async deleteSuppression() {
            const url = buildEndpoint({type: 'members', resource: 'member/suppression'});
            const res = await makeRequest({url, method: 'DELETE'});
            if (!res.ok) throw new Error('Your email has failed to resubscribe, please try again');
            return true;
        },

        async getIntegrityToken() {
            const url = buildEndpoint({type: 'members', resource: 'integrity-token'});
            const res = await makeRequest({url, method: 'GET'});
            if (res.ok) return res.text();
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
            const url = buildEndpoint({type: 'members', resource: 'send-magic-link'});
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
            if (urlHistory) body.urlHistory = urlHistory;

            const res = await makeRequest({
                url,
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
                        // fall through to response used pre-OTC
                    }
                }
                return {};
            }
            await handleHumanReadableError(res, 'Failed to send magic link email');
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = buildEndpoint({type: 'members', resource: 'verify-otc'});
            const body = {otc, otcRef, redirect, integrityToken};

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });

            if (res.ok) return res.json();
            await handleHumanReadableError(res, 'Failed to verify code');
        },

        async signout(all = false) {
            const url = buildEndpoint({type: 'members', resource: 'session'});
            const res = await makeRequest({
                url,
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
            let url = buildEndpoint({type: 'members', resource: 'member/newsletters'});
            url += `?uuid=${uuid}&key=${key}`;
            const res = await makeRequest({url, credentials: 'same-origin'});
            return parseJsonOrNull(res);
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            let url = buildEndpoint({type: 'members', resource: 'member/newsletters'});
            url += `?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            const res = await makeRequest({
                url,
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (res.ok) return res.json();
            throw new Error('Failed to update email preferences');
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = buildEndpoint({type: 'members', resource: 'member/email'});
            const body = {email, identity};

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });

            if (res.ok) return 'Success';
            const errData = await res.json();
            const errMssg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
            throw new Error(errMssg);
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
            const url = buildEndpoint({type: 'members', resource: 'create-stripe-checkout-session'});

            if (!cancelUrl) {
                const checkoutCancelUrl = window.location.href.startsWith(siteUrlObj.href)
                    ? new URL(window.location.href)
                    : new URL(siteUrl);
                checkoutCancelUrl.searchParams.set('stripe', 'cancel');
                cancelUrl = checkoutCancelUrl.href;
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
                const errData = await res.json();
                const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                throw new Error(errMssg);
            }

            const responseBody = await res.json();

            if (responseBody.url) {
                window.location.assign(responseBody.url);
                return;
            }

            const stripe = window.Stripe(responseBody.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
            if (redirectResult.error) throw new Error(redirectResult.error.message);
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await api.member.identity();
            const url = buildEndpoint({type: 'members', resource: 'create-stripe-checkout-session'});

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

            const responseJson = await response.json();

            if (!response.ok) {
                const error = responseJson?.errors?.[0];
                if (error) throw error;
                throw new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = buildEndpoint({type: 'members', resource: 'create-stripe-update-session'});

            if (!successUrl) {
                const checkoutSuccessUrl = new URL(siteUrl);
                checkoutSuccessUrl.searchParams.set('stripe', 'billing-update-success');
                successUrl = checkoutSuccessUrl.href;
            }

            if (!cancelUrl) {
                const checkoutCancelUrl = window.location.href.startsWith(siteUrlObj.href)
                    ? new URL(window.location.href)
                    : new URL(siteUrl);
                checkoutCancelUrl.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = checkoutCancelUrl.href;
            }

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    subscription_id: subscriptionId,
                    successUrl,
                    cancelUrl
                })
            });

            if (!res.ok) throw new Error('Unable to create stripe checkout session');
            const result = await res.json();
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirectResult.error) throw new Error(redirectResult.error.message);
        },

        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();
            const url = buildEndpoint({type: 'members', resource: 'create-stripe-billing-portal-session'});
            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    subscription_id: subscriptionId,
                    returnUrl
                })
            });

            if (!res.ok) throw new Error('Unable to create Stripe billing portal session');
            const result = await res.json();
            window.location.assign(result.url);
        },

        async updateSubscription({
            subscriptionId,
            tierId,
            cadence,
            planId,
            smartCancel,
            cancelAtPeriodEnd,
            cancellationReason
        }) {
            const identity = await api.member.identity();
            const url = `${buildEndpoint({type: 'members', resource: 'subscriptions'})}${subscriptionId}/`;
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

            await makeRequest({
                url,
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
        },

        async offers() {
            const identity = await api.member.identity();
            const url = buildEndpoint({type: 'members', resource: 'member/offers'});

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity})
            });

            if (!res.ok) return {offers: []};
            return res.json();
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const url = buildEndpoint({
                type: 'members',
                resource: `subscriptions/${subscriptionId}/apply-offer`
            });

            const res = await makeRequest({
                url,
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

    // --------------------------------------------------------------------
    // Initialization
    // --------------------------------------------------------------------
    api.init = async () => {
        const [member] = await Promise.all([api.member.sessionData()]);
        let site = {};
        let newsletters = [];
        let tiers = [];
        let settings = {};
        let offers = [];

        try {
            const [settingsRes, tiersRes, newslettersRes] = await Promise.all([
                api.site.settings(),
                api.site.tiers(),
                api.site.newsletters()
            ]);
            ({settings} = settingsRes);
            ({tiers} = tiersRes);
            ({newsletters} = newslettersRes);
            site = {
                ...settings,
                newsletters,
                tiers: transformApiTiersData({tiers})
            };
        } catch {
            // Ignore
        }

        if (member && member.paid) {
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