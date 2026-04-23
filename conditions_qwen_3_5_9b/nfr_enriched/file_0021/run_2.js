import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function createUrlBuilder({siteUrl, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    function buildMembersUrl(resource) {
        return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
    }

    function buildContentUrl(resource, params = {}) {
        if (!apiUrl || !apiKey) {
            return '';
        }

        const searchParams = new URLSearchParams({
            ...params,
            key: apiKey
        });

        return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
    }

    return {
        buildMembersUrl,
        buildContentUrl
    };
}

function createRequestBuilder({url, method = 'GET', headers = {}, credentials = undefined, body = undefined}) {
    const options = {
        method,
        headers,
        credentials,
        body
    };
    return fetch(url, options);
}

function handleResponse(res, successMessage, errorMessage) {
    if (res.ok) {
        return res.json();
    }
    throw new Error(errorMessage);
}

function handleTextResponse(res, successMessage, errorMessage) {
    if (res.ok) {
        return res.text();
    }
    throw new Error(errorMessage);
}

function handleOptionalResponse(res, successMessage, errorMessage) {
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.json();
}

function handleOptionalTextResponse(res, successMessage, errorMessage) {
    if (!res.ok || res.status === 204) {
        return null;
    }
    return res.text();
}

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const urlBuilder = createUrlBuilder({siteUrl, apiUrl, apiKey});
    const api = {};

    api.site = {
        async read() {
            const url = urlBuilder.buildMembersUrl('site');
            const res = await createRequestBuilder({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return handleResponse(res, 'Site data', 'Failed to fetch site data');
        },

        async newsletters() {
            const url = urlBuilder.buildContentUrl('newsletters', {limit: 100});
            const res = await createRequestBuilder({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return handleResponse(res, 'Site data', 'Failed to fetch site data');
        },

        async tiers() {
            const url = urlBuilder.buildContentUrl('tiers', {limit: 100, include: 'monthly_price,yearly_price,benefits'});
            const res = await createRequestBuilder({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return handleResponse(res, 'Site data', 'Failed to fetch site data');
        },

        async settings() {
            const url = urlBuilder.buildContentUrl('settings');
            const res = await createRequestBuilder({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return handleResponse(res, 'Site data', 'Failed to fetch site data');
        },

        async offer({offerId}) {
            const url = urlBuilder.buildContentUrl(`offers/${offerId}`);
            const res = await createRequestBuilder({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return handleResponse(res, 'Offer data', 'Failed to fetch offer data');
        },

        async recommendations({limit = 100} = {limit: 100}) {
            const url = urlBuilder.buildContentUrl('recommendations', {limit});
            const res = await createRequestBuilder({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return handleResponse(res, 'Recommendations', 'Failed to fetch recommendations');
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = urlBuilder.buildMembersUrl('feedback');
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const body = {
                feedback: [
                    {
                        post_id: postId,
                        score
                    }
                ]
            };
            const res = await createRequestBuilder({
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
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error('Failed to save feedback');
        }
    };

    api.recommendations = {
        trackClicked({recommendationId}) {
            const url = urlBuilder.buildMembersUrl(`recommendations/${recommendationId}/clicked`);
            navigator.sendBeacon(url);
        },

        trackSubscribed({recommendationId}) {
            const url = urlBuilder.buildMembersUrl(`recommendations/${recommendationId}/subscribed`);
            navigator.sendBeacon(url);
        }
    };

    api.member = {
        async identity() {
            const url = urlBuilder.buildMembersUrl('session');
            const res = await createRequestBuilder({
                url,
                credentials: 'same-origin'
            });
            if (!res.ok || res.status === 204) {
                return null;
            }
            return res.text();
        },

        async sessionData() {
            const url = urlBuilder.buildMembersUrl('member');
            const res = await createRequestBuilder({
                url,
                credentials: 'same-origin'
            });
            return handleOptionalResponse(res, 'Session data', 'Failed to fetch session data');
        },

        async update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = urlBuilder.buildMembersUrl('member');
            const body = {
                name,
                subscribed,
                newsletters
            };
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            const res = await createRequestBuilder({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                return null;
            }
            return res.json();
        },

        async deleteSuppression() {
            const url = urlBuilder.buildMembersUrl('member/suppression');
            const res = await createRequestBuilder({
                url,
                method: 'DELETE'
            });
            if (!res.ok) {
                throw new Error('Your email has failed to resubscribe, please try again');
            }
            return true;
        },

        async getIntegrityToken() {
            const url = urlBuilder.buildMembersUrl('integrity-token');
            const res = await createRequestBuilder({
                url,
                method: 'GET'
            });

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
            const url = urlBuilder.buildMembersUrl('send-magic-link');
            const urlHistory = customUrlHistory ?? getUrlHistory();
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

            if (urlHistory) {
                body.urlHistory = urlHistory;
            }

            const res = await createRequestBuilder({
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
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error('Failed to send magic link email');
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = urlBuilder.buildMembersUrl('verify-otc');
            const body = {
                otc,
                otcRef,
                redirect,
                integrityToken
            };

            const res = await createRequestBuilder({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                return await res.json();
            }
            const humanError = await HumanReadableError.fromApiResponse(res);
            if (humanError) {
                throw humanError;
            }
            throw new Error('Failed to verify code');
        },

        async signout(all = false) {
            const url = urlBuilder.buildMembersUrl('session');
            const res = await createRequestBuilder({
                url,
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    all
                })
            });
            if (res.ok) {
                window.location.replace(siteUrl);
                return 'Success';
            }
            throw new Error('Failed to signout');
        },

        async newsletters({uuid, key}) {
            let url = urlBuilder.buildMembersUrl(`member/newsletters`);
            url += `?uuid=${uuid}&key=${key}`;
            const res = await createRequestBuilder({
                url,
                credentials: 'same-origin'
            });
            return handleOptionalResponse(res, 'Newsletters', 'Failed to fetch newsletters');
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            let url = urlBuilder.buildMembersUrl(`member/newsletters`);
            url += `?uuid=${uuid}&key=${key}`;
            const body = {
                newsletters
            };

            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            const res = await createRequestBuilder({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                return res.json();
            }
            throw new Error('Failed to update email preferences');
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = urlBuilder.buildMembersUrl('member/email');
            const body = {
                email,
                identity
            };

            const res = await createRequestBuilder({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
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
            const url = urlBuilder.buildMembersUrl('create-stripe-checkout-session');

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
            const res = await createRequestBuilder({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
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
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            }).then(function (redirectResult) {
                if (redirectResult.error) {
                    throw new Error(redirectResult.error.message);
                }
            });
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await api.member.identity();
            const url = urlBuilder.buildMembersUrl('create-stripe-checkout-session');

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

            const response = await createRequestBuilder({
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

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = urlBuilder.buildMembersUrl('create-stripe-update-session');
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
            const res = await createRequestBuilder({
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

            if (!res.ok) {
                throw new Error('Unable to create stripe checkout session');
            }
            const result = await res.json();
            const stripe = window.Stripe(result.publicKey);
            return stripe.redirectToCheckout({
                sessionId: result.sessionId
            }).then(function (result) {
                if (result.error) {
                    throw new Error(result.error.message);
                }
            }).catch(function (err) {
                throw err;
            });
        },

        async manageBilling({returnUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();
            const url = urlBuilder.buildMembersUrl('create-stripe-billing-portal-session');
            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const res = await createRequestBuilder({
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

            if (!res.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }
            const result = await res.json();
            return window.location.assign(result.url);
        },

        async updateSubscription({subscriptionId, tierId, cadence, planId, smartCancel, cancelAtPeriodEnd, cancellationReason}) {
            const identity = await api.member.identity();
            const url = urlBuilder.buildMembersUrl('subscriptions') + subscriptionId + '/';
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

            return createRequestBuilder({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
        },

        async offers() {
            const identity = await api.member.identity();
            const url = urlBuilder.buildMembersUrl('member/offers');

            const res = await createRequestBuilder({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({identity})
            });

            if (!res.ok) {
                return {offers: []};
            }
            return res.json();
        },

        async applyOffer({offerId, subscriptionId}) {
            const identity = await api.member.identity();
            const url = urlBuilder.buildMembersUrl(`subscriptions/${subscriptionId}/apply-offer`);

            const res = await createRequestBuilder({
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

    api.init = async () => {
        let member = null;
        let site = {};
        let newsletters = [];
        let tiers = [];
        let settings = {};
        let offers = [];

        try {
            [{settings}, {tiers}, {newsletters}] = await Promise.all([
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