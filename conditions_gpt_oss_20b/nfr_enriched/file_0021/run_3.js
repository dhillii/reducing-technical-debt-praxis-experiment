import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    // ------------------------------------------------------------------
    // Helper functions
    // ------------------------------------------------------------------
    /**
     * Build a members API endpoint URL.
     * @param {Object} params
     * @param {string} params.type
     * @param {string} params.resource
     * @returns {string}
     */
    function endpointFor({type, resource}) {
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

    /**
     * Perform a fetch request.
     * @param {Object} options
     * @param {string} options.url
     * @param {string} [options.method='GET']
     * @param {Object} [options.headers={}]
     * @param {string} [options.credentials]
     * @param {string} [options.body]
     * @returns {Promise<Response>}
     */
    function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
        const opts = {method, headers, credentials, body};
        return fetch(url, opts);
    }

    /**
     * Handle a fetch response, parsing JSON or text as needed.
     * @param {Response} res
     * @param {string} errorMessage
     * @param {Function} parseFn
     * @returns {Promise<any>}
     */
    async function handleResponse(res, errorMessage, parseFn) {
        if (res.ok) {
            return parseFn(res);
        }
        const humanError = HumanReadableError.fromApiResponse(res);
        if (humanError) {
            throw humanError;
        }
        throw new Error(errorMessage);
    }

    /**
     * Send a beacon request.
     * @param {string} url
     */
    function sendBeacon(url) {
        navigator.sendBeacon(url);
    }

    // ------------------------------------------------------------------
    // API object
    // ------------------------------------------------------------------
    const api = {};

    // ------------------------------------------------------------------
    // Site API
    // ------------------------------------------------------------------
    api.site = {
        read() {
            const url = endpointFor({type: 'members', resource: 'site'});
            return makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            }).then(res => handleResponse(res, 'Failed to fetch site data', res => res.json()));
        },

        newsletters() {
            const url = contentEndpointFor({resource: 'newsletters', params: {limit: 100}});
            return makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            }).then(res => handleResponse(res, 'Failed to fetch site data', res => res.json()));
        },

        tiers() {
            const url = contentEndpointFor({
                resource: 'tiers',
                params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}
            });
            return makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            }).then(res => handleResponse(res, 'Failed to fetch site data', res => res.json()));
        },

        settings() {
            const url = contentEndpointFor({resource: 'settings'});
            return makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            }).then(res => handleResponse(res, 'Failed to fetch site data', res => res.json()));
        },

        offer({offerId}) {
            const url = contentEndpointFor({resource: `offers/${offerId}`});
            return makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            }).then(res => handleResponse(res, 'Failed to fetch offer data', res => res.json()));
        },

        recommendations({limit = 100} = {limit: 100}) {
            const url = contentEndpointFor({resource: 'recommendations', params: {limit}});
            return makeRequest({
                url,
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            }).then(res => handleResponse(res, 'Failed to fetch recommendations', res => res.json()));
        }
    };

    // ------------------------------------------------------------------
    // Feedback API
    // ------------------------------------------------------------------
    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
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
            return handleResponse(res, 'Failed to save feedback', res => res.json());
        }
    };

    // ------------------------------------------------------------------
    // Recommendations API
    // ------------------------------------------------------------------
    api.recommendations = {
        trackClicked({recommendationId}) {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/clicked`});
            sendBeacon(url);
        },

        trackSubscribed({recommendationId}) {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/subscribed`});
            sendBeacon(url);
        }
    };

    // ------------------------------------------------------------------
    // Member API
    // ------------------------------------------------------------------
    api.member = {
        identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(res => handleResponse(res, 'Failed to fetch identity', res => res.text()));
        },

        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(res => handleResponse(res, 'Failed to fetch session data', res => res.json()));
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
            }).then(res => handleResponse(res, 'Failed to update member', res => res.json()));
        },

        deleteSuppression() {
            const url = endpointFor({type: 'members', resource: 'member/suppression'});
            return makeRequest({
                url,
                method: 'DELETE'
            }).then(res => handleResponse(res, 'Your email has failed to resubscribe, please try again', () => true));
        },

        async getIntegrityToken() {
            const url = endpointFor({type: 'members', resource: 'integrity-token'});
            const res = await makeRequest({url, method: 'GET'});
            return handleResponse(res, 'Failed to start a members session', res => res.text());
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
            return handleResponse(res, 'Failed to send magic link email', () => {});
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
            return handleResponse(res, 'Failed to verify code', res => res.json());
        },

        signout(all = false) {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({
                url,
                method: 'DELETE',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({all})
            }).then(res => handleResponse(res, 'Failed to signout', () => {
                window.location.replace(siteUrl);
                return 'Success';
            }));
        },

        async newsletters({uuid, key}) {
            let url = endpointFor({type: 'members', resource: 'member/newsletters'});
            url += `?uuid=${uuid}&key=${key}`;
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(res => handleResponse(res, 'Failed to fetch newsletters', res => res.json()));
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            let url = endpointFor({type: 'members', resource: 'member/newsletters'});
            url += `?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makeRequest({
                url,
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            }).then(res => handleResponse(res, 'Failed to update email preferences', res => res.json()));
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
            const url = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'});

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
                const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                throw new Error(errMssg);
            }

            const responseBody = await res.json();

            if (responseBody.url) {
                return window.location.assign(responseBody.url);
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

            const responseJson = await response.json();

            if (!response.ok) {
                const error = responseJson?.errors?.[0];
                if (error) {
                    throw error;
                }
                throw new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-update-session'});

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

            if (!res.ok) {
                throw new Error('Unable to create stripe checkout session');
            }

            const result = await res.json();
            const stripe = window.Stripe(result.publicKey);
            const checkoutResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (checkoutResult.error) {
                throw new Error(checkoutResult.error.message);
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
            return res.json();
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
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }
            return true;
        }
    };

    // ------------------------------------------------------------------
    // Initialization
    // ------------------------------------------------------------------
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