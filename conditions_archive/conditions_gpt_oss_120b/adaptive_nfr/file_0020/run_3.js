```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Show error message if element exists.
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Apply error UI to form.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Guard predicates.
 */
function isTruthy(value) {
    return Boolean(value);
}
function isStringTrue(value) {
    return value === 'true';
}
function hasUrlHistory(urlHistory) {
    return isTruthy(urlHistory);
}
function wantsOneTimeCode(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}
function hasNewsletterInputs(inputs) {
    return inputs.length > 0;
}
function hasCheckableNewsletterInputs(form) {
    return form.querySelectorAll('input[type=checkbox][data-members-newsletter]').length > 0;
}

/**
 * Build request body for magic link.
 */
function buildRequestBody({email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters}) {
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: isStringTrue(autoRedirect)
    };
    if (wantsOTC) body.includeOTC = true;
    if (hasUrlHistory(urlHistory)) body.urlHistory = urlHistory;
    if (hasNewsletterInputs(newsletters)) body.newsletters = newsletters;
    return body;
}

/**
 * Form submit handler.
 */
export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) errorEl.innerText = '';
    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = wantsOneTimeCode(emailType, form);

    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(el => el.value);
    const newsletters = Array.from(event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    )).map(el => ({name: el.value}));

    if (!hasNewsletterInputs(newsletters) && hasCheckableNewsletterInputs(event.target)) {
        newsletters.length = 0; // ensure empty array
    }

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildRequestBody({
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletters
    });

    try {
        const integrityRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityRes.text();

        const magicRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

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
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Helper to fetch session identity.
 */
async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) return null;
    return await res.text();
}

/**
 * Plan click handler (async/await version).
 */
export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = el.dataset.membersSuccess
        ? (new URL(el.dataset.membersSuccess, window.location.href)).href
        : undefined;
    const checkoutCancelUrl = el.dataset.membersCancel
        ? (new URL(el.dataset.membersCancel, window.location.href)).href
        : undefined;

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (hasUrlHistory(urlHistory)) metadata.urlHistory = urlHistory;

    try {
        const identity = await fetchIdentity(siteUrl);
        const sessionRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                ...requestData,
                identity,
                successUrl: checkoutSuccessUrl,
                cancelUrl: checkoutCancelUrl,
                metadata
            })
        });
        if (!sessionRes.ok) throw new Error(t('Could not create stripe checkout session'));
        const session = await sessionRes.json();

        if (session.url) {
            window.location.assign(session.url);
        } else {
            const stripe = window.Stripe(session.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: session.sessionId});
            if (redirectResult.error) throw new Error(redirectResult.error.message);
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        displayErrorIfElementExists(errorEl, err.message);
        el.classList.add('error');
    }
}

/**
 * Generic click handler creator for Stripe sessions.
 */
function createStripeSessionHandler({siteUrl, endpoint, successUrl, cancelUrl, extraBody = {}, el, errorEl, clickHandler}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identity = await fetchIdentity(siteUrl);
            const res = await fetch(`${siteUrl}/members/api/${endpoint}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    successUrl,
                    cancelUrl,
                    ...extraBody
                })
            });
            if (!res.ok) throw new Error(t('Could not create stripe checkout session'));
            const data = await res.json();

            if (endpoint.includes('billing-portal')) {
                window.location.assign(data.url);
                return;
            }

            const stripe = window.Stripe(data.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: data.sessionId});
            if (redirectResult.error) throw new Error(t(redirectResult.error.message));
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            displayErrorIfElementExists(errorEl, err.message);
            el.classList.add('error');
        }
    };
}

/**
 * Signout click handler.
 */
function createSignoutHandler({siteUrl, el, clickHandler}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
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
    };
}

/**
 * Cancel subscription handler.
 */
function createCancelSubscriptionHandler({siteUrl, offers = [], doAction, el, errorEl, clickHandler}) {
    const hasRetentionOffers = offers.some(o => o.redemption_type === 'retention');
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
        el.classList.remove('error');
        el.classList.add('loading');
        if (errorEl) errorEl.innerText = '';

        const identity = await fetchIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, smart_cancel: true})
        });

        if (res.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            displayErrorIfElementExists(errorEl, t('There was an error cancelling your subscription, please try again.'));
        }
    };
}

/**
 * Continue subscription handler.
 */
function createContinueSubscriptionHandler({siteUrl, el, errorEl, clickHandler}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        const subscriptionId = el.dataset.membersContinueSubscription;
        if (errorEl) errorEl.innerText = '';

        const identity = await fetchIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, cancel_at_period_end: false})
        });

        if (res.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            displayErrorIfElementExists(errorEl, t('There was an error continuing your subscription, please try again.'));
        }
    };
}

/**
 * Main data‑attributes handler.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) return;
    siteUrl = siteUrl.replace(/\/$/, '');

    // Forms
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    // Plan buttons
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
        const clickHandler = createStripeSessionHandler({
            siteUrl,
            endpoint: 'create-stripe-update-session/',
            successUrl,
            cancelUrl,
            el,
            errorEl,
            clickHandler: null // placeholder, will be set below
        });
        // assign self‑reference for re‑attachment
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn
            ? (new URL(el.dataset.membersReturn, window.location.href)).href
            : undefined;
        const clickHandler = createStripeSessionHandler({
            siteUrl,
            endpoint: 'create-stripe-billing-portal-session/',
            successUrl: undefined,
            cancelUrl: undefined,
            extraBody: {returnUrl},
            el,
            errorEl,
            clickHandler: null
        });
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    // Signout
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = createSignoutHandler({siteUrl, el, clickHandler: null});
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = createCancelSubscriptionHandler({
            siteUrl,
            offers,
            doAction,
            el,
            errorEl,
            clickHandler: null
        });
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = createContinueSubscriptionHandler({
            siteUrl,
            el,
            errorEl,
            clickHandler: null
        });
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });
}
```