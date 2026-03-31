```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ============================================================================
// Utility Functions
// ============================================================================

function setErrorMessage(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function clearErrorMessage(errorEl) {
    setErrorMessage(errorEl, '');
}

function setLoadingState(el, isLoading) {
    if (isLoading) {
        el.classList.add('loading');
    } else {
        el.classList.remove('loading');
    }
}

function setErrorState(el, hasError) {
    if (hasError) {
        el.classList.add('error');
    } else {
        el.classList.remove('error');
    }
}

function clearFormStates(form) {
    form.classList.remove('success', 'invalid', 'error');
}

function getFormInputValue(form, selector) {
    const input = form.querySelector(selector);
    return input?.value;
}

function getFormInputValues(form, selector) {
    return Array.from(form.querySelectorAll(selector)).map(input => input.value);
}

function getFormLabels(form) {
    return getFormInputValues(form, 'input[data-members-label]');
}

function getFormNewsletters(form) {
    const inputs = form.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    );
    return Array.from(inputs).map(input => ({name: input.value}));
}

function hasCheckableNewsletterInputs(form) {
    return form.querySelectorAll('input[type=checkbox][data-members-newsletter]').length > 0;
}

function buildRequestBody(form, emailType, email, name, autoRedirect, wantsOTC) {
    const labels = getFormLabels(form);
    const newsletters = getFormNewsletters(form);
    const urlHistory = getUrlHistory();

    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        body.includeOTC = true;
    }

    if (urlHistory) {
        body.urlHistory = urlHistory;
    }

    if (newsletters.length > 0) {
        body.newsletters = newsletters;
    } else if (hasCheckableNewsletterInputs(form)) {
        body.newsletters = [];
    }

    return body;
}

function normalizeUrl(url, baseUrl = window.location.href) {
    return url ? new URL(url, baseUrl).href : undefined;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return res.text();
}

async function sendMagicLink(siteUrl, body) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
}

async function getSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    return res.ok ? res.text() : null;
}

async function createStripeCheckoutSession(siteUrl, body) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

async function createStripeUpdateSession(siteUrl, body) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

async function createStripeBillingPortalSession(siteUrl, body) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }

    return res.json();
}

async function updateSubscription(siteUrl, subscriptionId, body) {
    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
}

async function deleteSession(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        method: 'DELETE'
    });
}

// ============================================================================
// Stripe Checkout Handler
// ============================================================================

async function redirectToStripeCheckout(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }

    const stripe = window.Stripe(responseBody.publicKey);
    const result = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });

    if (result.error) {
        throw new Error(result.error.message);
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
    clearErrorMessage(errorEl);
    clearFormStates(form);

    const email = getFormInputValue(form, 'input[data-members-email]');
    const nameInput = getFormInputValue(form, 'input[data-members-name]');
    const name = (nameInput || '').trim() || undefined;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const reqBody = buildRequestBody(form, emailType, email, name, autoRedirect, wantsOTC);
        reqBody.integrityToken = integrityToken;

        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            form.classList.add('success');

            if (wantsOTC) {
                try {
                    const responseBody = await magicLinkRes.clone().json();
                    const otcRef = responseBody?.otc_ref;

                    if (otcRef && typeof doAction === 'function') {
                        doAction('startSigninOTCFromCustomForm', {
                            email: (email || '').trim(),
                            otcRef,
                            inboxLinks: responseBody?.inboxLinks
                        });
                    }
                } catch (e) {
                    console.error(e);
                    captureException?.(e);
                }
            }
        } else {
            const error = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(error, t('Failed to send magic link email'));
            setErrorMessage(errorEl, errorMessage);
            form.classList.add('error');
        }
    } catch (err) {
        form.classList.add('error');
        const defaultMessage = t('There was an error sending the email, please try again');
        setErrorMessage(errorEl, chooseBestErrorMessage(err, defaultMessage));
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

    clearErrorMessage(errorEl);
    setLoadingState(el, true);

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return getSessionIdentity(siteUrl)
        .then(identity => createStripeCheckoutSession(siteUrl, {
            ...requestData,
            identity,
            successUrl: checkoutSuccessUrl,
            cancelUrl: checkoutCancelUrl,
            metadata
        }))
        .then(redirectToStripeCheckout)
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorMessage(errorEl, err.message);
            setErrorState(el, true);
        });
}

// ============================================================================
// Billing Portal Handlers
// ============================================================================

function createEditBillingHandler(el, errorEl, siteUrl, clickHandler) {
    return async function handleEditBilling(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        const successUrl = normalizeUrl(el.dataset.membersSuccess);
        const cancelUrl = normalizeUrl(el.dataset.membersCancel);

        clearErrorMessage(errorEl);
        setLoadingState(el, true);

        try {
            const identity = await getSessionIdentity(siteUrl);
            const result = await createStripeUpdateSession(siteUrl, {
                identity,
                successUrl,
                cancelUrl
            });

            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({
                sessionId: result.sessionId
            });

            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorMessage(errorEl, err.message);
            setErrorState(el, true);
        }
    };
}

function createManageBillingHandler(el, errorEl, siteUrl, clickHandler) {
    return async function handleManageBilling(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        const returnUrl = normalizeUrl(el.dataset.membersReturn);

        clearErrorMessage(errorEl);
        setLoadingState(el, true);

        try {
            const identity = await getSessionIdentity(siteUrl);
            const result = await createStripeBillingPortalSession(siteUrl, {
                identity,
                returnUrl
            });

            window.location.assign(result.url);
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorMessage(errorEl, err.message);
            setErrorState(el, true);
        }
    };
}

// ============================================================================
// Subscription Handlers
// ============================================================================

function createSignoutHandler(el, siteUrl, clickHandler) {
    return async function handleSignout(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setErrorState(el, false);
        setLoadingState(el, true);

        try {
            const res = await deleteSession(siteUrl);
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                throw new Error('Failed to sign out');
            }
        } catch (err) {
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorState(el, true);
        }
    };
}

function createCancelSubscriptionHandler(el, errorEl, siteUrl, clickHandler, hasRetentionOffers, doAction) {
    return async function handleCancelSubscription(event) {
        event.preventDefault();

        const subscriptionId = el.dataset.membersCancelSubscription;

        if (hasRetentionOffers) {
            doAction('openPopup', {
                page: 'accountPlan',
                pageData: {
                    subscriptionId,
                    action: 'cancel'
                }
            });
            return;
        }

        el.removeEventListener('click', clickHandler);
        setErrorState(el, false);
        setLoadingState(el, true);
        clearErrorMessage(errorEl);

        try {
            const identity = await getSessionIdentity(siteUrl);
            const res = await updateSubscription(siteUrl, subscriptionId, {
                identity,
                smart_cancel: true
            });

            if (res.ok) {
                window.location.reload();
            } else {
                throw new Error(t('There was an error cancelling your subscription, please try again.'));
            }
        } catch (err) {
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorState(el, true);
            setErrorMessage(errorEl, err.message);
        }
    };
}

function createContinueSubscriptionHandler(el, errorEl, siteUrl, clickHandler) {
    return async function handleContinueSubscription(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setErrorState(el, false);
        setLoadingState(el, true);

        const subscriptionId = el.dataset.membersContinueSubscription;
        clearErrorMessage(errorEl);

        try {
            const identity = await getSessionIdentity(siteUrl);
            const res = await updateSubscription(siteUrl, subscriptionId, {
                identity,
                cancel_at_period_end: false
            });

            if (res.ok) {
                window.location.reload();
            } else {
                throw new Error(t('There was an error continuing your subscription, please try again.'));
            }
        } catch (err) {
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorState(el, true);
            setErrorMessage(errorEl, err.message);
        }
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

    // Form submissions
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = (event) => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });