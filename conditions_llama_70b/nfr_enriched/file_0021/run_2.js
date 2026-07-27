import { HumanReadableError } from './errors';
import { transformApiSiteData, transformApiTiersData, getUrlHistory } from './helpers';

function setupGhostApi({ siteUrl = window.location.origin, apiUrl, apiKey }) {
    const apiPath = 'members/api';

    /**
     * Returns the endpoint URL for a given resource type and resource name.
     * @param {Object} options - Options object.
     * @param {string} options.type - Type of resource (e.g., 'members').
     * @param {string} options.resource - Name of the resource.
     * @returns {string} The endpoint URL.
     */
    function endpointFor({ type, resource }) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
    }

    /**
     * Returns the content endpoint URL for a given resource name and optional parameters.
     * @param {Object} options - Options object.
     * @param {string} options.resource - Name of the resource.
     * @param {Object} [options.params] - Optional parameters.
     * @returns {string} The content endpoint URL.
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
     * Makes a request to the specified URL with the given options.
     * @param {Object} options - Options object.
     * @param {string} options.url - The URL to make the request to.
     * @param {string} [options.method='GET'] - The HTTP method to use.
     * @param {Object} [options.headers] - Optional headers.
     * @param {string} [options.credentials] - Optional credentials.
     * @param {string} [options.body] - Optional request body.
     * @returns {Promise} A promise that resolves to the response.
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

    /**
     * Handles the response from a request, throwing an error if the response is not OK.
     * @param {Response} response - The response to handle.
     * @returns {Promise} A promise that resolves to the response data.
     */
    async function handleResponse(response) {
        if (response.ok) {
            return response.json();
        } else {
            const humanError = await HumanReadableError.fromApiResponse(response);
            if (humanError) {
                throw humanError;
            }
            throw new Error('Failed to fetch data');
        }
    }

    const api = {};

    api.site = {
        /**
         * Reads the site data.
         * @returns {Promise} A promise that resolves to the site data.
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
         * Retrieves the newsletters.
         * @returns {Promise} A promise that resolves to the newsletters.
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
         * Retrieves the tiers.
         * @returns {Promise} A promise that resolves to the tiers.
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
         * Retrieves the settings.
         * @returns {Promise} A promise that resolves to the settings.
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
         * Retrieves an offer by ID.
         * @param {Object} options - Options object.
         * @param {string} options.offerId - The ID of the offer to retrieve.
         * @returns {Promise} A promise that resolves to the offer.
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
         * @param {number} [options.limit=100] - The number of recommendations to retrieve.
         * @returns {Promise} A promise that resolves to the recommendations.
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
         * @param {string} options.uuid - The UUID of the member.
         * @param {string} options.key - The key of the member.
         * @param {string} options.postId - The ID of the post.
         * @param {number} options.score - The score of the feedback.
         * @returns {Promise} A promise that resolves to the result of adding feedback.
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
         * @param {string} options.recommendationId - The ID of the recommendation.
         */
        trackClicked({ recommendationId }) {
            let url = endpointFor({ type: 'members', resource: `recommendations/${recommendationId}/clicked` });
            navigator.sendBeacon(url);
        },

        /**
         * Tracks a subscribed recommendation.
         * @param {Object} options - Options object.
         * @param {string} options.recommendationId - The ID of the recommendation.
         */
        trackSubscribed({ recommendationId }) {
            let url = endpointFor({ type: 'members', resource: `recommendations/${recommendationId}/subscribed` });
            navigator.sendBeacon(url);
        }
    };

    api.member = {
        /**
         * Retrieves the member's identity.
         * @returns {Promise} A promise that resolves to the member's identity.
         */
        identity() {
            const url = endpointFor({ type: 'members', resource: 'session' });
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(function (res) {
                if (!res.ok || res.status === 204) {
                    return null;
                }
                return res.text();
            });
        },

        /**
         * Retrieves the member's session data.
         * @returns {Promise} A promise that resolves to the member's session data.
         */
        sessionData() {
            const url = endpointFor({ type: 'members', resource: 'member' });
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(function (res) {
                if (!res.ok || res.status === 204) {
                    return null;
                }
                return res.json();
            });
        },

        /**
         * Updates the member's data.
         * @param {Object} options - Options object.
         * @param {string} options.name - The member's name.
         * @param {boolean} options.subscribed - Whether the member is subscribed.
         * @param {Array} options.newsletters - The member's newsletters.
         * @param {boolean} [options.enableCommentNotifications] - Whether to enable comment notifications.
         * @returns {Promise} A promise that resolves to the result of updating the member's data.
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
            }).then(function (res) {
                if (!res.ok) {
                    return null;
                }
                return res.json();
            });
        },

        /**
         * Deletes the member's suppression.
         * @returns {Promise} A promise that resolves to the result of deleting the member's suppression.
         */
        deleteSuppression() {
            const url = endpointFor({ type: 'members', resource: 'member/suppression' });

            return makeRequest({
                url,
                method: 'DELETE'
            }).then(function (res) {
                if (!res.ok) {
                    throw new Error('Your email has failed to resubscribe, please try again');
                }
                return true;
            });
        },

        /**
         * Retrieves the member's integrity token.
         * @returns {Promise} A promise that resolves to the member's integrity token.
         */
        async getIntegrityToken() {
            const url = endpointFor({ type: 'members', resource: 'integrity-token' });
            const res = await makeRequest({
                url,
                method: 'GET'
            });
            return handleResponse(res);
        },

        /**
         * Sends a magic link to the member.
         * @param {Object} options - Options object.
         * @param {string} options.email - The member's email.
         * @param {string} options.emailType - The type of email.
         * @param {Array} options.labels - The member's labels.
         * @param {string} options.name - The member's name.
         * @param {string} options.oldEmail - The member's old email.
         * @param {Array} options.newsletters - The member's newsletters.
         * @param {string} options.redirect - The redirect URL.
         * @param {string} options.integrityToken - The integrity token.
         * @param {string} options.phonenumber - The member's phone number.
         * @param {string} [options.customUrlHistory] - The custom URL history.
         * @param {string} options.token - The token.
         * @param {boolean} [options.autoRedirect=true] - Whether to auto-redirect.
         * @param {boolean} [options.includeOTC] - Whether to include OTC.
         * @returns {Promise} A promise that resolves to the result of sending the magic link.
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
         * @param {string} options.otc - The OTC to verify.
         * @param {string} options.otcRef - The OTC reference.
         * @param {string} options.redirect - The redirect URL.
         * @param {string} options.integrityToken - The integrity token.
         * @returns {Promise} A promise that resolves to the result of verifying the OTC.
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
         * @param {boolean} all - Whether to sign out all sessions.
         * @returns {Promise} A promise that resolves to the result of signing out.
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
            }).then(function (res) {
                if (res.ok) {
                    window.location.replace(siteUrl);
                    return 'Success';
                } else {
                    throw new Error('Failed to signout');
                }
            });
        },

        /**
         * Retrieves the member's newsletters.
         * @param {Object} options - Options object.
         * @param {string} options.uuid - The member's UUID.
         * @param {string} options.key - The member's key.
         * @returns {Promise} A promise that resolves to the member's newsletters.
         */
        async newsletters({ uuid, key }) {
            let url = endpointFor({ type: 'members', resource: `member/newsletters` });
            url = url + `?uuid=${uuid}&key=${key}`;
            const res = await makeRequest({
                url,
                credentials: 'same-origin'
            });
            return handleResponse(res);
        },

        /**
         * Updates the member's newsletters.
         * @param {Object} options - Options object.
         * @param {string} options.uuid - The member's UUID.
         * @param {Array} options.newsletters - The member's newsletters.
         * @param {string} options.key - The member's key.
         * @param {boolean} [options.enableCommentNotifications] - Whether to enable comment notifications.
         * @returns {Promise} A promise that resolves to the result of updating the member's newsletters.
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

            const res = await makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            return handleResponse(res);
        },

        /**
         * Updates the member's email address.
         * @param {Object} options - Options object.
         * @param {string} options.email - The new email address.
         * @returns {Promise} A promise that resolves to the result of updating the member's email address.
         */
        async updateEmailAddress({ email }) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'member/email' });
            const body = {
                email,
                identity
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
         * Checks out a plan.
         * @param {Object} options - Options object.
         * @param {string} options.plan - The plan to checkout.
         * @param {string} options.tierId - The tier ID.
         * @param {string} options.cadence - The cadence.
         * @param {string} options.cancelUrl - The cancel URL.
         * @param {string} options.successUrl - The success URL.
         * @param {string} options.email - The customer's email.
         * @param {string} options.name - The customer's name.
         * @param {string} options.offerId - The offer ID.
         * @param {Array} options.newsletters - The customer's newsletters.
         * @param {Object} [options.metadata] - The metadata.
         * @returns {Promise} A promise that resolves to the result of checking out the plan.
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
         * Checks out a donation.
         * @param {Object} options - Options object.
         * @param {string} options.successUrl - The success URL.
         * @param {string} options.cancelUrl - The cancel URL.
         * @param {Object} [options.metadata] - The metadata.
         * @param {string} [options.personalNote] - The personal note.
         * @returns {Promise} A promise that resolves to the result of checking out the donation.
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
         * Edits the billing information.
         * @param {Object} options - Options object.
         * @param {string} options.successUrl - The success URL.
         * @param {string} options.cancelUrl - The cancel URL.
         * @param {string} options.subscriptionId - The subscription ID.
         * @returns {Promise} A promise that resolves to the result of editing the billing information.
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
            const res = await makeRequest({
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
            });
            return handleResponse(res);
        },

        /**
         * Manages the billing portal.
         * @param {Object} options - Options object.
         * @param {string} options.returnUrl - The return URL.
         * @param {string} options.subscriptionId - The subscription ID.
         * @returns {Promise} A promise that resolves to the result of managing the billing portal.
         */
        async manageBilling({ returnUrl, subscriptionId } = {}) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'create-stripe-billing-portal-session' });
            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const res = await makeRequest({
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
            });
            return handleResponse(res);
        },

        /**
         * Updates the subscription.
         * @param {Object} options - Options object.
         * @param {string} options.subscriptionId - The subscription ID.
         * @param {string} options.tierId - The tier ID.
         * @param {string} options.cadence - The cadence.
         * @param {string} options.planId - The plan ID.
         * @param {boolean} options.smartCancel - Whether to smart cancel.
         * @param {boolean} options.cancelAtPeriodEnd - Whether to cancel at period end.
         * @param {string} options.cancellationReason - The cancellation reason.
         * @returns {Promise} A promise that resolves to the result of updating the subscription.
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

            const res = await makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            return handleResponse(res);
        },

        /**
         * Retrieves the member's offers.
         * @returns {Promise} A promise that resolves to the member's offers.
         */
        async offers() {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'member/offers' });

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ identity })
            });
            return handleResponse(res);
        },

        /**
         * Applies an offer to the member's subscription.
         * @param {Object} options - Options object.
         * @param {string} options.offerId - The ID of the offer to apply.
         * @param {string} options.subscriptionId - The ID of the subscription.
         * @returns {Promise} A promise that resolves to the result of applying the offer.
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
     * Initializes the API.
     * @returns {Promise} A promise that resolves to the initialized API data.
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

export default setupGhostApi;