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

function normalizeUrl(url) {
    if (!url) return null;
    return (new URL(url, window.location.href)).href;
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

function shouldSetEmptyNewsletters(form) {
    const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkableNewsletterInputs.length > 0;
}

function buildRequestBody(form, email, name, labels, newsletters, emailType, autoRedirect, wantsOTC) {
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
    } else if (shouldSetEmptyNewsletters(form)) {
        reqBody.newsletters = [];
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

async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, errorEl) {
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
    setFormState(form, null);

    const {email, name} = getFormInputValues(form);
    const labels = getFormLabels(form);
    const newsletters = getFormNewsletters(form);
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    setFormState(form, 'loading');

    const reqBody = buildRequestBody(form, email, name, labels, newsletters, emailType, autoRedirect, wantsOTC);

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        setFormState(form, null);

        if (magicLinkRes.ok) {
            setFormState(form, 'success');
            await handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, errorEl);
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

async function fetchSession(siteUrl) {
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
    const successUrl = normalizeUrl(el.dataset.membersSuccess);
    const cancelUrl = normalizeUrl(el.dataset.membersCancel);

    clearError(errorEl);
    setElementLoading(el, true);

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetchSession(siteUrl)
        .then(identity => createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata))
        .then(redirectToCheckout)
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setElementLoading(el, false);
            displayErrorIfElementExists(errorEl, err.message);
            el.classList.add('error');
        });
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
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementLoading(el, true);

        const successUrl = normalizeUrl(el.dataset.membersSuccess);
        const cancelUrl = normalizeUrl(el.dataset.membersCancel);

        return fetchSession(siteUrl)
            .then(identity => createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl))
            .then(redirectToCheckoutSession)
            .catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandler);
                setElementLoading(el, false);
                displayErrorIfElementExists(errorEl, err.message);
                el.classList.add('error');
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
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementLoading(el, true);

        const returnUrl = normalizeUrl(el.dataset.membersReturn);

        return fetchSession(siteUrl)
            .then(identity => createStripeBillingPortalSession(siteUrl, identity, returnUrl))
            .then(result => window.location.assign(result.url))
            .catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandler);
                setElementLoading(el, false);
                displayErrorIfElementExists(errorEl, err.message);
                el.classList.add('error');
            });
    };
}

function createSignoutClickHandler(el, siteUrl, clickHandler) {
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

        return updateSubscription(siteUrl, subscriptionId, {smart_cancel: true})
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementLoading(el, false);
                    el.classList.add('error');
                    displayErrorIfElementExists(errorEl, t('There was an error cancelling your subscription, please try again.'));
                }
            });
    };
}

function createContinueSubscriptionClickHandler(el, errorEl, siteUrl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        setElementLoading(el, true);
        clearError(errorEl);

        const subscriptionId = el.dataset.membersContinueSubscription;

        return updateSubscription(siteUrl, subscriptionId, {cancel_at_period_end: false})
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementLoading(el, false);
                    el.classList.add('error');
                    displayErrorIfElementExists(errorEl, t('There was an error continuing your subscription, please try again.'));
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
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = (event)