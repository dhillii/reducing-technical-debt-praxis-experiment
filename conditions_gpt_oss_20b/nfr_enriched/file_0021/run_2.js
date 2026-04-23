import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    /**
     * Build a members API endpoint URL.
     * @param {Object} params
     * @param {'members'} params.type
     * @param {string} params.resource
     * @returns {string}
     */
    function buildEndpoint({type, resource}) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
        return '';
    }

    /**
     * Build a content API endpoint URL with optional query parameters.
     * @param {Object} params
     * @param {string} params.resource
     * @param {Object} [params.params={}]
     * @returns {string}
     */
    function buildContentEndpoint({resource, params = {}}) {
        if (apiUrl && apiKey) {
            const searchParams = new URLSearchParams({
                ...params,
                key: apiKey
            });
            return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
        }
        return '';
    }

    /**
     * Perform a fetch request.
     * @param {string} url
     * @param {Object} options
     * @returns {Promise<Response>}
     */
    function request(url, options = {}) {
        return fetch(url, options);
    }

    /**
     * Fetch JSON data from a URL.
     * @param {string} url
     * @param {string} errorMessage
     * @returns {Promise<any>}
     */
    async function fetchJson(url, errorMessage) {
        const res = await request(url, {
            method: 'GET',
            headers: {'Content-Type': 'application/json'}
        });
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) throw humanError;
            throw new Error(errorMessage);
        }
        return res.json();
    }

    /**
     * Fetch text data or return null for 204/empty responses.
     * @param {string} url
     * @param {Object} options
     * @returns {Promise<string|null>}
     */
    async function fetchTextOrNull(url, options = {}) {
        const res = await request(url, options);
        if (!res.ok || res.status === 204) return null;
        return res.text();
    }

    /**
     * POST JSON data and return parsed JSON response.
     * @param {string} url
     * @param {any} body
     * @param {Object} [options={}]
     * @param {string} errorMessage
     * @returns {Promise<any>}
     */
    async function postJson(url, body, options = {}, errorMessage) {
        const res = await request(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', ...options.headers},
            credentials: options.credentials,
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) throw humanError;
            throw new Error(errorMessage);
        }
        return res.json();
    }

    /**
     * POST JSON data and return parsed JSON or empty object.
     * @param {string} url
     * @param {any} body
     * @param {Object} [options={}]
     * @param {string} errorMessage
     * @returns {Promise<any>}
     */
    async function postJsonOrEmpty(url, body, options = {}, errorMessage) {
        const res = await request(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', ...options.headers},
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) throw humanError;
            throw new Error(errorMessage);
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            try {
                return await res.json();
            } catch (_) {
                // fall through
            }
        }
        return {};
    }

    const api = {};

    api.site = {
        async read() {
            const url = buildEndpoint({type: 'members', resource: 'site'});
            return fetchJson(url, 'Failed to fetch site data');
        },

        async newsletters() {
            const url = buildContentEndpoint({resource: 'newsletters', params: {limit: 100}});
            return fetchJson(url, 'Failed to fetch site data');
        },

        async tiers() {
            const url = buildContentEndpoint({
                resource: 'tiers',
                params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
            });
            return fetchJson(url, 'Failed to fetch site data');
        },

        async settings() {
            const url = buildContentEndpoint({resource: 'settings'});
            return fetchJson(url, 'Failed to fetch site data');
        },

        async offer({offerId}) {
            const url = buildContentEndpoint({resource: `offers/${offerId}`});
            return fetchJson(url, 'Failed to fetch offer data');
        },

        async recommendations({limit = 100} = {limit: 100}) {
            const url = buildContentEndpoint({resource: 'recommendations', params: {limit}});
            return fetchJson(url, 'Failed to fetch recommendations');
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = buildEndpoint({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url = `${url}?uuid=${uuid}&key=${key}`;
            }
            const body = {
                feedback: [{post_id: postId, score}]
            };
            return postJson(url, body, {credentials: 'same-origin'}, 'Failed to save feedback');
        }
    };

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

    api.member = {
        async identity() {
            const url = buildEndpoint({type: 'members', resource: 'session'});
            return fetchTextOrNull(url, {credentials: 'same-origin'});
        },

        async sessionData() {
            const url = buildEndpoint({type: 'members', resource: 'member'});
            return fetchJson(url, 'Failed to fetch member data');
        },

        async update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = buildEndpoint({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return postJson(url, body, {credentials: 'same-origin'}, 'Failed to update member data');
        },

        async deleteSuppression() {
            const url = buildEndpoint({type: 'members', resource: 'member/suppression'});
            const res = await request(url, {method: 'DELETE'});
            if (!res.ok) {
                throw new Error('Your email has failed to resubscribe, please try again');
            }
            return true;
        },

        async getIntegrityToken() {
            const url = buildEndpoint({type: 'members', resource: 'integrity-token'});
            const res = await request(url, {method: 'GET'});
            if (!res.ok) {
                const humanError = HumanReadableError.fromApiResponse(res);
                if (humanError) throw humanError;
                throw new Error('Failed to start a members session');
            }
            return res.text();
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

            return postJsonOrEmpty(url, body, {}, 'Failed to send magic link email');
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = buildEndpoint({type: 'members', resource: 'verify-otc'});
            const body = {otc, otcRef, redirect, integrityToken};
            return postJson(url, body, {}, 'Failed to verify code');
        },

        async signout(all = false) {
            const url = buildEndpoint({type: 'members', resource: 'session'});
            const res = await request(url, {
                method: 'DELETE',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({all})
            });
            if (!res.ok) {
                throw new Error('Failed to signout');
            }
            window.location.replace(siteUrl);
            return 'Success';
        },

        async newsletters({uuid, key}) {
            let url = buildEndpoint({type: 'members', resource: 'member/newsletters'});
            url = `${url}?uuid=${uuid}&key=${key}`;
            return fetchJson(url, 'Failed to fetch newsletters');
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            let url = buildEndpoint({type: 'members', resource: 'member/newsletters'});
            url = `${url}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return postJson(url, body, {}, 'Failed to update email preferences');
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = buildEndpoint({type: 'members', resource: 'member/email'});
            const body = {email, identity};
            const res = await request(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const errData = await res.json();
                const errMssg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
                throw new Error(errMssg);
            }
            return 'Success';
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

            const res = await request(url, {
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
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
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

            const response = await request(url, {
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

            const res = await request(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    subscription_id: subscriptionId,
                    successUrl,
                    cancelUrl
                })
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
            const url = buildEndpoint({type: 'members', resource: 'create-stripe-billing-portal-session'});

            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const res = await request(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    subscription_id: subscriptionId,
                    returnUrl
                })
            });

            if (!res.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }

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
            await request(url, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
        },

        async offers() {
            const identity = await api.member.identity();
            const url = buildEndpoint({type: 'members', resource: 'member/offers'});
            const res = await request(url, {
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
            const res = await request(url, {
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
        } catch (_) {
            // Ignore
        }

        if (member && member.paid) {
            try {
                const offersData = await api.member.offers();
                offers = offersData.offers || [];
            } catch (e) {
                console.warn('[Portal] Failed to load member offers:', e);
            }
        }

        site = transformApiSiteData({site});
        return {site, member, offers};
    };

    return api;
}

export default setupGhostApi;