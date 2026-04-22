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
     * @param {Object} options.params - The parameters for the endpoint.
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
     * @param {string} options.method - The method of the request.
     * @param {Object} options.headers - The headers of the request.
     * @param {string} options.credentials - The credentials of the request.
     * @param {string} options.body - The body of the request.
     * 
     * @returns {Promise} The response of the request.
     */
    function makeRequest({ url, method = 'GET', headers = {}, credentials = undefined, body = undefined }) {
        const options = {
            method,
            headers,
            credentials,
            body
        };
        return fetch(url, options);
    }

    /**
     * Handles the response of a request.
     * 
     * @param {Object} response - The response of the request.
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
     * Handles the response of a request and returns the JSON data.
     * 
     * @param {Object} response - The response of the request.
     * 
     * @returns {Promise} The JSON data of the response.
     */
    function handleJsonResponse(response) {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Failed to fetch data');
        }
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
        read() {
            const url = getEndpointUrl({ type: 'members', resource: 'site' });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleJsonResponse);
        },

        /**
         * Gets the newsletters.
         * 
         * @returns {Promise} The newsletters.
         */
        newsletters() {
            const url = getContentEndpointUrl({ resource: 'newsletters', params: { limit: 100 } });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleJsonResponse);
        },

        /**
         * Gets the tiers.
         * 
         * @returns {Promise} The tiers.
         */
        tiers() {
            const url = getContentEndpointUrl({ resource: 'tiers', params: { limit: 100, include: 'monthly_price,yearly_price,benefits' } });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleJsonResponse);
        },

        /**
         * Gets the settings.
         * 
         * @returns {Promise} The settings.
         */
        settings() {
            const url = getContentEndpointUrl({ resource: 'settings' });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleJsonResponse);
        },

        /**
         * Gets an offer.
         * 
         * @param {Object} options - Options for getting the offer.
         * @param {string} options.offerId - The ID of the offer.
         * 
         * @returns {Promise} The offer.
         */
        offer({ offerId }) {
            const url = getContentEndpointUrl({ resource: `offers/${offerId}` });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleJsonResponse);
        },

        /**
         * Gets the recommendations.
         * 
         * @param {Object} options - Options for getting the recommendations.
         * @param {number} options.limit - The limit of recommendations.
         * 
         * @returns {Promise} The recommendations.
         */
        recommendations({ limit = 100 } = { limit: 100 }) {
            const url = getContentEndpointUrl({ resource: 'recommendations', params: { limit } });
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(handleJsonResponse);
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
         * @returns {Promise} The result of adding feedback.
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
            if (res.ok) {
                return res.json();
            } else {
                throw (await HumanReadableError.fromApiResponse(res)) ?? new Error('Failed to save feedback');
            }
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
        identity() {
            const url = getEndpointUrl({ type: 'members', resource: 'session' });
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
         * Gets the member session data.
         * 
         * @returns {Promise} The member session data.
         */
        sessionData() {
            const url = getEndpointUrl({ type: 'members', resource: 'member' });
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
         * Updates the member data.
         * 
         * @param {Object} options - Options for updating the member data.
         * @param {string} options.name - The name of the member.
         * @param {boolean} options.subscribed - Whether the member is subscribed.
         * @param {Array} options.newsletters - The newsletters of the member.
         * @param {boolean} options.enableCommentNotifications - Whether to enable comment notifications.
         * 
         * @returns {Promise} The result of updating the member data.
         */
        update({ name, subscribed, newsletters, enableCommentNotifications }) {
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
            }).then(function (res) {
                if (!res.ok) {
                    return null;
                }
                return res.json();
            });
        },

        /**
         * Deletes the member suppression.
         * 
         * @returns {Promise} The result of deleting the member suppression.
         */
        deleteSuppression() {
            const url = getEndpointUrl({ type: 'members', resource: 'member/suppression' });

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
         * Gets the integrity token.
         * 
         * @returns {Promise} The integrity token.
         */
        async getIntegrityToken() {
            const url = getEndpointUrl({ type: 'members', resource: 'integrity-token' });
            const res = await makeRequest({
                url,
                method: 'GET'
            });

            if (res.ok) {
                return res.text();
            } else {
                const humanError = await HumanReadableError.fromApiResponse(res);
                if (humanError) {
                    throw humanError;
                }
                throw new Error('Failed to start a members session');
            }
        },

        /**
         * Sends a magic link.
         * 
         * @param {Object} options - Options for sending a magic link.
         * @param {string} options.email - The email of the member.
         * @param {string} options.emailType - The type of email.
         * @param {Array} options.labels - The labels of the member.
         * @param {string} options.name - The name of the member.
         * @param {string} options.oldEmail - The old email of the member.
         * @param {Array} options.newsletters - The newsletters of the member.
         * @param {string} options.redirect - The redirect URL.
         * @param {string} options.integrityToken - The integrity token.
         * @param {string} options.phonenumber - The phone number of the member.
         * @param {string} options.customUrlHistory - The custom URL history.
         * @param {string} options.token - The token.
         * @param {boolean} options.autoRedirect - Whether to auto redirect.
         * @param {boolean} options.includeOTC - Whether to include OTC.
         * 
         * @returns {Promise} The result of sending a magic link.
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

            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const contentType = (res.headers.get('content-type') || '').toLowerCase();
                if (contentType.includes('application/json')) {
                    try {
                        return await res.json();
                    } catch (e) {
                        // fall through to response used pre-OTC
                    }
                }
                return {};
            } else {
                const humanError = await HumanReadableError.fromApiResponse(res);
                if (humanError) {
                    throw humanError;
                }
                throw new Error('Failed to send magic link email');
            }
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
         * @returns {Promise} The result of verifying an OTC.
         */
        async verifyOTC({ otc, otcRef, redirect, integrityToken }) {
            const url = getEndpointUrl({ type: 'members', resource: 'verify-otc' });
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

            if (res.ok) {
                return await res.json();
            } else {
                const humanError = await HumanReadableError.fromApiResponse(res);
                if (humanError) {
                    throw humanError;
                }
                throw new Error('Failed to verify code');
            }
        },

        /**
         * Signs out the member.
         * 
         * @param {Object} options - Options for signing out the member.
         * @param {boolean} options.all - Whether to sign out all sessions.
         * 
         * @returns {Promise} The result of signing out the member.
         */
        signout(all = false) {
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
            }).then(function (res) {
                if (!res.ok || res.status === 204) {
                    return null;
                }
                return res.json();
            });
        },

        /**
         * Updates the member newsletters.
         * 
         * @param {Object} options - Options for updating the member newsletters.
         * @param {string} options.uuid - The UUID of the member.
         * @param {Array} options.newsletters - The newsletters of the member.
         * @param {string} options.key - The key of the member.
         * @param {boolean} options.enableCommentNotifications - Whether to enable comment notifications.
         * 
         * @returns {Promise} The result of updating the member newsletters.
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
            }).then(function (res) {
                if (res.ok) {
                    return res.json();
                } else {
                    throw new Error('Failed to update email preferences');
                }
            });
        },

        /**
         * Updates the member email address.
         * 
         * @param {Object} options - Options for updating the member email address.
         * @param {string} options.email - The new email address of the member.
         * 
         * @returns {Promise} The result of updating the member email address.
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
            }).then(async function (res) {
                if (res.ok) {
                    return 'Success';
                } else {
                    const errData = await res.json();
                    const errMssg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
                    throw new Error(errMssg);
                }
            });
        },

        /**
         * Checks out a plan.
         * 
         * @param {Object} options - Options for checking out a plan.
         * @param {string} options.plan - The plan to check out.
         * @param {string} options.tierId - The tier ID of the plan.
         * @param {string} options.cadence - The cadence of the plan.
         * @param {string} options.cancelUrl - The cancel URL.
         * @param {string} options.successUrl - The success URL.
         * @param {string} options.email - The email of the member.
         * @param {string} options.name - The name of the member.
         * @param {string} options.offerId - The offer ID.
         * @param {Array} options.newsletters - The newsletters of the member.
         * @param {Object} options.metadata - The metadata of the plan.
         * 
         * @returns {Promise} The result of checking out a plan.
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
            }).then(async function (res) {
                if (!res.ok) {
                    const errData = await res.json();
                    const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                    throw new Error(errMssg);
                }
                return res.json();
            }).then(function (responseBody) {
                if (responseBody.url) {
                    return window.location.assign(responseBody.url);
                }
                const stripe = window.Stripe(responseBody.publicKey);
                return stripe.redirectToCheckout({
                    sessionId: responseBody.sessionId
                }).then(function (redirectResult) {
                    if (redirectResult.error) {
                        throw new Error(redirectResult.error.message);
                    }
                });
            });
        },

        /**
         * Checks out a donation.
         * 
         * @param {Object} options - Options for checking out a donation.
         * @param {string} options.successUrl - The success URL.
         * @param {string} options.cancelUrl - The cancel URL.
         * @param {Object} options.metadata - The metadata of the donation.
         * @param {string} options.personalNote - The personal note of the donation.
         * 
         * @returns {Promise} The result of checking out a donation.
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

            const response = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
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

        /**
         * Edits the billing information.
         * 
         * @param {Object} options - Options for editing the billing information.
         * @param {string} options.successUrl - The success URL.
         * @param {string} options.cancelUrl - The cancel URL.
         * @param {string} options.subscriptionId - The subscription ID.
         * 
         * @returns {Promise} The result of editing the billing information.
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
            }).then(function (res) {
                if (!res.ok) {
                    throw new Error('Unable to create stripe checkout session');
                }
                return res.json();
            }).then(function (result) {
                const stripe = window.Stripe(result.publicKey);
                return stripe.redirectToCheckout({
                    sessionId: result.sessionId
                });
            }).then(function (result) {
                if (result.error) {
                    throw new Error(result.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        },

        /**
         * Manages the billing portal.
         * 
         * @param {Object} options - Options for managing the billing portal.
         * @param {string} options.returnUrl - The return URL.
         * @param {string} options.subscriptionId - The subscription ID.
         * 
         * @returns {Promise} The result of managing the billing portal.
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
            }).then(function (res) {
                if (!res.ok) {
                    throw new Error('Unable to create Stripe billing portal session');
                }
                return res.json();
            }).then(function (result) {
                return window.location.assign(result.url);
            }).catch(function (err) {
                throw err;
            });
        },

        /**
         * Updates the subscription.
         * 
         * @param {Object} options - Options for updating the subscription.
         * @param {string} options.subscriptionId - The subscription ID.
         * @param {string} options.tierId - The tier ID.
         * @param {string} options.cadence - The cadence.
         * @param {string} options.planId - The plan ID.
         * @param {boolean} options.smartCancel - Whether to smart cancel.
         * @param {boolean} options.cancelAtPeriodEnd - Whether to cancel at period end.
         * @param {string} options.cancellationReason - The cancellation reason.
         * 
         * @returns {Promise} The result of updating the subscription.
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
            });
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
            }).then(function (res) {
                if (!res.ok) {
                    return { offers: [] };
                }
                return res.json();
            }).catch(function () {
                return { offers: [] };
            });
        },

        /**
         * Applies an offer.
         * 
         * @param {Object} options - Options for applying an offer.
         * @param {string} options.offerId - The offer ID.
         * @param {string} options.subscriptionId - The subscription ID.
         * 
         * @returns {Promise} The result of applying an offer.
         */
        async applyOffer({ offerId, subscriptionId }) {
            const identity = await api.member.identity();
            const url = getEndpointUrl({ type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer` });

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

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }

            return true;
        }
    };

    /**
     * Initializes the API.
     * 
     * @returns {Promise} The result of initializing the API.
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
```