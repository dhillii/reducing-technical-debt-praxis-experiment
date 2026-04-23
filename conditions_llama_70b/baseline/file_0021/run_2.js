import { HumanReadableError } from './errors';
import { transformApiSiteData, transformApiTiersData, getUrlHistory } from './helpers';

function setupGhostApi({ siteUrl = window.location.origin, apiUrl, apiKey }) {
    const apiPath = 'members/api';

    function endpointFor({ type, resource }) {
        if (type === 'members') {
            return `${siteUrl.replace(/\/$/, '')}/${apiPath}/${resource}/`;
        }
    }

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

    function makeRequest({ url, method = 'GET', headers = {}, credentials = undefined, body = undefined }) {
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
        async read() {
            const url = endpointFor({ type: 'members', resource: 'site' });
            const response = await makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Failed to fetch site data');
            }
        },

        async newsletters() {
            const url = contentEndpointFor({ resource: 'newsletters', params: { limit: 100 } });
            const response = await makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Failed to fetch site data');
            }
        },

        async tiers() {
            const url = contentEndpointFor({ resource: 'tiers', params: { limit: 100, include: 'monthly_price,yearly_price,benefits' } });
            const response = await makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Failed to fetch site data');
            }
        },

        async settings() {
            const url = contentEndpointFor({ resource: 'settings' });
            const response = await makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Failed to fetch site data');
            }
        },

        async offer({ offerId }) {
            const url = contentEndpointFor({ resource: `offers/${offerId}` });
            const response = await makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Failed to fetch offer data');
            }
        },

        async recommendations({ limit = 100 } = { limit: 100 }) {
            const url = contentEndpointFor({ resource: 'recommendations', params: { limit } });
            const response = await makeRequest({
                url,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Failed to fetch recommendations');
            }
        }
    };

    api.feedback = {
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
            const response = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (response.ok) {
                return response.json();
            } else {
                const humanError = await HumanReadableError.fromApiResponse(response);
                if (humanError) {
                    throw humanError;
                }
                throw new Error('Failed to save feedback');
            }
        }
    };

    api.recommendations = {
        trackClicked({ recommendationId }) {
            let url = endpointFor({ type: 'members', resource: `recommendations/${recommendationId}/clicked` });
            navigator.sendBeacon(url);
        },

        trackSubscribed({ recommendationId }) {
            let url = endpointFor({ type: 'members', resource: `recommendations/${recommendationId}/subscribed` });
            navigator.sendBeacon(url);
        }
    };

    api.member = {
        async identity() {
            const url = endpointFor({ type: 'members', resource: 'session' });
            const response = await makeRequest({
                url,
                credentials: 'same-origin'
            });
            if (!response.ok || response.status === 204) {
                return null;
            }
            return response.text();
        },

        async sessionData() {
            const url = endpointFor({ type: 'members', resource: 'member' });
            const response = await makeRequest({
                url,
                credentials: 'same-origin'
            });
            if (!response.ok || response.status === 204) {
                return null;
            }
            return response.json();
        },

        async update({ name, subscribed, newsletters, enableCommentNotifications }) {
            const url = endpointFor({ type: 'members', resource: 'member' });
            const body = {
                name,
                subscribed,
                newsletters
            };
            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            const response = await makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                return null;
            }
            return response.json();
        },

        async deleteSuppression() {
            const url = endpointFor({ type: 'members', resource: 'member/suppression' });

            const response = await makeRequest({
                url,
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error('Your email has failed to resubscribe, please try again');
            }
            return true;
        },

        async getIntegrityToken() {
            const url = endpointFor({ type: 'members', resource: 'integrity-token' });
            const response = await makeRequest({
                url,
                method: 'GET'
            });

            if (response.ok) {
                return response.text();
            } else {
                const humanError = await HumanReadableError.fromApiResponse(response);
                if (humanError) {
                    throw humanError;
                }
                throw new Error('Failed to start a members session');
            }
        },

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

            const response = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                const contentType = (response.headers.get('content-type') || '').toLowerCase();
                if (contentType.includes('application/json')) {
                    try {
                        return await response.json();
                    } catch (e) {
                        return {};
                    }
                }
                return {};
            } else {
                const humanError = await HumanReadableError.fromApiResponse(response);
                if (humanError) {
                    throw humanError;
                }
                throw new Error('Failed to send magic link email');
            }
        },

        async verifyOTC({ otc, otcRef, redirect, integrityToken }) {
            const url = endpointFor({ type: 'members', resource: 'verify-otc' });
            const body = {
                otc,
                otcRef,
                redirect,
                integrityToken
            };

            const response = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                return await response.json();
            } else {
                const humanError = await HumanReadableError.fromApiResponse(response);
                if (humanError) {
                    throw humanError;
                }
                throw new Error('Failed to verify code');
            }
        },

        async signout(all = false) {
            const url = endpointFor({ type: 'members', resource: 'session' });
            const response = await makeRequest({
                url,
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    all
                })
            });
            if (response.ok) {
                window.location.replace(siteUrl);
                return 'Success';
            } else {
                throw new Error('Failed to signout');
            }
        },

        async newsletters({ uuid, key }) {
            let url = endpointFor({ type: 'members', resource: `member/newsletters` });
            url = url + `?uuid=${uuid}&key=${key}`;
            const response = await makeRequest({
                url,
                credentials: 'same-origin'
            });
            if (!response.ok || response.status === 204) {
                return null;
            }
            return response.json();
        },

        async updateNewsletters({ uuid, newsletters, key, enableCommentNotifications }) {
            let url = endpointFor({ type: 'members', resource: `member/newsletters` });
            url = url + `?uuid=${uuid}&key=${key}`;
            const body = {
                newsletters
            };

            if (enableCommentNotifications !== undefined) {
                body.enable_comment_notifications = enableCommentNotifications;
            }

            const response = await makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Failed to update email preferences');
            }
        },

        async updateEmailAddress({ email }) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'member/email' });
            const body = {
                email,
                identity
            };

            const response = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            if (response.ok) {
                return 'Success';
            } else {
                const errData = await response.json();
                const errMssg = errData?.errors?.[0]?.message || 'Failed to send email address verification email';
                throw new Error(errMssg);
            }
        },

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
            const response = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const errData = await response.json();
                const errMssg = errData?.errors?.[0]?.message || 'Failed to signup, please try again.';
                throw new Error(errMssg);
            }
            const responseBody = await response.json();
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            });
        },

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

            if (!response.ok) {
                const responseJson = await response.json();
                const error = responseJson?.errors?.[0];
                if (error) {
                    throw error;
                }

                throw new Error('We\'re unable to process your payment right now. Please try again later.');
            }

            return response.json();
        },

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
            const response = await makeRequest({
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
            if (!response.ok) {
                throw new Error('Unable to create stripe checkout session');
            }
            const result = await response.json();
            const stripe = window.Stripe(result.publicKey);
            return stripe.redirectToCheckout({
                sessionId: result.sessionId
            });
        },

        async manageBilling({ returnUrl, subscriptionId } = {}) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'create-stripe-billing-portal-session' });
            if (!returnUrl) {
                const returnUrlObj = new URL(siteUrl);
                returnUrlObj.searchParams.set('stripe', 'billing-portal-closed');
                returnUrl = returnUrlObj.href;
            }

            const response = await makeRequest({
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
            if (!response.ok) {
                throw new Error('Unable to create Stripe billing portal session');
            }
            const result = await response.json();
            return window.location.assign(result.url);
        },

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

            const response = await makeRequest({
                url,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            return response;
        },

        async offers() {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: 'member/offers' });

            const response = await makeRequest({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ identity })
            });
            if (!response.ok) {
                return { offers: [] };
            }
            return response.json();
        },

        async applyOffer({ offerId, subscriptionId }) {
            const identity = await api.member.identity();
            const url = endpointFor({ type: 'members', resource: `subscriptions/${subscriptionId}/apply-offer` });

            const response = await makeRequest({
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

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Failed to apply offer');
            }

            return true;
        }
    };

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