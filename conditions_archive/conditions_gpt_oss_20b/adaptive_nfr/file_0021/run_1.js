import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

/**
 * @typedef {Object} RequestOptions
 * @property {string} url
 * @property {string} [method]
 * @property {Object} [headers]
 * @property {string} [credentials]
 * @property {string} [body]
 */

/**
 * Builds the full endpoint URL for a given type and resource.
 * @param {Object} params
 * @param {string} params.type
 * @param {string} params.resource
 * @returns {string}
 */
function endpointFor({type, resource}) {
    if (type === 'members') {
        return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
    }
}

/**
 * Builds the full content endpoint URL for a given resource and query params.
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
 * Performs a fetch request with the given options.
 * @param {RequestOptions} options
 * @returns {Promise<Response>}
 */
function makeRequest({url, method = 'GET', headers = {}, credentials = undefined, body = undefined}) {
    const options = {
        method,
        headers,
        credentials,
        body
    };
    return fetch(url, options);
}

/**
 * Handles a JSON response, throwing an error if the response is not OK.
 * @param {string} url
 * @param {Object} options
 * @param {string} errorMsg
 * @returns {Promise<any>}
 */
function fetchJson(url, options, errorMsg) {
    return makeRequest({url, ...options}).then(res => {
        if (!res.ok) {
            throw new Error(errorMsg);
        }
        return res.json();
    });
}

/**
 * Handles a JSON response, returning null for 204 or non-OK responses.
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<any|null>}
 */
function fetchJsonOrNull(url, options) {
    return makeRequest({url, ...options}).then(res => {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    });
}

/**
 * Handles a text response, returning null for 204 or non-OK responses.
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<string|null>}
 */
function fetchTextOrNull(url, options) {
    return makeRequest({url, ...options}).then(res => {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.text();
    });
}

/**
 * Handles a JSON response, returning an empty object if the response is not OK.
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<Object>}
 */
function fetchJsonOrEmpty(url, options) {
    return makeRequest({url, ...options}).then(res => {
        if (!res.ok) {
            return {};
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            return res.json();
        }
        return {};
    });
}

/**
 * Creates a site method that fetches JSON data for a given resource.
 * @param {Object} config
 * @param {string|function} config.resource
 * @param {Object|function} [config.params={}]
 * @param {string} config.errorMsg
 * @returns {function(...any): Promise<any>}
 */
function createSiteMethod({resource, params = {}, errorMsg}) {
    return function (...args) {
        const res = typeof resource === 'function' ? resource(...args) : resource;
        const p = typeof params === 'function' ? params(...args) : params;
        const url = contentEndpointFor({resource: res, params: p});
        return fetchJson(url, {method: 'GET', headers: {'Content-Type': 'application/json'}}, errorMsg);
    };
}

export default function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    const api = {};

    api.site = {
        read: createSiteMethod({resource: 'site', errorMsg: 'Failed to fetch site data'}),
        newsletters: createSiteMethod({resource: 'newsletters', params: {limit: 100}, errorMsg: 'Failed to fetch site data'}),
        tiers: createSiteMethod({resource: 'tiers', params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}, errorMsg: 'Failed to fetch site data'}),
        settings: createSiteMethod({resource: 'settings', errorMsg: 'Failed to fetch site data'}),
        offer: createSiteMethod({resource: (offerId) => `offers/${offerId}`, errorMsg: 'Failed to fetch offer data'}),
        recommendations: createSiteMethod({resource: 'recommendations', params: (limit = 100) => ({limit}), errorMsg: 'Failed to fetch recommendations'})
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url = `${url}?uuid=${uuid}&key=${key}`;
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
                const err = HumanReadableError.fromApiResponse(res);
                throw err ?? new Error('Failed to save feedback');
            }
        }
    };

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

    api.member = {
        identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            return fetchTextOrNull(url, {credentials: 'same-origin'});
        },

        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return fetchJsonOrNull(url, {credentials: 'same-origin'});
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member'});
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return fetchJsonOrNull(url, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
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
                return res.text();
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error('Failed to start a members session');
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
                    } catch {
                        // fall through to response used pre-OTC
                    }
                }
                return {};
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
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
                return res.json();
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
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

        async newsletters({uuid, key}) {
            let url = endpointFor({type: 'members', resource: 'member/newsletters'});
            url = `${url}?uuid=${uuid}&key=${key}`;
            return fetchJsonOrNull(url, {credentials: 'same-origin'});
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            let url = endpointFor({type: 'members', resource: 'member/newsletters'});
            url = `${url}?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return fetchJsonOrNull(url, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/email'});
            const body = {email, identity};
            return makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            }).then(async res => {
                if (res.ok) {
                    return 'Success';
                }
                const errData = await res.json();
                const errMssg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
                throw new Error(errMssg);
            });
        },

        async checkoutPlan({plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {}} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            let url = endpointFor({type: 'members', resource: 'create-stripe-checkout-session'});
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
            return makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            }).then(async res => {
                if (!res.ok) {
                    const errData = await res.json();
                    const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                    throw new Error(errMssg);
                }
                return res.json();
            }).then(responseBody => {
                if (responseBody.url) {
                    return window.location.assign(responseBody.url);
                }
                const stripe = window.Stripe(responseBody.publicKey);
                return stripe.redirectToCheckout({
                    sessionId: responseBody.sessionId
                }).then(redirectResult => {
                    if (redirectResult.error) {
                        throw new Error(redirectResult.error.message);
                    }
                });
            });
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
            let url = endpointFor({type: 'members', resource: 'create-stripe-update-session'});
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
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    subscription_id: subscriptionId,
                    successUrl,
                    cancelUrl
                })
            }).then(res => {
                if (!res.ok) {
                    throw new Error('Unable to create stripe checkout session');
                }
                return res.json();
            }).then(result => {
                const stripe = window.Stripe(result.publicKey);
                return stripe.redirectToCheckout({
                    sessionId: result.sessionId
                });
            }).then(result => {
                if (result.error) {
                    throw new Error(result.error.message);
                }
            }).catch(err => {
                throw err;
            });
        },

        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();
            let url = endpointFor({type: 'members', resource: 'create-stripe-billing-portal-session'});
            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }
            return makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    subscription_id: subscriptionId,
                    returnUrl
                })
            }).then(res => {
                if (!res.ok) {
                    throw new Error('Unable to create Stripe billing portal session');
                }
                return res.json();
            }).then(result => {
                return window.location.assign(result.url);
            }).catch(err => {
                throw err;
            });
        },

        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: `subscriptions/${subscriptionId}/`});
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
            return makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity})
            }).then(res => {
                if (!res.ok) {
                    return {offers: []};
                }
                return res.json();
            }).catch(() => {
                return {offers: []};
            });
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer`});
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
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

    api.init = async () => {
        const [member] = await Promise.all([api.member.sessionData()]);
        let site = {};
        let newsletters = [];
        let tiers = [];
        let settings = {};
        let offers = [];
        try {
            const [{settings: s}, {tiers: t}, {newsletters: n}] = await Promise.all([
                api.site.settings(),
                api.site.tiers(),
                api.site.newsletters()
            ]);
            site = {
                ...s,
                newsletters: n,
                tiers: transformApiTiersData({tiers: t})
            };
        } catch {
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