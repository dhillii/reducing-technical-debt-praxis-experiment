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

function shouldSetEmptyNewsletters(form) {
    const checkableInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]');
    return checkableInputs.length > 0;
}

function buildFormRequestBody(form, emailType, email, name, labels, newsletters) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const urlHistory = getUrlHistory();

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

    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else if (shouldSetEmptyNewsletters(form)) {
        reqBody.newsletters = [];
    }

    return {reqBody, wantsOTC};
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

async function handleMagicLinkSuccess(form, magicLinkRes, wantsOTC, email, doAction, captureException) {
    form.classList.add('success');

    if (!wantsOTC) {
        return;
    }

    let responseBody;
    try {
        responseBody = await magicLinkRes.clone().json();
    } catch (e) {
        responseBody = undefined;
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

async function handleMagicLinkError(magicLinkRes, errorEl) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    setErrorMessage(errorEl, errorMessage);
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
    const emailType = form.dataset.membersForm;
    const labels = getFormLabels(form);
    const newsletters = getFormNewsletters(form);

    const {reqBody, wantsOTC} = buildFormRequestBody(form, emailType, email, name, labels, newsletters);

    form.classList.add('loading');

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

        form.removeEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            await handleMagicLinkSuccess(form, magicLinkRes, wantsOTC, email, doAction, captureException);
        } else {
            await handleMagicLinkError(magicLinkRes, errorEl);
            form.classList.add('error');
        }
    } catch (err) {
        form.classList.remove('loading');
        form.classList.add('error');
        const defaultMessage = t('There was an error sending the email, please try again');
        setErrorMessage(errorEl, chooseBestErrorMessage(err, defaultMessage));
    } finally {
        form.addEventListener('submit', submitHandler);
    }
}

// ============================================================================
// Plan Click Handler
// ============================================================================

function buildCheckoutMetadata(member) {
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return metadata;
}

function resolveUrl(urlString) {
    if (!urlString) {
        return undefined;
    }
    return new URL(urlString, window.location.href).href;
}

async function fetchSession(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    return res.ok ? res.text() : null;
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

export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(el.dataset.membersCancel);

    clearErrorMessage(errorEl);
    setLoadingState(el, true);

    try {
        const identity = await fetchSession(siteUrl);
        const metadata = buildCheckoutMetadata(member);
        const responseBody = await createStripeCheckoutSession(
            siteUrl,
            requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        );
        await redirectToCheckout(responseBody);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        setLoadingState(el, false);
        setErrorMessage(errorEl, err.message);
        setErrorState(el, true);
    }
}

// ============================================================================
// Stripe Session Handlers
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

async function redirectToCheckoutSession(result) {
    const stripe = window.Stripe(result.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: result.sessionId
    });

    if (redirectResult.error) {
        throw new Error(t(redirectResult.error.message));
    }
}

function createEditBillingClickHandler(el, errorEl, siteUrl, clickHandler) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        clearErrorMessage(errorEl);
        setLoadingState(el, true);

        try {
            const successUrl = resolveUrl(el.dataset.membersSuccess);
            const cancelUrl = resolveUrl(el.dataset.membersCancel);
            const identity = await fetchSession(siteUrl);
            const result = await createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl);
            await redirectToCheckoutSession(result);
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorMessage(errorEl, err.message);
            setErrorState(el, true);
        }
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
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        clearErrorMessage(errorEl);
        setLoadingState(el, true);

        try {
            const returnUrl = resolveUrl(el.dataset.membersReturn);
            const identity = await fetchSession(siteUrl);
            const result = await createStripeBillingPortalSession(siteUrl, identity, returnUrl);
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

async function updateSubscription(siteUrl, subscriptionId, body) {
    const identity = await fetchSession(siteUrl);
    const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, ...body})
    });

    return res;
}

function createCancelSubscriptionClickHandler(el, errorEl, siteUrl, clickHandler, hasRetentionOffers, doAction) {
    return async function (event) {
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
        setErrorState(el, false);
        setLoadingState(el, true);
        clearErrorMessage(errorEl);

        try {
            const res = await updateSubscription(siteUrl, subscriptionId, {smart_cancel: true});

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

function createContinueSubscriptionClickHandler(el, errorEl, siteUrl, clickHandler) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setErrorState(el, false);
        setLoadingState(el, true);
        clearErrorMessage(errorEl);

        const subscriptionId = el.dataset.membersContinueSubscription;

        try {
            const res = await updateSubscription(siteUrl, subscriptionId, {cancel_at_period_end: false});

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
// Sign Out Handler
// ============================================================================

function createSignOutClickHandler(el, siteUrl, clickHandler) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setErrorState(el, false);
        setLoadingState(el, true);

        try {
            const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});

            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                throw new Error('Sign out failed');
            }
        } catch (err) {
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorState(el, true);
        }
    };
}

// ============================================================================
//