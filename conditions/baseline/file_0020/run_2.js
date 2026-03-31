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

function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

function normalizeUrl(url) {
    if (!url) return null;
    return (new URL(url, window.location.href)).href;
}

function getFormInputValues(form) {
    const emailInput = form.querySelector('input[data-members-email]');
    const nameInput = form.querySelector('input[data-members-name]');
    const labelInputs = form.querySelectorAll('input[data-members-label]');
    const newsletterInputs = form.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    );

    const labels = Array.from(labelInputs).map(input => input.value);
    const newsletters = Array.from(newsletterInputs).map(input => ({name: input.value}));

    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels,
        newsletters,
        newsletterInputs
    };
}

function buildFormRequestBody(formData, emailType, autoRedirect, wantsOTC, urlHistory, form) {
    const {email, name, labels, newsletters, newsletterInputs} = formData;

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return reqBody;
}

function handleOTCResponse(responseBody, email, doAction, captureException) {
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
    form.classList.remove('success', 'invalid', 'error');

    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const formData = getFormInputValues(form);
    const urlHistory = getUrlHistory();
    const reqBody = buildFormRequestBody(formData, emailType, autoRedirect, wantsOTC, urlHistory, form);

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
                    handleOTCResponse(responseBody, formData.email, doAction, captureException);
                } catch (e) {
                    // Response parsing failed, continue without OTC handling
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

    return fetchSession(siteUrl)
        .then(identity => createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata))
        .then(responseBody => redirectToCheckout(responseBody))
        .catch(err => handleCheckoutError(err, el, errorEl, clickHandler));
}

function fetchSession(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => res.ok ? res.text() : null);
}

function createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...requestData, identity, successUrl, cancelUrl, metadata})
    }).then(res => {
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

function redirectToCheckout(responseBody) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }
    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({sessionId: responseBody.sessionId})
        .then(redirectResult => {
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        });
}

function handleCheckoutError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    setElementLoading(el, false);
    displayErrorIfElementExists(errorEl, err.message);
    setElementError(el, true);
}

// ============================================================================
// Billing Portal Handlers
// ============================================================================

function createEditBillingClickHandler(el, errorEl, siteUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementLoading(el, true);

        const successUrl = normalizeUrl(el.dataset.membersSuccess);
        const cancelUrl = normalizeUrl(el.dataset.membersCancel);

        return fetchSession(siteUrl)
            .then(identity => createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl))
            .then(result => redirectToStripeCheckout(result))
            .catch(err => handleBillingError(err, el, errorEl, clickHandler));
    };
}

function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
    return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, successUrl, cancelUrl})
    }).then(res => {
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

function redirectToStripeCheckout(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({sessionId: result.sessionId})
        .then(result => {
            if (result.error) {
                throw new Error(t(result.error.message));
            }
        });
}

function handleBillingError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    setElementLoading(el, false);
    displayErrorIfElementExists(errorEl, err.message);
    setElementError(el, true);
}

function createManageBillingClickHandler(el, errorEl, siteUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementLoading(el, true);

        const returnUrl = normalizeUrl(el.dataset.membersReturn);

        return fetchSession(siteUrl)
            .then(identity => createBillingPortalSession(siteUrl, identity, returnUrl))
            .then(result => window.location.assign(result.url))
            .catch(err => handleBillingError(err, el, errorEl, clickHandler));
    };
}

function createBillingPortalSession(siteUrl, identity, returnUrl) {
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
}

// ============================================================================
// Subscription Handlers
// ============================================================================

function createCancelSubscriptionClickHandler(el, errorEl, siteUrl, clickHandler, hasRetentionOffers, doAction) {
    return function (event) {
        event.preventDefault();
        const subscriptionId = el.dataset.membersCancelSubscription;

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

        return fetchSession(siteUrl)
            .then(identity => updateSubscription(siteUrl, subscriptionId, identity, {smart_cancel: true}))
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    throw new Error(t('There was an error cancelling your subscription, please try again.'));
                }
            })
            .catch(err => handleSubscriptionError(err, el, errorEl, clickHandler));
    };
}

function createContinueSubscriptionClickHandler(el, errorEl, siteUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementError(el, false);
        setElementLoading(el, true);
        clearError(errorEl);

        const subscriptionId = el.dataset.membersContinueSubscription;

        return fetchSession(siteUrl)
            .then(identity => updateSubscription(siteUrl, subscriptionId, identity, {cancel_at_period_end: false}))
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    throw new Error(t('There was an error continuing your subscription, please try again.'));
                }
            })
            .catch(err => handleSubscriptionError(err, el, errorEl, clickHandler));
    };
}

function updateSubscription(siteUrl, subscriptionId, identity, updateData) {
    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, ...updateData})
    });
}

function handleSubscriptionError(err, el, errorEl, clickHandler) {
    el.addEventListener('click', clickHandler);
    setElementLoading(el, false);
    setElementError(el, true);
    displayErrorIfElementExists(errorEl, err.message);
}

function createSignoutClickHandler(el, siteUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementError(el, false);
        setElementLoading(el, true);

        return fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
            .then(res => {
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

// ============================================================================
// Main Data Attributes Handler
// ============================================================================

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Handle form submissions
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = (event) => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    // Handle plan clicks
    document.quer