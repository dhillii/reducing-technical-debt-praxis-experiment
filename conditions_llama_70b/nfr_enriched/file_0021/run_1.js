import { HumanReadableError } from './errors';
import { transformApiSiteData, transformApiTiersData, getUrlHistory } from './helpers';

function setupGhostApi({ siteUrl = window.location.origin, apiUrl, apiKey }) {
    const apiPath = 'members/api';

    /**
     * Returns the endpoint URL for a given type and resource.
     * @param {Object} options - Options object.
     * @param {string} options.type - Type of endpoint.
     * @param {string} options.resource - Resource of endpoint.
     * @returns {string} Endpoint URL.
     */
    function endpointFor({ type, resource }) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
    }

    /**
     * Returns the content endpoint URL for a given resource and params.
     * @param {Object} options - Options object.
     * @param {string} options.resource - Resource of endpoint.
     * @param {Object} [options.params={}] - Query parameters.
     * @returns {string} Content endpoint URL.
     */
    function contentEndpointFor({ resource, params = {} }) {
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
     * Makes a request to the given URL with the provided options.
     * @param {Object} options - Options object.
     * @param {string} options.url - URL to make request to.
     * @param {string} [options.method='GET'] - Request method.
     * @param {Object} [options.headers={}] - Request headers.
     * @param {string} [options.credentials] - Request credentials.
     * @param {string} [options.body] - Request body.
     * @returns {Promise} Promise resolving to the response.
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

    api.site = {
        /**
         * Reads site data.
         * @returns {Promise} Promise resolving to the site data.
         */
        read() {
            const url = endpointFor({ type: 'members', resource: 'site' });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Retrieves newsletters.
         * @returns {Promise} Promise resolving to the newsletters.
         */
        newsletters() {
            const url = contentEndpointFor({ resource: 'newsletters', params: { limit: 100 } });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Retrieves tiers.
         * @returns {Promise} Promise resolving to the tiers.
         */
        tiers() {
            const url = contentEndpointFor({ resource: 'tiers', params: { limit: 100, include: 'monthly_price,yearly_price,benefits' } });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Retrieves settings.
         * @returns {Promise} Promise resolving to the settings.
         */
        settings() {
            const url = contentEndpointFor({ resource: 'settings' });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Retrieves an offer.
         * @param {Object} options - Options object.
         * @param {string} options.offerId - Offer ID.
         * @returns {Promise} Promise resolving to the offer.
         */
        offer({ offerId }) {
            const url = contentEndpointFor({ resource: `offers/${offerId}` });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        },

        /**
         * Retrieves recommendations.
         * @param {Object} options - Options object.
         * @param {number} [options.limit=100] - Limit of recommendations to retrieve.
         * @returns {Promise} Promise resolving to the recommendations.
         */
        recommendations({ limit = 100 } = { limit: 100 }) {
            const url = contentEndpointFor({ resource: 'recommendations', params: { limit } });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleResponse);
        }
    };

    api.feedback = {
        /**
         * Adds feedback.
         * @param {Object} options - Options object.
         * @param {string} options.uuid - UUID.
         * @param {string} options.key - Key.
         * @param {string} options.postId - Post ID.
         * @param {number} options.score - Score.
         * @returns {Promise} Promise resolving to the response.
         */
        async add({ uuid, key, postId, score }) {
            let url = endpointFor({ type: 'members', resource: 'feedback' });
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

    api.recommendations = {
        /**
         * Tracks a clicked recommendation.
         * @param {Object} options - Options object.
         * @param {string} options.recommendationId - Recommendation ID.
         */
        trackClicked({ recommendationId }) {
            let url = endpointFor({ type: 'members', resource: `recommendations/${recommendationId}/clicked` });
            navigator.sendBeacon(url);
        },

        /**
         * Tracks a subscribed recommendation.
         * @param {Object} options - Options object.
         * @param {string} options.recommendationId - Recommendation ID.
         */
        trackSubscribed({ recommendationId }) {
            let url = endpointFor({ type: 'members', resource: `recommendations/${recommendationId}/subscribed` });
            navigator.sendBeacon(url);
        }
    };

    api.member = {
        /**
         * Retrieves the member's identity.
         * @returns {Promise} Promise resolving to the member's identity.
         */
        identity() {
            const url = endpointFor({ type: 'members', resource: 'session' });
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(handleTextResponse);
        },

        /**
         * Retrieves the member's session data.
         * @returns {Promise} Promise resolving to the member's session data.
         */
        sessionData() {
            const url = endpointFor({ type: 'members', resource: 'member' });
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(handleResponse);
        },

        /**
         * Updates the member's data.
         * @param {Object} options - Options object.
         * @param {string} options.name - Name.
         * @param {boolean} options.subscribed - Subscribed.
         * @param {Array} options.newsletters - Newsletters.
         * @param {boolean} [options.enableCommentNotifications] - Enable comment notifications.
         * @returns {Promise} Promise resolving to the response.
         */
        update({ name, subscribed, newsletters, enableCommentNotifications }) {
            const url = endpointFor({ type: 'members', resource: 'member' });
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
         * Deletes the member's suppression.
         * @returns {Promise} Promise resolving to the response.
         */
        deleteSuppression() {
            const url = endpointFor({ type: 'members', resource: 'member/suppression' });

            return makeRequest({
                url,
                method: 'DELETE'
            }).then(handleResponse);
        },

        /**
         * Retrieves the member's integrity token.
         * @returns {Promise} Promise resolving to the member's integrity token.
         */
        async getIntegrityToken() {
            const url = endpointFor({ type: 'members', resource: 'integrity-token' });
            const res = await makeRequest({
                url,
                method: 'GET'
            });
            return handleTextResponse(res);
        },

        /**
         * Sends a magic link to the member.
         * @param {Object} options - Options object.
         * @param {string} options.email - Email.
         * @param {string} options.emailType - Email type.
         * @param {Array} options.labels - Labels.
         * @param {string} options.name - Name.
         * @param {string} options.oldEmail - Old email.
         * @param {Array} options.newsletters - Newsletters.
         * @param {string} options.redirect - Redirect URL.
         * @param {string} options.integrityToken - Integrity token.
         * @param {string} options.phonenumber - Phone number.
         * @param {string} [options.customUrlHistory] - Custom URL history.
         * @param {string} options.token - Token.
         * @param {boolean} [options.autoRedirect=true] - Auto redirect.
         * @param {boolean} [options.includeOTC] - Include OTC.
         * @returns {Promise} Promise resolving to the response.
         */
        async sendMagicLink({ email, emailType, labels, name, oldEmail, newsletters, redirect, integrityToken, phonenumber, customUrlHistory, token, autoRedirect = true, includeOTC }) {
            const url = endpointFor({ type: 'members', resource: 'send-magic-link' });
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
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            return handleResponse(res);
        },

        /**
         * Verifies an OTC.
         * @param {Object} options - Options object.
         * @param {string} options.otc - OTC.
         * @param {string} options.otcRef - OTC reference.
         * @param {string} options.redirect - Redirect URL.
         * @param {string} options.integrityToken - Integrity token.
         * @returns {Promise} Promise resolving to the response.
         */
        async verifyOTC({ otc, otcRef, redirect, integrityToken }) {
            const url = endpointFor({ type: 'members', resource: 'verify-otc' });
            const body = {
                otc,
                otcRef,
                redirect,
                integrityToken
            };

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            return handleResponse(res);
        },

        /**
         * Signs out the member.
         * @param {boolean} [all=false] - Sign out all sessions.
         * @returns {Promise} Promise resolving to the response.
         */
        signout(all = false) {
            const url = endpointFor({ type: 'members', resource: 'session' });
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
         * Retrieves the member's newsletters.
         * @param {Object} options - Options object.
         * @param {string} options.uuid - UUID.
         * @param {string} options.key - Key.
         * @returns {Promise} Promise resolving to the member's newsletters.
         */
        async newsletters({ uuid, key }) {
            let url = endpointFor({ type: 'members', resource: `member/newsletters` });
            url = url + `?uuid=${uuid}&key=${key}`;
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(handleResponse);
        },

        /**
         * Updates the member's newsletters.
         * @param {Object} options - Options object.
         * @param {string} options.uuid - UUID.
         * @param {Array} options.newsletters - Newsletters.
         * @param {string} options.key - Key.
         * @param {boolean} [options.enableCommentNotifications] - Enable comment notifications.
         * @returns {Promise} Promise resolving to the response.
         */
        async updateNewsletters({ uuid, newsletters, key, enableCommentNotifications }) {
            let url = endpointFor({ type: 'members', resource: `member/newsletters` });
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
         * Updates the member's email address.
         * @param {Object} options - Options object.
         * @param {string} options.email - Email.
         * @returns {Promise} Promise resolving to the response.
         */
        async updateEmailAddress({ email }) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'member/email' });
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
         * @param {Object} options - Options object.
         * @param {string} options.plan - Plan.
         * @param {string} options.tierId - Tier ID.
         * @param {string} options.cadence - Cadence.
         * @param {string} [options.cancelUrl] - Cancel URL.
         * @param {string} [options.successUrl] - Success URL.
         * @param {string} [options.email] - Email.
         * @param {string} [options.name] - Name.
         * @param {string} [options.offerId] - Offer ID.
         * @param {Array} [options.newsletters] - Newsletters.
         * @param {Object} [options.metadata={}] - Metadata.
         * @returns {Promise} Promise resolving to the response.
         */
        async checkoutPlan({ plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {} } = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'create-stripe-checkout-session' });

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
         * @param {Object} options - Options object.
         * @param {string} [options.successUrl] - Success URL.
         * @param {string} [options.cancelUrl] - Cancel URL.
         * @param {Object} [options.metadata={}] - Metadata.
         * @param {string} [options.personalNote=''] - Personal note.
         * @returns {Promise} Promise resolving to the response.
         */
        async checkoutDonation({ successUrl, cancelUrl, metadata = {}, personalNote = '' } = {}) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'create-stripe-checkout-session' });

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
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            return handleResponse(response);
        },

        /**
         * Edits the member's billing.
         * @param {Object} options - Options object.
         * @param {string} [options.successUrl] - Success URL.
         * @param {string} [options.cancelUrl] - Cancel URL.
         * @param {string} options.subscriptionId - Subscription ID.
         * @returns {Promise} Promise resolving to the response.
         */
        async editBilling({ successUrl, cancelUrl, subscriptionId } = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'create-stripe-update-session' });
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
         * Manages the member's billing.
         * @param {Object} options - Options object.
         * @param {string} [options.returnUrl] - Return URL.
         * @param {string} options.subscriptionId - Subscription ID.
         * @returns {Promise} Promise resolving to the response.
         */
        async manageBilling({ returnUrl, subscriptionId } = {}) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'create-stripe-billing-portal-session' });
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
         * Updates the member's subscription.
         * @param {Object} options - Options object.
         * @param {string} options.subscriptionId - Subscription ID.
         * @param {string} options.tierId - Tier ID.
         * @param {string} options.cadence - Cadence.
         * @param {string} options.planId - Plan ID.
         * @param {boolean} options.smartCancel - Smart cancel.
         * @param {boolean} options.cancelAtPeriodEnd - Cancel at period end.
         * @param {string} options.cancellationReason - Cancellation reason.
         * @returns {Promise} Promise resolving to the response.
         */
        async updateSubscription({ subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason }) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'subscriptions' }) + subscriptionId + '/';
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
         * Retrieves the member's offers.
         * @returns {Promise} Promise resolving to the member's offers.
         */
        async offers() {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'member/offers' });

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
         * Applies an offer to the member's subscription.
         * @param {Object} options - Options object.
         * @param {string} options.offerId - Offer ID.
         * @param {string} options.subscriptionId - Subscription ID.
         * @returns {Promise} Promise resolving to the response.
         */
        async applyOffer({ offerId, subscriptionId }) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer` });

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity,
                    offer_id: offerId
                })
            });
            return handleResponse(res);
        }
    };

    /**
     * Handles a response from the API.
     * @param {Response} response - Response object.
     * @returns {Promise} Promise resolving to the response data.
     */
    function handleResponse(response) {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Failed to fetch data');
        }
    }

    /**
     * Handles a text response from the API.
     * @param {Response} response - Response object.
     * @returns {Promise} Promise resolving to the response text.
     */
    function handleTextResponse(response) {
        if (response.ok) {
            return response.text();
        } else {
            throw new Error('Failed to fetch data');
        }
    }

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

export default setupGhostApi;