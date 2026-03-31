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

function setFormState(form, state) {
    form.classList.remove('success', 'invalid', 'error', 'loading');
    if (state) {
        form.classList.add(state);
    }
}

function handleError(error, form, errorEl) {
    setFormState(form, 'error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

function handleElementError(el, errorEl, message) {
    console.error(message);
    setElementLoading(el, false);
    el.classList.add('error');
    displayErrorIfElementExists(errorEl, message);
}

// ============================================================================
// Form Data Collection
// ============================================================================

function collectFormInputs(form) {
    const emailInput = form.querySelector('input[data-members-email]');
    const nameInput = form.querySelector('input[data-members-name]');
    const labelInputs = form.querySelectorAll('input[data-members-label]');
    const newsletterInputs = form.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    );
    const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]');

    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels: Array.from(labelInputs).map(input => input.value),
        newsletters: Array.from(newsletterInputs).map(input => ({name: input.value})),
        hasCheckableNewsletters: checkableNewsletterInputs.length > 0,
        hasSelectedNewsletters: newsletterInputs.length > 0
    };
}

function buildRequestBody(formData, emailType, siteUrl) {
    const autoRedirect = formData.autoRedirect ?? 'true';
    const wantsOTC = emailType === 'signin' && formData.otcEnabled === 'true';
    const urlHistory = getUrlHistory();

    const reqBody = {
        email: formData.email,
        emailType: emailType,
        labels: formData.labels,
        name: formData.name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (formData.hasSelectedNewsletters) {
        reqBody.newsletters = formData.newsletters;
    } else if (formData.hasCheckableNewsletters) {
        reqBody.newsletters = [];
    }

    return {reqBody, wantsOTC};
}

// ============================================================================
// API Calls
// ============================================================================

async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return res.text();
}

async function sendMagicLink(siteUrl, reqBody, integrityToken) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

async function getSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    if (!res.ok) {
        return null;
    }
    return res.text();
}

async function createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        })
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

async function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, successUrl, cancelUrl})
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

async function createStripeBillingPortalSession(siteUrl, identity, returnUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, returnUrl})
    });

    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }

    return res.json();
}

async function updateSubscription(siteUrl, subscriptionId, identity, updateData) {
    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, ...updateData})
    });
}

// ============================================================================
// Stripe Checkout Handling
// ============================================================================

async function redirectToStripeCheckout(responseBody) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }

    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });

    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

// ============================================================================
// Form Submit Handler
// ============================================================================

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    clearError(errorEl);
    setFormState(form, null);

    const formData = collectFormInputs(form);
    const emailType = form.dataset.membersForm;
    formData.autoRedirect = form?.dataset?.membersAutoredirect;
    formData.otcEnabled = form?.dataset?.membersOtc;

    const {reqBody, wantsOTC} = buildRequestBody(formData, emailType, siteUrl);

    setFormState(form, 'loading');

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        setFormState(form, null);

        if (magicLinkRes.ok) {
            setFormState(form, 'success');

            if (wantsOTC) {
                try {
                    const responseBody = await magicLinkRes.clone().json();
                    const otcRef = responseBody?.otc_ref;

                    if (otcRef && typeof doAction === 'function') {
                        try {
                            doAction('startSigninOTCFromCustomForm', {
                                email: (formData.email || '').trim(),
                                otcRef,
                                inboxLinks: responseBody?.inboxLinks
                            });
                        } catch (e) {
                            console.error(e);
                            captureException?.(e);
                        }
                    }
                } catch (e) {
                    // Response parsing failed, continue
                }
            }
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            setFormState(form, 'error');
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
    const successUrl = el.dataset.membersSuccess ? new URL(el.dataset.membersSuccess, window.location.href).href : undefined;
    const cancelUrl = el.dataset.membersCancel ? new URL(el.dataset.membersCancel, window.location.href).href : undefined;

    clearError(errorEl);
    setElementLoading(el, true);

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return getSessionIdentity(siteUrl)
        .then(identity => createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata))
        .then(redirectToStripeCheckout)
        .catch(err => {
            el.addEventListener('click', clickHandler);
            handleElementError(el, errorEl, err.message);
        });
}

// ============================================================================
// Edit Billing Handler
// ============================================================================

function createEditBillingHandler(el, errorEl, siteUrl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        const successUrl = el.dataset.membersSuccess ? new URL(el.dataset.membersSuccess, window.location.href).href : undefined;
        const cancelUrl = el.dataset.membersCancel ? new URL(el.dataset.membersCancel, window.location.href).href : undefined;

        clearError(errorEl);
        setElementLoading(el, true);

        return getSessionIdentity(siteUrl)
            .then(identity => createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl))
            .then(result => {
                const stripe = window.Stripe(result.publicKey);
                return stripe.redirectToCheckout({sessionId: result.sessionId});
            })
            .then(result => {
                if (result.error) {
                    throw new Error(t(result.error.message));
                }
            })
            .catch(err => {
                el.addEventListener('click', clickHandler);
                handleElementError(el, errorEl, err.message);
            });
    };
}

// ============================================================================
// Manage Billing Handler
// ============================================================================

function createManageBillingHandler(el, errorEl, siteUrl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        const returnUrl = el.dataset.membersReturn ? new URL(el.dataset.membersReturn, window.location.href).href : undefined;

        clearError(errorEl);
        setElementLoading(el, true);

        return getSessionIdentity(siteUrl)
            .then(identity => createStripeBillingPortalSession(siteUrl, identity, returnUrl))
            .then(result => window.location.assign(result.url))
            .catch(err => {
                el.addEventListener('click', clickHandler);
                handleElementError(el, errorEl, err.message);
            });
    };
}

// ============================================================================
// Signout Handler
// ============================================================================

function createSignoutHandler(el, siteUrl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        setElementLoading(el, true);

        return fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
            .then(res => {
                if (res.ok) {
                    window.location.replace(siteUrl);
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementLoading(el, false);
                    el.classList.add('error');
                }
            });
    };
}

// ============================================================================
// Cancel Subscription Handler
// ============================================================================

function createCancelSubscriptionHandler(el, errorEl, siteUrl, clickHandler, hasRetentionOffers, doAction) {
    return function(event) {
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
        el.classList.remove('error');
        setElementLoading(el, true);
        clearError(errorEl);

        return getSessionIdentity(siteUrl)
            .then(identity => updateSubscription(siteUrl, subscriptionId, identity, {smart_cancel: true}))
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    handleElementError(el, errorEl, t('There was an error cancelling your subscription, please try again.'));
                }
            });
    };
}

// ============================================================================
// Continue Subscription Handler
// ============================================================================

function createContinueSubscriptionHandler(el, errorEl, siteUrl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        setElementLoading(el, true);

        const subscriptionId = el.dataset.membersContinueSubscription;
        clearError(errorEl);

        return getSessionIdentity(siteUrl)
            .then(identity => updateSubscription(siteUrl, subscriptionId, identity, {cancel_at_period_end: false}))
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    handleElementError(el, errorEl, t('There was an error continuing your subscription, please try again.'));
                }
            });
    };
}

// ============================================================================
// Main Handler
// ============================================================================

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Form submissions
    document.querySelectorAll('form[data-members-form]').forEach(