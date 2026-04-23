import {HumanReadableError} from './errors';
import {transformApiSiteData, transformApiTiersData, getUrlHistory} from './helpers';

function setupGhostApi({siteUrl = window.location.origin, apiUrl, apiKey}) {
    const apiPath = 'members/api';

    // Constructs endpoint URL for members API resources
    function endpointFor({type, resource}) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
    }

    // Constructs content endpoint URL with API key authentication
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

    // Executes HTTP request with specified options
    function makeRequest({url, method = 'GET', headers = {}, credentials = undefined, body = undefined}) {
        const options = {
            method,
            headers,
            credentials,
            body
        };
        return fetch(url, options);
    }

    // Handles successful JSON response from API
    function handleJsonResponse(res) {
        if (res.ok) {
            return res.json();
        }
        throw new Error('Failed to fetch data');
    }

    // Handles response that may be empty or contain JSON
    function handleOptionalJsonResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.json();
    }

    // Handles response that may be empty or contain text
    function handleOptionalTextResponse(res) {
        if (!res.ok || res.status === 204) {
            return null;
        }
        return res.text();
    }

    // Makes GET request to members API endpoint
    function makeGetRequest(url, headers = {'Content-Type': 'application/json'}) {
        return makeRequest({url, method: 'GET', headers});
    }

    // Makes POST request to members API endpoint
    function makePostRequest(url, body, headers = {'Content-Type': 'application/json'}) {
        return makeRequest({url, method: 'POST', headers, body: JSON.stringify(body)});
    }

    // Makes PUT request to members API endpoint
    function makePutRequest(url, body, headers = {'Content-Type': 'application/json'}) {
        return makeRequest({url, method: 'PUT', headers, body: JSON.stringify(body)});
    }

    // Extracts error message from API response
    async function extractErrorMessage(res, defaultMessage) {
        const humanError = await HumanReadableError.fromApiResponse(res);
        if (humanError) {
            throw humanError;
        }
        throw new Error(defaultMessage);
    }

    const api = {};

    api.site = {
        read() {
            const url = endpointFor({type: 'members', resource: 'site'});
            return makeGetRequest(url).then(handleJsonResponse);
        },

        newsletters() {
            const url = contentEndpointFor({resource: 'newsletters', params: {limit: 100}});
            return makeGetRequest(url).then(handleJsonResponse);
        },

        tiers() {
            const url = contentEndpointFor({resource: 'tiers', params: {limit: 100, include: 'monthly_price,yearly_price,benefits'}});
            return makeGetRequest(url).then(handleJsonResponse);
        },

        settings() {
            const url = contentEndpointFor({resource: 'settings'});
            return makeGetRequest(url).then(handleJsonResponse);
        },

        offer({offerId}) {
            const url = contentEndpointFor({resource: `offers/${offerId}`});
            return makeGetRequest(url).then(handleJsonResponse);
        },

        recommendations({limit = 100} = {limit: 100}) {
            const url = contentEndpointFor({resource: 'recommendations', params: {limit}});
            return makeGetRequest(url).then(handleJsonResponse);
        }
    };

    api.feedback = {
        async add({uuid, key, postId, score}) {
            let url = endpointFor({type: 'members', resource: 'feedback'});
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
            }
            return extractErrorMessage(res, 'Failed to save feedback');
        }
    };

    api.recommendations = {
        trackClicked({recommendationId}) {
            const url = endpointFor({type: 'members', resource: 'recommendations/' + recommendationId + '/clicked'});
            navigator.sendBeacon(url);
        },

        trackSubscribed({recommendationId}) {
            const url = endpointFor({type: 'members', resource: 'recommendations/' + recommendationId + '/subscribed'});
            navigator.sendBeacon(url);
        }
    };

    api.member = {
        identity() {
            const url = endpointFor({type: 'members', resource: 'session'});
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(handleOptionalTextResponse);
        },

        sessionData() {
            const url = endpointFor({type: 'members', resource: 'member'});
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(handleOptionalJsonResponse);
        },

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
                if (!res.ok) {
                    return null;
                }
                return res.json();
            });
        },

        deleteSuppression() {
            const url = endpointFor({type: 'members', resource: 'member/suppression'});

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

        async getIntegrityToken() {
            const url = endpointFor({type: 'members', resource: 'integrity-token'});
            const res = await makeRequest({
                url,
                method: 'GET'
            });

            if (res.ok) {
                return res.text();
            }
            return extractErrorMessage(res, 'Failed to start a members session');
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
                        return {};
                    }
                }
                return {};
            }
            return extractErrorMessage(res, 'Failed to send magic link email');
        },

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

            if (res.ok) {
                return res.json();
            }
            return extractErrorMessage(res, 'Failed to verify code');
        },

        signout(all = false) {
            const url = endpointFor({type: 'members', resource: 'session'});
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
                }
                throw new Error('Failed to signout');
            });
        },

        newsletters({uuid, key}) {
            let url = endpointFor({type: 'members', resource: `member/newsletters`});
            url = url + `?uuid=${uuid}&key=${key}`;
            return makeRequest({
                url,
                credentials: 'same-origin'
            }).then(handleOptionalJsonResponse);
        },

        updateNewsletters({uuid, newsletters, key, enableCommentNotifications}) {
            let url = endpointFor({type: 'members', resource: `member/newsletters`});
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
                }
                throw new Error('Failed to update email preferences');
            });
        },

        async updateEmailAddress({email}) {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/email'});
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

            if (!res.ok) {
                const errData = await res.json();
                const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                throw new Error(errMssg);
            }

            const responseBody = await res.json();
            return handleCheckoutResponse(responseBody);
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
            const redirectResult = await stripe.redirectToCheckout({
                sessionId: result.sessionId
            });

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

        async offers() {
            const identity = await api.member.identity();
            const url = endpointFor({type: 'members', resource: 'member/offers'});

            const res = await makeRequest({
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

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'Failed to apply offer');
            }

            return true;
        }
    };

    // Handles Stripe checkout response by redirecting or initializing Stripe
    function handleCheckoutResponse(responseBody) {
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
    }

    // Loads initial site and member data
    async function loadInitialData() {
        const [member] = await Promise.all([
            api.member.sessionData()
        ]);
        return member;
    }

    // Loads site configuration data
    async function loadSiteData() {
        try {
            const [{settings}, {tiers}, {newsletters}] = await Promise.all([
                api.site.settings(),
                api.site.tiers(),
                api.site.newsletters()
            ]);
            return {
                ...settings,
                newsletters,
                tiers: transformApiTiersData({tiers})
            };
        } catch (e) {
            return {};
        }
    }

    // Loads member offers if member is paid
    async function loadMemberOffers(member) {
        if (!member || !member.paid) {
            return [];
        }
        try {
            const offersData = await api.member.offers();
            return offersData.offers || [];
        } catch (e) {
            console.warn('[Portal] Failed to load member offers:', e);
            return [];
        }
    }

    api.init = async () => {
        const member = await loadInitialData();
        const site = await loadSiteData();
        const offers = await loadMemberOffers(member);

        const transformedSite = transformApiSiteData({site});

        return {site: transformedSite, member, offers};
    };

    return api;
}

export default setupGhostApi;