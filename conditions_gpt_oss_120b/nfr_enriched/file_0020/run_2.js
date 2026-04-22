/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Update error element text if it exists.
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Apply generic error handling to a form.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Gather values from form inputs.
 */
function collectFormData(event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];

    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;

    const labels = Array.from(labelInputs, el => el.value);
    const newsletters = Array.from(newsletterInputs, el => ({name: el.value}));

    return {email, name, labels, newsletters, newsletterInputs};
}

/**
 * Build request body for magic‑link submission.
 */
function buildRequestBody({email, name, labels, newsletters, newsletterInputs, form, siteUrl}) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset?.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
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
    if (newsletterInputs.length > 0) {
        body.newsletters = newsletters;
    } else {
        const checkable = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkable.length > 0) {
            body.newsletters = [];
        }
    }
    return {body, wantsOTC};
}

/**
 * Submit magic‑link request and handle response.
 */
async function submitMagicLink({siteUrl, reqBody, wantsOTC, email, doAction, captureException, form, errorEl}) {
    const integrityRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityRes.text();

    const magicRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });

    if (!magicRes.ok) {
        const apiError = await HumanReadableError.fromApiResponse(magicRes);
        const msg = chooseBestErrorMessage(apiError, t('Failed to send magic link email'));
        displayErrorIfElementExists(errorEl, msg);
        form.classList.add('error');
        return;
    }

    form.classList.add('success');

    if (wantsOTC) {
        let responseBody;
        try {
            responseBody = await magicRes.clone().json();
        } catch {
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
}

/**
 * Handler for form submissions.
 */
export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) errorEl.innerText = '';
    form.classList.remove('success', 'invalid', 'error');

    const {email, name, labels, newsletters, newsletterInputs} = collectFormData(event);
    const {body: reqBody, wantsOTC} = buildRequestBody({email, name, labels, newsletters, newsletterInputs, form, siteUrl});

    form.classList.add('loading');

    try {
        await submitMagicLink({siteUrl, reqBody, wantsOTC, email, doAction, captureException, form, errorEl});
    } catch (err) {
        handleError(err, form, errorEl);
    } finally {
        form.removeEventListener('submit', submitHandler);
        form.classList.remove('loading');
    }
}

/**
 * Create Stripe checkout session and redirect.
 */
async function createAndRedirectCheckout({siteUrl, requestData, identity, successUrl, cancelUrl, metadata, el, errorEl}) {
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

    const data = await res.json();

    if (data.url) {
        window.location.assign(data.url);
    } else {
        const stripe = window.Stripe(data.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: data.sessionId});
        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
        }
    }
}

/**
 * Handler for plan click events.
 */
export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess
        ? (new URL(el.dataset.membersSuccess, window.location.href)).href
        : undefined;
    const cancelUrl = el.dataset.membersCancel
        ? (new URL(el.dataset.membersCancel, window.location.href)).href
        : undefined;

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = sessionRes.ok ? await sessionRes.text() : null;
        await createAndRedirectCheckout({siteUrl, requestData, identity, successUrl, cancelUrl, metadata, el, errorEl});
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Generic fetch helper for Stripe sessions.
 */
async function fetchSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? await res.text() : null;
}

/**
 * Click handler for edit‑billing elements.
 */
async function editBillingHandler({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, successUrl, cancelUrl})
        });

        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const data = await res.json();
        const stripe = window.Stripe(data.publicKey);
        const result = await stripe.redirectToCheckout({sessionId: data.sessionId});
        if (result.error) {
            throw new Error(t(result.error.message));
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Click handler for manage‑billing elements.
 */
async function manageBillingHandler({el, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, returnUrl})
        });

        if (!res.ok) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }

        const data = await res.json();
        window.location.assign(data.url);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Click handler for sign‑out elements.
 */
async function signoutHandler({el, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    el.classList.remove('error');
    el.classList.add('loading');

    const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
    if (res.ok) {
        window.location.replace(siteUrl);
    } else {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

/**
 * Click handler for cancel‑subscription elements.
 */
async function cancelSubscriptionHandler({el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler}) {
    if (hasRetentionOffers) {
        doAction('openPopup', {
            page: 'accountPlan',
            pageData: {subscriptionId, action: 'cancel'}
        });
        return;
    }

    el.removeEventListener('click', clickHandler);
    if (errorEl) errorEl.innerText = '';
    el.classList.remove('error');
    el.classList.add('loading');

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, smart_cancel: true})
        });

        if (res.ok) {
            window.location.reload();
        } else {
            throw new Error(t('There was an error cancelling your subscription, please try again.'));
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) errorEl.innerText = err.message;
    }
}

/**
 * Click handler for continue‑subscription elements.
 */
async function continueSubscriptionHandler({el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    if (errorEl) errorEl.innerText = '';
    el.classList.remove('error');
    el.classList.add('loading');

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, cancel_at_period_end: false})
        });

        if (res.ok) {
            window.location.reload();
        } else {
            throw new Error(t('There was an error continuing your subscription, please try again.'));
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) errorEl.innerText = err.message;
    }
}

/**
 * Initialize data‑attribute driven behaviours.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) return;
    siteUrl = siteUrl.replace(/\/$/, '');

    // Form submissions
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    // Plan clicks
    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess
            ? (new URL(el.dataset.membersSuccess, window.location.href)).href
            : undefined;
        const cancelUrl = el.dataset.membersCancel
            ? (new URL(el.dataset.membersCancel, window.location.href)).href
            : undefined;
        const clickHandler = event => {
            editBillingHandler({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn
            ? (new URL(el.dataset.membersReturn, window.location.href)).href
            : undefined;
        const clickHandler = event => {
            manageBillingHandler({el, errorEl, siteUrl, returnUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Sign out
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = event => {
            signoutHandler({el, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(o => o.redemption_type === 'retention');

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;
        const clickHandler = event => {
            cancelSubscriptionHandler({
                el,
                errorEl,
                siteUrl,
                subscriptionId,
                hasRetentionOffers,
                doAction,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;
        const clickHandler = event => {
            continueSubscriptionHandler({
                el,
                errorEl,
                siteUrl,
                subscriptionId,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });
}