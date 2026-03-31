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

function setFormState(form, {success = false, error = false, loading = false} = {}) {
    form.classList.remove('success', 'error', 'loading', 'invalid');
    if (success) form.classList.add('success');
    if (error) form.classList.add('error');
    if (loading) form.classList.add('loading');
}

function handleError(error, form, errorEl) {
    setFormState(form, {error: true});
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

function getFormInputValues(form) {
    const emailInput = form.querySelector('input[data-members-email]');
    const nameInput = form.querySelector('input[data-members-name]');
    const labelInputs = Array.from(form.querySelectorAll('input[data-members-label]'));
    const newsletterInputs = Array.from(
        form.querySelectorAll(
            'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
        )
    );

    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels: labelInputs.map(input => input.value),
        newsletters: newsletterInputs.map(input => ({name: input.value})),
        emailType: form.dataset.membersForm,
        autoRedirect: form.dataset.membersAutoredirect || 'true'
    };
}

function buildRequestBody(formData, wantsOTC) {
    const urlHistory = getUrlHistory();
    const reqBody = {
        email: formData.email,
        emailType: formData.emailType,
        labels: formData.labels,
        name: formData.name,
        autoRedirect: formData.autoRedirect === 'true'
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (formData.newsletters.length > 0) {
        reqBody.newsletters = formData.newsletters;
    } else {
        const checkableNewsletterInputs = document.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return reqBody;
}

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

async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException) {
    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await magicLinkRes.clone().json();
        } catch (e) {
            responseBody = undefined;
        }
    }

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
    setFormState(form);

    const formData = getFormInputValues(form);
    const wantsOTC = formData.emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const reqBody = buildRequestBody(formData, wantsOTC);

    setFormState(form, {loading: true});

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        setFormState(form);

        if (magicLinkRes.ok) {
            setFormState(form, {success: true});
            await handleMagicLinkSuccess(magicLinkRes, wantsOTC, formData.email, doAction, captureException);
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            setFormState(form, {error: true});
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

// ============================================================================
// Plan Click Handler
// ============================================================================

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

async function redirectToCheckout(responseBody) {
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
        .then(redirectToCheckout)
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setElementLoading(el, false);
            displayErrorIfElementExists(errorEl, err.message);
            setElementError(el, true);
        });
}

// ============================================================================
// Billing Handlers
// ============================================================================

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

async function redirectToStripeCheckout(result) {
    const stripe = window.Stripe(result.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: result.sessionId
    });

    if (redirectResult.error) {
        throw new Error(t(redirectResult.error.message));
    }
}

function createEditBillingClickHandler(el, errorEl, siteUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementLoading(el, true);

        const successUrl = el.dataset.membersSuccess ? new URL(el.dataset.membersSuccess, window.location.href).href : undefined;
        const cancelUrl = el.dataset.membersCancel ? new URL(el.dataset.membersCancel, window.location.href).href : undefined;

        return getSessionIdentity(siteUrl)
            .then(identity => createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl))
            .then(redirectToStripeCheckout)
            .catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandler);
                setElementLoading(el, false);
                displayErrorIfElementExists(errorEl, err.message);
                setElementError(el, true);
            });
    };
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

function createManageBillingClickHandler(el, errorEl, siteUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementLoading(el, true);

        const returnUrl = el.dataset.membersReturn ? new URL(el.dataset.membersReturn, window.location.href).href : undefined;

        return getSessionIdentity(siteUrl)
            .then(identity => createStripeBillingPortalSession(siteUrl, identity, returnUrl))
            .then(result => window.location.assign(result.url))
            .catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandler);
                setElementLoading(el, false);
                displayErrorIfElementExists(errorEl, err.message);
                setElementError(el, true);
            });
    };
}

// ============================================================================
// Subscription Handlers
// ============================================================================

function createCancelSubscriptionClickHandler(el, errorEl, siteUrl, hasRetentionOffers, doAction, clickHandler) {
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

        return getSessionIdentity(siteUrl)
            .then(identity =>
                fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, smart_cancel: true})
                })
            )
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

function createContinueSubscriptionClickHandler(el, errorEl, siteUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementError(el, false);
        setElementLoading(el, true);
        clearError(errorEl);

        const subscriptionId = el.dataset.membersContinueSubscription;

        return getSessionIdentity(siteUrl)
            .then(identity =>
                fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, cancel_at_period_end: false})
                })
            )
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
// Sign Out Handler
// ============================================================================

function createSignOutClickHandler(el, siteUrl, clickHandler) {
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

// ============================================================================
// Main Data Attributes Handler
// ============================================================================

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if