import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

/**
 * Extracted predicate to check if response is OK
 * @param {Response} res
 * @returns {boolean}
 */
function isSuccessResponse(res) {
    return res.ok;
}

/**
 * Extracted predicate to check if response is an error requiring human error parsing
 * @param {Response} res
 * @returns {boolean}
 */
function isErrorResponse(res) {
    return !res.ok;
}

/**
 * Extracted predicate to check if response status is 204 or no content
 * @param {Response} res
 * @returns {boolean}
 */
function isNoContentResponse(res) {
    return res.status === 204;
}

/**
 * Extracted predicate to check if response has JSON content type
 * @param {Response} res
 * @returns {boolean}
 */
function isJsonContentType(res) {
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    return contentType.includes('application/json');
}

/**
 * Extracted helper to parse response JSON or handle fall-through scenarios
 * @param {Response} res
 * @returns {Promise<any>}
 */
async function parseJsonOrEmpty(res) {
    try {
        return await res.json();
    } catch (e) {
        return {};
    }
}

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    function endpointFor({type, resource}) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
    }

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
     * Strategy to parse successful JSON response
     * @param {Response} res
     * @returns {Promise<any>}
     */
    async function parseSuccessJson(res) {
        return res.json();
    }

    /**
     * Strategy to parse error response with human-readable error
     * @param {Response} res
     * @returns {Promise<never>}
     */
    async function parseErrorResponse(res) {
        const humanError = await HumanReadableError.fromApiResponse(res);
        if (humanError) {
            throw humanError;
        }
        throw new Error('Failed to fetch site data');
    }

    /**
     * Strategy to handle session identity responses
     * @param {Response} res
     * @returns {Promise<null|string>}
     */
    async function parseSessionIdentityResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.text();
    }

    /**
     * Strategy to handle session member data responses
     * @param {Response} res
     * @returns {Promise<null|object>}
     */
    async function parseSessionMemberDataResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    }

    /**
     * Strategy to handle newsletters data responses
     * @param {Response} res
     * @returns {Promise<null|object>}
     */
    async function parseNewslettersResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    }

    /**
     * Strategy to handle integrity token response
     * @param {Response} res
     * @returns {Promise<string|never>}
     */
    async function parseIntegrityTokenResponse(res) {
        if (res.ok) {
            return res.text();
        }
        await parseErrorResponse(res);
    }

    /**
     * Strategy to handle magic link response with fallback handling
     * @param {Response} res
     * @returns {Promise<any>}
     */
    async function parseMagicLinkResponse(res) {
        if (isSuccessResponse(res)) {
            if (isJsonContentType(res)) {
                return await parseJsonOrEmpty(res);
            }
            return {};
        }
        const humanError = await HumanReadableError.fromApiResponse(res);
        if (humanError) {
            throw humanError;
        }
        throw new Error('Failed to send magic link email');
    }

    /**
     * Strategy to handle OTC verification response
     * @param {Response} res
     * @returns {Promise<any>}
     */
    async function parseOTCResponse(res) {
        if (isSuccessResponse(res)) {
            return await res.json();
        }
        const humanError = await HumanReadableError.fromApiResponse(res);
        if (humanError) {
            throw humanError;
        }
        throw new Error('Failed to verify code');
    }

    /**
     * Strategy to handle checkout plan response with Stripe handling
     * @param {Response} res
     * @returns {Promise<any>}
     */
    async function parseCheckoutPlanResponse(res) {
        if (!isSuccessResponse(res)) {
            const errData = await res.json();
            const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
            throw new Error(errMssg);
        }
        const body = await res.json();
        if (body.url) {
            return window.location.assign(body.url);
        }
        const stripe = window.Stripe(body.publicKey);
        return stripe.redirectToCheckout({
            sessionId: body.sessionId
        }).then(function (redirectResult) {
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        });
    }

    /**
     * Strategy to handle checkout plan response directly (before Stripe redirect)
     * @param {Response} res
     * @returns {Promise<any>}
     */
    async function parseCheckoutPlanJsonResponse(res) {
        if (!isSuccessResponse(res)) {
            const errData = await res.json();
            const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
            throw new Error(errMssg);
        }
        return res.json();
    }

    /**
     * Strategy to handle checkout donation response
     * @param {Response} res
     * @returns {Promise<any>}
     */
    async function parseCheckoutDonationResponse(res) {
        const body = await res.json();
        if (!isSuccessResponse(res)) {
            const error = body?.errors?.[0];
            if (error) {
                throw error;
            }
            throw new Error('We\'re unable to process your payment right now. Please try again later.');
        }
        return body;
    }

    // Main API object
    const api = {};

    api.site = {
        /**
         * Read site data
         * @returns {Promise<any>}
         */
        read() {
            const url = endpointFor({type: 'members', resource: 'site'});
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(function (res) {
                if (isSuccessResponse(res)) {
                    return parseSuccessJson(res);
                } else {
                    parseErrorResponse(res);
                }
            });
        },

        /**
         * Read newsletters
         * @returns {Promise<any>}
         */
        newsletters() {
            const url = contentEndpointFor({resource: 'newsletters', params: {limit: 100}});
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(function (res) {
                if (isSuccessResponse(res)) {
                    return parseSuccessJson(res);
                } else {
                    throw new Error('Failed to fetch site data');
                }
            });
        },

        /**
         * Read tiers
         * @returns {Promise<any>}
         */
        tiers() {
            const url = contentEndpointFor({resource: 'tiers', params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}});
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(function (res) {
                if (isSuccessResponse(res)) {
                    return parseSuccessJson(res);
                } else {
                    throw new Error('Failed to fetch site data');
                }
            });
        },

        /**
         * Read site settings
         * @returns {Promise<any>}
         */
        settings() {
            const url = contentEndpointFor({resource: 'settings'});
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(function (res) {
                if (isSuccessResponse(res)) {
                    return parseSuccessJson(res);
                } else {
                    throw new Error('Failed to fetch site data');
                }
            });
        },

        /**
         * Read offer by ID
         * @param {{offerId: string}} params
         * @returns {Promise<any>}
         */
        offer({offerId}) {
            const url = contentEndpointFor({resource: `offers/${offerId}`});
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(function (res) {
                if (isSuccessResponse(res)) {
                    return parseSuccessJson(res);
                } else {
                    throw new Error('Failed to fetch offer data');
                }
            });
        },

        /**
         * Read recommendations
         * @param {{limit?: number}} [params={}]
         * @returns {Promise<any>}
         */
        recommendations({limit = 100} = {limit: 100}) {
            const url = contentEndpointFor({resource: 'recommendations', params: {limit}});
            return makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(function (res) {
                if (isSuccessResponse(res)) {
                    return parseSuccessJson(res);
                } else {
                    throw new Error('Failed to fetch recommendations');
                }
            });
        }
    };

    api.feedback = {
        /**
         * Add feedback
         * @param {{uuid?: string, key?: string, postId: string, score: number}} params
         * @returns {Promise<any>}
         */
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const body = {
                feedback: [{
                    post_id: postId,
                    score
                }]
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
            if (isSuccessResponse(res)) {
                return res.json();
            } else {
                const humanError = await HumanReadableError.fromApiResponse(res);
                throw humanError ?? new Error('Failed to save feedback');
            }
        }
    };

    api.recommendations = {
        /**
         * Track clicked recommendation
         * @param {{recommendationId: string}} params
         */
        trackClicked({recommendationId}) {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/clicked`});
            navigator.sendBeacon(url);
        },

        /**
         * Track subscribed recommendation
         * @param {{recommendationId: string}} params
         */
        trackSubscribed({recommendationId}) {
            const url = endpointFor({type: 'members', resource: `recommendations/${recommendationId}/subscribed`});
            navigator.sendBeacon(url);
        }
    };

    api.member = {
        /**
         * Get identity token
         * @returns {Promise<string|null>}
         */
        identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(function (res) {
                return parseSessionIdentityResponse(res);
            });
        },

        /**
         * Get session member data
         * @returns {Promise<object|null>}
         */
        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(function (res) {
                return parseSessionMemberDataResponse(res);
            });
        },

        /**
         * Update member data
         * @param {{name?: string, subscribed?: boolean, newsletters?: Array, enableCommentNotifications?: boolean}} params
         * @returns {Promise<object|null>}
         */
        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = endpointFor({type: 'members', resource: 'member'});
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
                if (!isSuccessResponse(res)) {
                    return null;
                }
                return res.json();
            });
        },

        /**
         * Delete member suppression
         * @returns {Promise<boolean>}
         */
        deleteSuppression() {
            const url = endpointFor({type: 'members', resource: 'member/suppression'});
            return makeRequest({
                url,
                method: 'DELETE'
            }).then(function (res) {
                if (isSuccessResponse(res)) {
                    return true;
                } else {
                    throw new Error('Your email has failed to resubscribe, please try again');
                }
            });
        },

        /**
         * Get integrity token
         * @returns {Promise<string>}
         */
        async getIntegrityToken() {
            const url = endpointFor({type: 'members', resource: 'integrity-token'});
            const res = await makeRequest({
                url,
                method: 'GET'
            });
            return parseIntegrityTokenResponse(res);
        },

        /**
         * Send magic link
         * @param {{email: string, emailType?: string, labels?: string, name?: string, oldEmail?: string, newsletters?: Array, redirect?: string, integrityToken?: string, phonenumber?: string, customUrlHistory?: Array, token?: string, autoRedirect?: boolean, includeOTC?: boolean}} params
         * @returns {Promise<any>}
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
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            return parseMagicLinkResponse(res);
        },

        /**
         * Verify one-time code
         * @param {{otc: string, otcRef?: string, redirect?: string, integrityToken?: string}} params
         * @returns {Promise<any>}
         */
        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = endpointFor({type: 'members', resource: 'verify-otc'});
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
            return parseOTCResponse(res);
        },

        /**
         * Signout
         * @param {boolean} [all=false]
         * @returns {Promise<string>}
         */
        signout(all = false) {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({
                url,
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({all})
            }).then(function (res) {
                if (isSuccessResponse(res)) {
                    window.location.replace(siteUrl);
                    return 'Success';
                } else {
                    throw new Error('Failed to signout');
                }
            });
        },

        /**
         * Get newsletters for member
         * @param {{uuid: string, key: string}} params
         * @returns {Promise<object|null>}
         */
        async newsletters({uuid, key}) {
            let url = endpointFor({type: 'members', resource: 'member/newsletters'});
            url += `?uuid=${uuid}&key=${key}`;
            const res = await makeRequest({
                url,
                credentials: 'same-origin'
            });
            return parseNewslettersResponse(res);
        },

        /**
         * Update newsletters for member
         * @param {{uuid: string, newsletters: Array, key: string, enableCommentNotifications?: boolean}} params
         * @returns {Promise<any>}
         */
        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            let url = endpointFor({type: 'members', resource: 'member/newsletters'});
            url += `?uuid=${uuid}&key=${key}`;
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
                if (isSuccessResponse(res)) {
                    return res.json();
                } else {
                    throw new Error('Failed to update email preferences');
                }
            });
        },

        /**
         * Update email address
         * @param {{email: string}} params
         * @returns {Promise<string>}
         */
        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/email'});
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
                if (isSuccessResponse(res)) {
                    return 'Success';
                } else {
                    const errData = await res.json();
                    const errMssg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
                    throw new Error(errMssg);
                }
            });
        },

        /**
         * Checkout plan
         * @param {{plan?: string, tierId?: string, cadence?: string, cancelUrl?: string, successUrl?: string, email?: string, name?: string, offerId?: string, newsletters?: Array, metadata?: object}} params
         * @returns {Promise<*>}
         */
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
            }).then(parseCheckoutPlanJsonResponse).then(parseCheckoutPlanResponse);
        },

        /**
         * Checkout donation
         * @param {{successUrl: string, cancelUrl: string, metadata?: object, personalNote?: string}} params
         * @returns {Promise<any>}
         */
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
            const res = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            return parseCheckoutDonationResponse(res);
        },

        /**
         * Edit billing
         * @param {{successUrl?: string, cancelUrl?: string, subscriptionId?: string}} params
         * @returns {Promise<void>}
         */
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
                if (isSuccessResponse(res)) {
                    return res.json();
                } else {
                    throw new Error('Unable to create stripe checkout session');
                }
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
         * Manage billing
         * @param {{returnUrl?: string, subscriptionId?: string}} params
         * @returns {Promise<void>}
         */
        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'create-stripe-billing-portal-session'});
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
                if (isSuccessResponse(res)) {
                    return res.json();
                } else {
                    throw new Error('Unable to create Stripe billing portal session');
                }
            }).then(function (result) {
                return window.location.assign(result.url);
            }).catch(function (err) {
                throw err;
            });
        },

        /**
         * Update subscription
         * @param {{subscriptionId: string, tierId?: string, cadence?: string, planId?: string, smartCancel?: boolean, cancelAtPeriodEnd?: boolean, cancellationReason?: string}} params
         * @returns {Promise<Response>}
         */
        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'subscriptions'}) + subscriptionId + '/';
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
         * Get member offers
         * @returns {Promise<any>}
         */
        async offers() {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/offers'});
            return makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({identity})
            }).then(function (res) {
                if (!isSuccessResponse(res)) {
                    return {offers: []};
                }
                return res.json();
            }).catch(function () {
                return {offers: []};
            });
        },

        /**
         * Apply offer to subscription
         * @param {{offerId: string, subscriptionId: string}} params
         * @returns {Promise<boolean>}
         */
        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer`});
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
            if (!isSuccessResponse(res)) {
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }
            return true;
        }
    };

    api.init = async () => {
        const [member] = await Promise.all([
            api.member.sessionData()
        ]);
        let site = {};
        let newsletters = [];
        let tiers = [];
        let settings = {};
        let offers = [];

        try {
            const [siteSettings, siteTiers, siteNewsletters] = await Promise.all([
                api.site.settings(),
                api.site.tiers(),
                api.site.newsletters()
            ]);
            settings = siteSettings;
            tiers = siteTiers;
            newsletters = siteNewsletters;
            site = {
                ...settings,
                newsletters,
                tiers: transformApiTiersData({tiers})
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

        site = transformApiSiteData({site});

        return {site, member, offers};
    };

    return api;
}

export default setupGhostApi;