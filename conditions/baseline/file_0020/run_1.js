```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ============================================================================
// Utility Functions
// ============================================================================

function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function clearError(errorEl) {
    displayErrorIfElementExists(errorEl, '');
}

function setElementLoading(el, isLoading) {
    if (isLoading) {
        el.classList.add('loading');
    } else {
        el.classList.remove('loading');
    }
}

function setElementError(el, isError) {
    if (isError) {
        el.classList.add('error');
    } else {
        el.classList.remove('error');
    }
}

function resetFormState(form) {
    form.classList.remove('success', 'invalid', 'error');
}

function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

function getFormInputValues(form) {
    const emailInput = form.querySelector('input[data-members-email]');
    const nameInput = form.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    
    return { email, name };
}

function getFormLabels(form) {
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    return Array.from(labelInputs).map(input => input.value);
}

function getFormNewsletters(form) {
    const newsletterInputs = form.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    return Array.from(newsletterInputs).map(input => ({name: input.value}));
}

function buildRequestBody(form, email, name, labels, newsletters, emailType) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const urlHistory = getUrlHistory();

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: (autoRedirect === 'true')
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return { reqBody, wantsOTC };
}

function normalizeUrl(url) {
    if (!url) return undefined;
    return (new URL(url, window.location.href)).href;
}

function getSessionIdentity(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });
}

function handleStripeRedirect(responseBody) {
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
}

function handleFetchError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    setElementLoading(el, false);
    displayErrorIfElementExists(errorEl, err.message);
    setElementError(el, true);
}

// ============================================================================
// Form Submission Handler
// ============================================================================

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    clearError(errorEl);
    resetFormState(form);

    const {email, name} = getFormInputValues(form);
    const labels = getFormLabels(form);
    const newsletters = getFormNewsletters(form);
    const emailType = form.dataset.membersForm;

    const {reqBody, wantsOTC} = buildRequestBody(form, email, name, labels, newsletters, emailType);

    form.classList.add('loading');

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            form.classList.add('success');

            if (wantsOTC) {
                try {
                    const responseBody = await magicLinkRes.clone().json();
                    const otcRef = responseBody?.otc_ref;
                    
                    if (otcRef && typeof doAction === 'function') {
                        try {
                            doAction('startSigninOTCFromCustomForm', {
                                email: (email || '').trim(),
                                otcRef,
                                inboxLinks: responseBody?.inboxLinks
                            });
                        } catch (e) {
                            console.error(e);
                            captureException?.(e);
                        }
                    }
                } catch (e) {
                    // Silently handle JSON parse errors
                }
            }
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

// ============================================================================
// Plan Click Handler
// ============================================================================

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = normalizeUrl(el.dataset.membersSuccess);
    const checkoutCancelUrl = normalizeUrl(el.dataset.membersCancel);

    clearError(errorEl);
    setElementLoading(el, true);

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return getSessionIdentity(siteUrl)
        .then(identity => {
            return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    ...requestData,
                    identity,
                    successUrl: checkoutSuccessUrl,
                    cancelUrl: checkoutCancelUrl,
                    metadata
                })
            }).then(res => {
                if (!res.ok) {
                    throw new Error(t('Could not create stripe checkout session'));
                }
                return res.json();
            });
        })
        .then(handleStripeRedirect)
        .catch(err => handleFetchError(err, el, errorEl, clickHandler));
}

// ============================================================================
// Stripe Session Handlers
// ============================================================================

function createStripeSessionHandler(siteUrl, endpoint, bodyData, errorEl, el, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementError(el, false);
        setElementLoading(el, true);
        clearError(errorEl);

        return getSessionIdentity(siteUrl)
            .then(identity => {
                return fetch(`${siteUrl}/members/api/${endpoint}/`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({...bodyData, identity})
                }).then(res => {
                    if (!res.ok) {
                        throw new Error(t('Could not create stripe session'));
                    }
                    return res.json();
                });
            })
            .catch(err => handleFetchError(err, el, errorEl, clickHandler));
    };
}

function createCheckoutSessionHandler(siteUrl, successUrl, cancelUrl, errorEl, el, clickHandler) {
    return createStripeSessionHandler(
        siteUrl,
        'create-stripe-checkout-session',
        {successUrl, cancelUrl},
        errorEl,
        el,
        clickHandler
    );
}

function createUpdateSessionHandler(siteUrl, successUrl, cancelUrl, errorEl, el, clickHandler) {
    const handler = createStripeSessionHandler(
        siteUrl,
        'create-stripe-update-session',
        {successUrl, cancelUrl},
        errorEl,
        el,
        clickHandler
    );

    return function (event) {
        handler(event).then(result => {
            if (result) {
                const stripe = window.Stripe(result.publicKey);
                return stripe.redirectToCheckout({sessionId: result.sessionId});
            }
        }).then(result => {
            if (result?.error) {
                throw new Error(t(result.error.message));
            }
        }).catch(err => handleFetchError(err, el, errorEl, clickHandler));
    };
}

function createBillingPortalHandler(siteUrl, returnUrl, errorEl, el, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementError(el, false);
        setElementLoading(el, true);
        clearError(errorEl);

        return getSessionIdentity(siteUrl)
            .then(identity => {
                return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, returnUrl})
                }).then(res => {
                    if (!res.ok) {
                        throw new Error(t('Could not create Stripe billing portal session'));
                    }
                    return res.json();
                });
            })
            .then(result => window.location.assign(result.url))
            .catch(err => handleFetchError(err, el, errorEl, clickHandler));
    };
}

function createSignoutHandler(siteUrl, el, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementError(el, false);
        setElementLoading(el, true);

        return fetch(`${siteUrl}/members/api/session`, {
            method: 'DELETE'
        }).then(res => {
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.addEventListener('click', clickHandler);
                setElementLoading(el, false);
                setElementError(el, true);
            }
        });
    };
}

function createCancelSubscriptionHandler(siteUrl, subscriptionId, errorEl, el, clickHandler, hasRetentionOffers, doAction) {
    return function (event) {
        event.preventDefault();

        if (hasRetentionOffers) {
            doAction('openPopup', {
                page: 'accountPlan',
                pageData: {subscriptionId, action: 'cancel'}
            });
            return;
        }

        el.removeEventListener('click', clickHandler);
        setElementError(el, false);
        setElementLoading(el, true);
        clearError(errorEl);

        return getSessionIdentity(siteUrl)
            .then(identity => {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, smart_cancel: true})
                });
            })
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementLoading(el, false);
                    setElementError(el, true);
                    displayErrorIfElementExists(errorEl, t('There was an error cancelling your subscription, please try again.'));
                }
            });
    };
}

function createContinueSubscriptionHandler(siteUrl, subscriptionId, errorEl, el, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementError(el, false);
        setElementLoading(el, true);
        clearError(errorEl);

        return getSessionIdentity(siteUrl)
            .then(identity => {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, cancel_at_period_end: false})
                });
            })
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementLoading(el, false);
                    setElementError(el, true);
                    displayErrorIfElementExists(errorEl, t('There was an error continuing your subscription, please try again.'));
                }
            });
    };
}

// ============================================================================
// Data Attribute Handler
// ============================================================================

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Handle form submissions
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    // Handle plan clicks
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event =>