```javascript
import { HumanReadableError } from './errors';
import { transformApiSiteData, transformApiTiersData, getUrlHistory } from './helpers';

/**
 * Sets up the Ghost API.
 * 
 * @param {Object} options - Options for setting up the Ghost API.
 * @param {string} options.siteUrl - The URL of the Ghost site.
 * @param {string} options.apiUrl - The URL of the Ghost API.
 * @param {string} options.apiKey - The API key for the Ghost API.
 * 
 * @returns {Object} The Ghost API object.
 */
function setupGhostApi({ siteUrl = window.location.origin, apiUrl, apiKey }) {
    const apiPath = 'members/api';

    /**
     * Returns the endpoint URL for a given type and resource.
     * 
     * @param {Object} options - Options for getting the endpoint URL.
     * @param {string} options.type - The type of endpoint.
     * @param {string} options.resource - The resource of the endpoint.
     * 
     * @returns {string} The endpoint URL.
     */
    function getEndpointUrl({ type, resource }) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
    }

    /**
     * Returns the content endpoint URL for a given resource and parameters.
     * 
     * @param {Object} options - Options for getting the content endpoint URL.
     * @param {string} options.resource - The resource of the endpoint.
     * @param {Object} [options.params={}] - The parameters for the endpoint.
     * 
     * @returns {string} The content endpoint URL.
     */
    function getContentEndpointUrl({ resource, params = {} }) {
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
     * Makes a request to the Ghost API.
     * 
     * @param {Object} options - Options for making the request.
     * @param {string} options.url - The URL of the request.
     * @param {string} [options.method='GET'] - The method of the request.
     * @param {Object} [options.headers={}] - The headers of the request.
     * @param {string} [options.credentials] - The credentials of the request.
     * @param {string} [options.body] - The body of the request.
     * 
     * @returns {Promise} The response of the request.
     */
    function makeRequest({ url, method = 'GET', headers = {}, credentials, body }) {
        const options = {
            method,
            headers,
            credentials,
            body
        };
        return fetch(url, options);
    }

    const api = {};

    /**
     * The site API.
     */
    api.site = {
        /**
         * Reads the site data.
         * 
         * @returns {Promise} The site data.
         */
        async read() {
            const url = getEndpointUrl({ type: 'members', resource: 'site' });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Gets the newsletters.
         * 
         * @returns {Promise} The newsletters.
         */
        async newsletters() {
            const url = getContentEndpointUrl({ resource: 'newsletters', params: { limit: 100 } });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Gets the tiers.
         * 
         * @returns {Promise} The tiers.
         */
        async tiers() {
            const url = getContentEndpointUrl({ resource: 'tiers', params: { limit: 100, include: 'monthly_price,yearly_price,benefits' } });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Gets the settings.
         * 
         * @returns {Promise} The settings.
         */
        async settings() {
            const url = getContentEndpointUrl({ resource: 'settings' });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Gets an offer.
         * 
         * @param {Object} options - Options for getting the offer.
         * @param {string} options.offerId - The ID of the offer.
         * 
         * @returns {Promise} The offer.
         */
        async offer({ offerId }) {
            const url = getContentEndpointUrl({ resource: `offers/${offerId}` });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Gets the recommendations.
         * 
         * @param {Object} options - Options for getting the recommendations.
         * @param {number} [options.limit=100] - The limit of recommendations.
         * 
         * @returns {Promise} The recommendations.
         */
        async recommendations({ limit = 100 } = { limit: 100 }) {
            const url = getContentEndpointUrl({ resource: 'recommendations', params: { limit } });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        }
    };

    /**
     * The feedback API.
     */
    api.feedback = {
        /**
         * Adds feedback.
         * 
         * @param {Object} options - Options for adding feedback.
         * @param {string} options.uuid - The UUID of the feedback.
         * @param {string} options.key - The key of the feedback.
         * @param {string} options.postId - The ID of the post.
         * @param {number} options.score - The score of the feedback.
         * 
         * @returns {Promise} The response of adding feedback.
         */
        async add({ uuid, key, postId, score }) {
            let url = getEndpointUrl({ type: 'members', resource: 'feedback' });
            if (uuid && key) {
                url = url + `?uuid=${uuid}&key=${key}`;
            }
            const body = {
                feedback: [
                    {
                        post_id: postId,
                        score
                    }
                ]
            };
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            return handleResponse(res);
        }
    };

    /**
     * The recommendations API.
     */
    api.recommendations = {
        /**
         * Tracks a clicked recommendation.
         * 
         * @param {Object} options - Options for tracking a clicked recommendation.
         * @param {string} options.recommendationId - The ID of the recommendation.
         */
        trackClicked({ recommendationId }) {
            let url = getEndpointUrl({ type: 'members', resource: `recommendations/${recommendationId}/clicked` });
            navigator.sendBeacon(url);
        },

        /**
         * Tracks a subscribed recommendation.
         * 
         * @param {Object} options - Options for tracking a subscribed recommendation.
         * @param {string} options.recommendationId - The ID of the recommendation.
         */
        trackSubscribed({ recommendationId }) {
            let url = getEndpointUrl({ type: 'members', resource: `recommendations/${recommendationId}/subscribed` });
            navigator.sendBeacon(url);
        }
    };

    /**
     * The member API.
     */
    api.member = {
        /**
         * Gets the member identity.
         * 
         * @returns {Promise} The member identity.
         */
        async identity() {
            const url = getEndpointUrl({ type: 'members', resource: 'session' });
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(handleTextResponse);
        },

        /**
         * Gets the member session data.
         * 
         * @returns {Promise} The member session data.
         */
        async sessionData() {
            const url = getEndpointUrl({ type: 'members', resource: 'member' });
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(handleResponse);
        },

        /**
         * Updates the member.
         * 
         * @param {Object} options - Options for updating the member.
         * @param {string} options.name - The name of the member.
         * @param {boolean} options.subscribed - Whether the member is subscribed.
         * @param {Array} options.newsletters - The newsletters of the member.
         * @param {boolean} [options.enableCommentNotifications] - Whether to enable comment notifications.
         * 
         * @returns {Promise} The response of updating the member.
         */
        async update({ name, subscribed, newsletters, enableCommentNotifications }) {
            const url = getEndpointUrl({ type: 'members', resource: 'member' });
            const body = {
                name,
                subscribed,
                newsletters
            };
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            }).then(handleResponse);
        },

        /**
         * Deletes the member suppression.
         * 
         * @returns {Promise} The response of deleting the member suppression.
         */
        async deleteSuppression() {
            const url = getEndpointUrl({ type: 'members', resource: 'member/suppression' });
            return makeRequest({
                url,
                method: 'DELETE'
            }).then(handleResponse);
        },

        /**
         * Gets the integrity token.
         * 
         * @returns {Promise} The integrity token.
         */
        async getIntegrityToken() {
            const url = getEndpointUrl({ type: 'members', resource: 'integrity-token' });
            return makeRequest({
                url,
                method: 'GET'
            }).then(handleTextResponse);
        },

        /**
         * Sends a magic link.
         * 
         * @param {Object} options - Options for sending a magic link.
         * @param {string} options.email - The email of the member.
         * @param {string} options.emailType - The type of the email.
         * @param {Array} options.labels - The labels of the member.
         * @param {string} options.name - The name of the member.
         * @param {string} options.oldEmail - The old email of the member.
         * @param {Array} options.newsletters - The newsletters of the member.
         * @param {string} options.redirect - The redirect URL.
         * @param {string} options.integrityToken - The integrity token.
         * @param {string} options.phonenumber - The phone number of the member.
         * @param {string} [options.customUrlHistory] - The custom URL history.
         * @param {string} options.token - The token.
         * @param {boolean} [options.autoRedirect=true] - Whether to auto redirect.
         * @param {boolean} [options.includeOTC] - Whether to include OTC.
         * 
         * @returns {Promise} The response of sending a magic link.
         */
        async sendMagicLink({ email, emailType, labels, name, oldEmail, newsletters, redirect, integrityToken, phonenumber, customUrlHistory, token, autoRedirect = true, includeOTC }) {
            const url = getEndpointUrl({ type: 'members', resource: 'send-magic-link' });
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
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(handleResponse);
        },

        /**
         * Verifies an OTC.
         * 
         * @param {Object} options - Options for verifying an OTC.
         * @param {string} options.otc - The OTC.
         * @param {string} options.otcRef - The OTC reference.
         * @param {string} options.redirect - The redirect URL.
         * @param {string} options.integrityToken - The integrity token.
         * 
         * @returns {Promise} The response of verifying an OTC.
         */
        async verifyOTC({ otc, otcRef, redirect, integrityToken }) {
            const url = getEndpointUrl({ type: 'members', resource: 'verify-otc' });
            const body = {
                otc,
                otcRef,
                redirect,
                integrityToken
            };
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(handleResponse);
        },

        /**
         * Signs out the member.
         * 
         * @param {Object} options - Options for signing out the member.
         * @param {boolean} [options.all=false] - Whether to sign out all sessions.
         * 
         * @returns {Promise} The response of signing out the member.
         */
        async signout(all = false) {
            const url = getEndpointUrl({ type: 'members', resource: 'session' });
            return makeRequest({
                url,
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    all
                })
            }).then(handleResponse);
        },

        /**
         * Gets the member newsletters.
         * 
         * @param {Object} options - Options for getting the member newsletters.
         * @param {string} options.uuid - The UUID of the member.
         * @param {string} options.key - The key of the member.
         * 
         * @returns {Promise} The member newsletters.
         */
        async newsletters({ uuid, key }) {
            let url = getEndpointUrl({ type: 'members', resource: `member/newsletters` });
            url = url + `?uuid=${uuid}&key=${key}`;
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(handleResponse);
        },

        /**
         * Updates the member newsletters.
         * 
         * @param {Object} options - Options for updating the member newsletters.
         * @param {string} options.uuid - The UUID of the member.
         * @param {Array} options.newsletters - The newsletters of the member.
         * @param {string} options.key - The key of the member.
         * @param {boolean} [options.enableCommentNotifications] - Whether to enable comment notifications.
         * 
         * @returns {Promise} The response of updating the member newsletters.
         */
        async updateNewsletters({ uuid, newsletters, key, enableCommentNotifications }) {
            let url = getEndpointUrl({ type: 'members', resource: `member/newsletters` });
            url = url + `?uuid=${uuid}&key=${key}`;
            const body = {
                newsletters
            };
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(handleResponse);
        },

        /**
         * Updates the member email address.
         * 
         * @param {Object} options - Options for updating the member email address.
         * @param {string} options.email - The email of the member.
         * 
         * @returns {Promise} The response of updating the member email address.
         */
        async updateEmailAddress({ email }) {
            const identity = await api.member.identity();
            const url = getEndpointUrl({ type: 'members', resource: 'member/email' });
            const body = {
                email,
                identity
            };
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(handleResponse);
        },

        /**
         * Checks out a plan.
         * 
         * @param {Object} options - Options for checking out a plan.
         * @param {string} options.plan - The plan.
         * @param {string} options.tierId - The tier ID.
         * @param {string} options.cadence - The cadence.
         * @param {string} [options.cancelUrl] - The cancel URL.
         * @param {string} [options.successUrl] - The success URL.
         * @param {string} [options.email] - The email of the member.
         * @param {string} [options.name] - The name of the member.
         * @param {string} [options.offerId] - The offer ID.
         * @param {Array} [options.newsletters] - The newsletters of the member.
         * @param {Object} [options.metadata={}] - The metadata of the member.
         * 
         * @returns {Promise} The response of checking out a plan.
         */
        async checkoutPlan({ plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {} } = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = getEndpointUrl({ type: 'members', resource: 'create-stripe-checkout-session' });
            if (!cancelUrl) {
                const checkoutCancelUrl = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
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
                identity: identity,
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
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(handleResponse);
        },

        /**
         * Checks out a donation.
         * 
         * @param {Object} options - Options for checking out a donation.
         * @param {string} [options.successUrl] - The success URL.
         * @param {string} [options.cancelUrl] - The cancel URL.
         * @param {Object} [options.metadata={}] - The metadata of the member.
         * @param {string} [options.personalNote=''] - The personal note of the member.
         * 
         * @returns {Promise} The response of checking out a donation.
         */
        async checkoutDonation({ successUrl, cancelUrl, metadata = {}, personalNote = '' } = {}) {
            const identity = await api.member.identity();
            const url = getEndpointUrl({ type: 'members', resource: 'create-stripe-checkout-session' });
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
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(handleResponse);
        },

        /**
         * Edits the billing.
         * 
         * @param {Object} options - Options for editing the billing.
         * @param {string} [options.successUrl] - The success URL.
         * @param {string} [options.cancelUrl] - The cancel URL.
         * @param {string} options.subscriptionId - The subscription ID.
         * 
         * @returns {Promise} The response of editing the billing.
         */
        async editBilling({ successUrl, cancelUrl, subscriptionId } = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = getEndpointUrl({ type: 'members', resource: 'create-stripe-update-session' });
            if (!successUrl) {
                const checkoutSuccessUrl = new URL(siteUrl);
                checkoutSuccessUrl.searchParams.set('stripe', 'billing-update-success');
                successUrl = checkoutSuccessUrl.href;
            }
            if (!cancelUrl) {
                const checkoutCancelUrl = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
                checkoutCancelUrl.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = checkoutCancelUrl.href;
            }
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: identity,
                    subscription_id: subscriptionId,
                    successUrl,
                    cancelUrl
                })
            }).then(handleResponse);
        },

        /**
         * Manages the billing.
         * 
         * @param {Object} options - Options for managing the billing.
         * @param {string} [options.returnUrl] - The return URL.
         * @param {string} options.subscriptionId - The subscription ID.
         * 
         * @returns {Promise} The response of managing the billing.
         */
        async manageBilling({ returnUrl, subscriptionId } = {}) {
            const identity = await api.member.identity();
            const url = getEndpointUrl({ type: 'members', resource: 'create-stripe-billing-portal-session' });
            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: identity,
                    subscription_id: subscriptionId,
                    returnUrl
                })
            }).then(handleResponse);
        },

        /**
         * Updates the subscription.
         * 
         * @param {Object} options - Options for updating the subscription.
         * @param {string} options.subscriptionId - The subscription ID.
         * @param {string} options.tierId - The tier ID.
         * @param {string} options.cadence - The cadence.
         * @param {string} options.planId - The plan ID.
         * @param {boolean} [options.smartCancel] - Whether to smart cancel.
         * @param {boolean} [options.cancelAtPeriodEnd] - Whether to cancel at period end.
         * @param {string} [options.cancellationReason] - The cancellation reason.
         * 
         * @returns {Promise} The response of updating the subscription.
         */
        async updateSubscription({ subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason }) {
            const identity = await api.member.identity();
            const url = getEndpointUrl({ type: 'members', resource: 'subscriptions' }) + subscriptionId + '/';
            const body = {
                smart_cancel: smartCancel,
                cancel_at_period_end: cancelAtPeriodEnd,
                cancellation_reason: cancellationReason,
                identity: identity,
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
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(handleResponse);
        },

        /**
         * Gets the offers.
         * 
         * @returns {Promise} The offers.
         */
        async offers() {
            const identity = await api.member.identity();
            const url = getEndpointUrl({ type: 'members', resource: 'member/offers' });
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ identity })
            }).then(handleResponse);
        },

        /**
         * Applies an offer.
         * 
         * @param {Object} options - Options for applying an offer.
         * @param {string} options.offerId - The offer ID.
         * @param {string} options.subscriptionId - The subscription ID.
         * 
         * @returns {Promise} The response of applying an offer.
         */
        async applyOffer({ offerId, subscriptionId }) {
            const identity = await api.member.identity();
            const url = getEndpointUrl({ type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer` });
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity,
                    offer_id: offerId
                })
            }).then(handleResponse);
        }
    };

    /**
     * Initializes the API.
     * 
     * @returns {Promise} The initialized API.
     */
    api.init = async () => {
        let [member] = await Promise.all([
            api.member.sessionData()
        ]);
        let site = {};
        let newsletters = [];
        let tiers = [];
        let settings = {};
        let offers = [];

        try {
            [{ settings }, { tiers }, { newsletters }] = await Promise.all([
                api.site.settings(),
                api.site.tiers(),
                api.site.newsletters()
            ]);
            site = {
                ...settings,
                newsletters,
                tiers: transformApiTiersData({ tiers })
            };
        } catch (e) {
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

        site = transformApiSiteData({ site });

        return { site, member, offers };
    };

    return api;
}

/**
 * Handles a response.
 * 
 * @param {Response} response - The response to handle.
 * 
 * @returns {Promise} The handled response.
 */
function handleResponse(response) {
    if (response.ok) {
        return response.json();
    } else {
        throw new Error('Failed to fetch data');
    }
}

/**
 * Handles a text response.
 * 
 * @param {Response} response - The response to handle.
 * 
 * @returns {Promise} The handled response.
 */
function handleTextResponse(response) {
    if (response.ok) {
        return response.text();
    } else {
        throw new Error('Failed to fetch data');
    }
}

export default setupGhostApi;
```