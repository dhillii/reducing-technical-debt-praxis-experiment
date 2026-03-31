```javascript
import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

const JSON_HEADERS = {'Content-Type': 'application/json'};

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    function membersEndpoint(resource) {
        return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
    }

    function contentEndpointFor({resource, params = {}}) {
        if (!apiUrl || !apiKey) {
            return '';
        }
        const searchParams = new URLSearchParams({...params, key: apiKey});
        return `${apiUrl.replace(/\/$/, '')}/${resource}/?${searchParams.toString()}`;
    }

    function makeRequest({url, method = 'GET', headers = {}, credentials, body}) {
        return fetch(url, {method, headers, credentials, body});
    }

    async function handleJsonResponse(res, errorMessage) {
        if (res.ok) {
            return res.json();
        }
        throw new Error(errorMessage);
    }

    async function handleHumanReadableResponse(res, fallbackMessage) {
        if (res.ok) {
            return res.json();
        }
        throw (await HumanReadableError.fromApiResponse(res)) ?? new Error(fallbackMessage);
    }

    function getStripeRedirectUrl(paramValue) {
        const siteUrlObj = new URL(siteUrl);
        const isOnSite = window.location.href.startsWith(siteUrlObj.href);
        const url = isOnSite ? new URL(window.location.href) : new URL(siteUrl);
        url.searchParams.set('stripe', paramValue);
        return url.href;
    }

    function buildFpMetadata(extra = {}) {
        return {
            fp_tid: (window.FPROM || window.$FPROM)?.data?.tid,
            urlHistory: getUrlHistory(),
            ...extra
        };
    }

    async function getContentResource(resource, params, errorMessage = 'Failed to fetch site data') {
        const url = contentEndpointFor({resource, params});
        const res = await makeRequest({url, method: 'GET', headers: JSON_HEADERS});
        return handleJsonResponse(res, errorMessage);
    }

    async function redirectToStripeCheckout(responseBody) {
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
        }
    }

    const api = {};

    api.site = {
        read() {
            const url = membersEndpoint('site');
            return makeRequest({url, method: 'GET', headers: JSON_HEADERS})
                .then(res => handleJsonResponse(res, 'Failed to fetch site data'));
        },

        newsletters() {
            return getContentResource('newsletters', {limit: 100});
        },

        tiers() {
            return getContentResource('tiers', {limit: 100, include: 'monthly_price,yearly_price,benefits'});
        },

        settings() {
            return getContentResource('settings');
        },

        offer({offerId}) {
            return getContentResource(`offers/${offerId}`, {}, 'Failed to fetch offer data');
        },

        recommendations({limit = 100} = {}) {
            return getContentResource('recommendations', {limit}, 'Failed to fetch recommendations');
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = membersEndpoint('feedback');
            if (uuid && key) {
                url += `?uuid=${uuid}&key=${key}`;
            }
            const body = JSON.stringify({feedback: [{post_id: postId, score}]});
            const res = await makeRequest({url, method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin', body});
            if (res.ok) {
                return res.json();
            }
            throw (await HumanReadableError.fromApiResponse(res)) ?? new Error('Failed to save feedback');
        }
    };

    api.recommendations = {
        trackClicked({recommendationId}) {
            navigator.sendBeacon(membersEndpoint(`recommendations/${recommendationId}/clicked`));
        },

        trackSubscribed({recommendationId}) {
            navigator.sendBeacon(membersEndpoint(`recommendations/${recommendationId}/subscribed`));
        }
    };

    api.member = {
        identity() {
            const url = membersEndpoint('session');
            return makeRequest({url, credentials: 'same-origin'}).then(res => {
                if (!res.ok || res.status === 204) {
                    return null;
                }
                return res.text();
            });
        },

        sessionData() {
            const url = membersEndpoint('member');
            return makeRequest({url, credentials: 'same-origin'}).then(res => {
                if (!res.ok || res.status === 204) {
                    return null;
                }
                return res.json();
            });
        },

        update({name, subscribed, newsletters, enableCommentNotifications}) {
            const url = membersEndpoint('member');
            const body = {name, subscribed, newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makeRequest({url, method: 'PUT', headers: JSON_HEADERS, credentials: 'same-origin', body: JSON.stringify(body)})
                .then(res => res.ok ? res.json() : null);
        },

        deleteSuppression() {
            const url = membersEndpoint('member/suppression');
            return makeRequest({url, method: 'DELETE'}).then(res => {
                if (!res.ok) {
                    throw new Error('Your email has failed to resubscribe, please try again');
                }
                return true;
            });
        },

        async getIntegrityToken() {
            const url = membersEndpoint('integrity-token');
            const res = await makeRequest({url, method: 'GET'});
            if (res.ok) {
                return res.text();
            }
            throw (await HumanReadableError.fromApiResponse(res)) ?? new Error('Failed to start a members session');
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
            const url = membersEndpoint('send-magic-link');
            const body = {
                name, email, newsletters, oldEmail, emailType, labels,
                requestSrc: 'portal', redirect, integrityToken,
                honeypot: phonenumber, token, autoRedirect, includeOTC
            };
            const urlHistory = customUrlHistory ?? getUrlHistory();
            if (urlHistory) {
                body.urlHistory = urlHistory;
            }

            const res = await makeRequest({url, method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body)});

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
            throw (await HumanReadableError.fromApiResponse(res)) ?? new Error('Failed to send magic link email');
        },

        async verifyOTC({otc, otcRef, redirect, integrityToken}) {
            const url = membersEndpoint('verify-otc');
            const body = JSON.stringify({otc, otcRef, redirect, integrityToken});
            const res = await makeRequest({url, method: 'POST', headers: JSON_HEADERS, body});
            return handleHumanReadableResponse(res, 'Failed to verify code');
        },

        signout(all = false) {
            const url = membersEndpoint('session');
            return makeRequest({url, method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({all})})
                .then(res => {
                    if (res.ok) {
                        window.location.replace(siteUrl);
                        return 'Success';
                    }
                    throw new Error('Failed to signout');
                });
        },

        async newsletters({uuid, key}) {
            const url = membersEndpoint('member/newsletters') + `?uuid=${uuid}&key=${key}`;
            return makeRequest({url, credentials: 'same-origin'}).then(res => {
                if (!res.ok || res.status === 204) {
                    return null;
                }
                return res.json();
            });
        },

        async updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            const url = membersEndpoint('member/newsletters') + `?uuid=${uuid}&key=${key}`;
            const body = {newsletters};
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }
            return makeRequest({url, method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body)})
                .then(res => handleJsonResponse(res, 'Failed to update email preferences'));
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = membersEndpoint('member/email');
            const res = await makeRequest({
                url, method: 'POST', headers: JSON_HEADERS,
                body: JSON.stringify({email, identity})
            });
            if (res.ok) {
                return 'Success';
            }
            const errData = await res.json();
            throw new Error(errData?.errors?.[0]?.message || 'Failed to send email address verification email');
        },

        async checkoutPlan({plan, tierId, cadence, cancelUrl, successUrl, email: customerEmail, name, offerId, newsletters, metadata = {}} = {}) {
            const siteUrlObj = new URL(siteUrl);
            const identity = await api.member.identity();
            const url = membersEndpoint('create-stripe-checkout-session');

            if (!cancelUrl) {
                const checkoutCancelUrl = window.location.href.startsWith(siteUrlObj.href)
                    ? new URL(window.location.href)
                    : new URL(siteUrl);
                checkoutCancelUrl.searchParams.set('stripe', 'cancel');
                cancelUrl = checkoutCancelUrl.href;
            }

            const metadataObj = buildFpMetadata({
                name,
                newsletters: JSON.stringify(newsletters),
                requestSrc: 'portal',
                ...metadata
            });

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

            const res = await makeRequest({url, method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body)});
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData?.errors?.[0]?.message || 'Failed to signup, please try again.');
            }
            const responseBody = await res.json();
            return redirectToStripeCheckout(responseBody);
        },

        async checkoutDonation({successUrl, cancelUrl, metadata = {}, personalNote = ''} = {}) {
            const identity = await api.member.identity();
            const url = membersEndpoint('create-stripe-checkout-session');
            const body = {
                identity,
                metadata: buildFpMetadata(metadata),
                successUrl,
                cancelUrl,
                type: 'donation',
                personalNote
            };

            const response = await makeRequest({url, method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body)});
            const responseJson = await response.json();

            if (!response.ok) {
                const error = responseJson?.errors?.[0];
                throw error ?? new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return responseJson;
        },

        async editBilling({successUrl, cancelUrl, subscriptionId} = {}) {
            const identity = await api.member.identity();
            const url = membersEndpoint('create-stripe-update-session');

            if (!successUrl) {
                const successUrlObj = new URL(siteUrl);
                successUrlObj.searchParams.set('stripe', 'billing-update-success');
                successUrl = successUrlObj.href;
            }

            if (!cancelUrl) {
                cancelUrl = getStripeRedirectUrl('billing-update-cancel');
            }

            const res = await makeRequest({
                url, method: 'POST', headers: JSON_HEADERS,
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
            const url = membersEndpoint('create-stripe-billing-portal-session');

            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const res = await makeRequest({
                url, method: 'POST', headers: JSON_HEADERS,
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
            const url = membersEndpoint('subscriptions') + subscriptionId + '/';
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

            return makeRequest({url, method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body)});
        },

        async offers() {
            const identity = await api.member.