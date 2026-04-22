import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

/**
 * Perform a fetch request and return the raw response.
 * @param {string} url
 * @param {RequestInit} [options={}]
 * @returns {Promise<Response>}
 */
function makeRequest({url, method = 'GET', headers = {}, credentials, body} = {}) {
    const options = {
        method,
        headers,
        credentials,
        body
    };
    return fetch(url, options);
}

/**
 * Process a JSON response, throwing a HumanReadableError or generic Error on failure.
 * @param {Response} res
 * @param {string} fallbackMessage
 * @returns {Promise<any>}
 */
async function handleJsonResponse(res, fallbackMessage) {
    if (res.ok) {
        return res.json();
    }
    const humanError = HumanReadableError.fromApiResponse(res);
    if (humanError) {
        throw humanError;
    }
    throw new Error(fallbackMessage);
}

/**
 * Process a text response, returning null on non‑OK or 204 status.
 * @param {Response} res
 * @returns {Promise<string|null>}
 */
async function handleTextResponse(res) {
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.text();
}

/**
 * Build a members API endpoint URL.
 * @param {{type:string, resource:string}} param0
 * @returns {string|undefined}
 */
function endpointFor({type, resource}) {
    if (type === 'members') {
        return `${siteUrl.replace(/\\/$/, '')}/${apiPath}/${resource}/`;
    }
}

/**
 * Build a content endpoint URL.
 * @param {{resource:string, params?:Object}} param0
 * @returns {string}
 */
function contentEndpointFor({resource, params = {}}) {
    if (apiUrl && apiKey) {
        const searchParams = new URLSearchParams({
            ...params,
            key: apiKey
        });
        return `${apiUrl.replace(/\\/$/, '')}/${resource}/?${searchParams.toString()}`;
    }
    return '';
}

/**
 * Common JSON GET request helper.
 * @param {string} url
 * @param {string} errorMessage
 * @returns {Promise<any>}
 */
function getJson(url, errorMessage) {
    return makeRequest({url, method: 'GET', headers: {'Content-Type': 'application/json'}})
        .then(res => handleJsonResponse(res, errorMessage));
}

/**
 * Common JSON POST request helper.
 * @param {string} url
 * @param {Object} body
 * @param {string} errorMessage
 * @returns {Promise<any>}
 */
function postJson(url, body, errorMessage) {
    return makeRequest({
        url,
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    }).then(res => handleJsonResponse(res, errorMessage));
}

/**
 * Common JSON PUT request helper.
 * @param {string} url
 * @param {Object} body
 * @param {string} errorMessage
 * @returns {Promise<any>}
 */
function putJson(url, body, errorMessage) {
    return makeRequest({
        url,
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    }).then(res => {
        if (!res.ok) {
            throw new Error(errorMessage);
        }
        return res.json();
    });
}

/**
 * Common DELETE request helper.
 * @param {string} url
 * @param {string} errorMessage
 * @returns {Promise<any>}
 */
function deleteRequest(url, errorMessage) {
    return makeRequest({url, method: 'DELETE'}).then(res => {
        if (!res.ok) {
            throw new Error(errorMessage);
        }
        return true;
    });
}

/**
 * Setup Ghost API client.
 * @param {{siteUrl?:string, apiUrl?:string, apiKey?:string}} config
 * @returns {any}
 */
function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    const api = {};

    // Site endpoints
    api.site = {
        read: () => getJson(endpointFor({type: 'members', resource: 'site'}), 'Failed to fetch site data'),
        newsletters: () => getJson(contentEndpointFor({resource: 'newsletters', params: {limit: 100}}), 'Failed to fetch site data'),
        tiers: () => getJson(contentEndpointFor({resource: 'tiers', params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}}), 'Failed to fetch site data'),
        settings: () => getJson(contentEndpointFor({resource: 'settings'}), 'Failed to fetch site data'),
        offer: ({offerId}) => getJson(contentEndpointFor({resource: `offers/${offerId}`}), 'Failed to fetch offer data'),
        recommendations: ({limit = 100} = {}) => getJson(contentEndpointFor({resource: 'recommendations', params: {limit}}), 'Failed to fetch recommendations')
    };

    // Feedback endpoint
    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url = `${url}?uuid=${uuid}&key=${key}`;
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
            if (res.ok) {
                return res.json();
            }
            const humanError = HumanReadableError.fromApiResponse(res);
            throw humanError ?? new Error('Failed to save feedback');
        }
    };

    // Recommendations tracking
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

    // Member endpoints
    api.member = {
        identity: () => makeRequest({url: endpointFor({type: 'members', resource: 'session'}), credentials: 'same-origin'}).then(handleTextResponse),

        sessionData: () => makeRequest({url: endpointFor({type: 'members', resource: 'member'}), credentials: 'same-origin'}).then(res => {
            if (!res.ok || res.status === 204) {
                return null;
            }
            return res.json();
        }),

        update: ({name, subscribed, newsletters, enableCommentNotifications}) => {
            const url = endpointFor({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return putJson(url, body, 'Failed to update member');
        },

        deleteSuppression: () => deleteRequest(endpointFor({type: 'members', resource: 'member/suppression'}), 'Your email has failed to resubscribe, please try again'),

        async getIntegrityToken() {
            const res = await makeRequest({url: endpointFor({type: 'members', resource: 'integrity-token'}), method: 'GET'});
            if (res.ok) {
                return res.text();
            }
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
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
                const contentType = (res.headers.get('content-type') || '').toLowerCase();
                if (contentType.includes('application/json')) {
                    try {
                        return await res.json();
                    } catch (e) {
                        // fall through
                    }
                }
                return {};
            }
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
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
            const humanError = HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error('Failed to verify code');
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

        newsletters: async ({uuid, key}) => {
            const url = `${endpointFor({type: 'members', resource: 'member/newsletters'})}?uuid=${uuid}&key=${key}`;
            return makeRequest({url, credentials: 'same-origin'}).then(res => {
                if (!res.ok || res.status === 204) {
                    return null;
                }
                return res.json();
            });
        },

        updateNewsletters: async ({uuid, newsletters, key, enableCommentNotifications}) => {
            const url = `${endpointFor({type: 'members', resource: 'member/newsletters'})}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return putJson(url, body, 'Failed to update email preferences');
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

        async checkoutPlan({plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {}} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'});

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
                const checkoutCancelUrl = window.location.href.startsWith(siteUrlObj.href) ? new URL(window.location.href) : new URL(siteUrl);
                checkoutCancelUrl.searchParams.set('stripe', 'billing-update-cancel');
                cancelUrl = checkoutCancelUrl.href;
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
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
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
            return window.location.assign(result.url);
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
            return postJson(url, {identity}, 'Failed to load offers')
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
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }
            return true;
        }
    };

    // Initialization
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
        } catch (e) {
            // ignore
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