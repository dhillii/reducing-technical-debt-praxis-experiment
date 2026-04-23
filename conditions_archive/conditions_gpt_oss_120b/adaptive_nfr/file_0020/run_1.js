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
 * Apply error styling and display a human‑readable message.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Guard predicate for OTC flow.
 */
function isOtcRequested(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}

/**
 * Guard predicate for auto‑redirect flag.
 */
function isAutoRedirectEnabled(form) {
    return (form?.dataset?.membersAutoredirect ?? 'true') === 'true';
}

/**
 * Build request body for magic‑link submission.
 */
function buildRequestBody({email, name, emailType, labels, autoRedirect, wantsOTC, urlHistory, newsletters}) {
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        includeOTC: wantsOTC,
        urlHistory,
        newsletters
    };
    // Remove undefined keys
    Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);
    return body;
}

/**
 * Submit magic‑link form.
 */
export async function formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    if (errorEl) errorEl.innerText = '';
    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;

    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const labels = Array.from(labelInputs, el => el.value);

    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    const newsletters = Array.from(newsletterInputs, el => ({name: el.value}));

    const emailType = form.dataset?.membersForm;
    const wantsOTC = isOtcRequested(emailType, form);
    const autoRedirect = isAutoRedirectEnabled(form);
    const urlHistory = getUrlHistory();

    // Determine newsletters payload
    let newslettersPayload;
    if (newsletterInputs.length > 0) {
        newslettersPayload = newsletters;
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            newslettersPayload = [];
        }
    }

    const reqBody = buildRequestBody({
        email,
        name,
        emailType,
        labels,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletters: newslettersPayload
    });

    form.classList.add('loading');

    try {
        const integrityRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (!magicLinkRes.ok) {
            const apiError = await HumanReadableError.fromApiResponse(magicLinkRes);
            const message = chooseBestErrorMessage(apiError, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, message);
            form.classList.add('error');
            return;
        }

        form.classList.add('success');

        let responseBody;
        if (wantsOTC) {
            try {
                responseBody = await magicLinkRes.clone().json();
            } catch {
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
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Guard predicate for successful fetch response.
 */
function isResponseOk(res) {
    return res && res.ok;
}

/**
 * Create Stripe checkout session and redirect.
 */
async function createAndRedirectCheckout({siteUrl, requestData, identity, successUrl, cancelUrl, metadata}) {
    const sessionRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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

    if (!isResponseOk(sessionRes)) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const session = await sessionRes.json();

    if (session.url) {
        window.location.assign(session.url);
        return;
    }

    const stripe = window.Stripe(session.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: session.sessionId});
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

/**
 * Handle plan click – creates Stripe checkout session.
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
        const identity = isResponseOk(sessionRes) ? await sessionRes.text() : null;
        await createAndRedirectCheckout({siteUrl, requestData, identity, successUrl, cancelUrl, metadata});
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        displayErrorIfElementExists(errorEl, err.message);
        el.classList.add('error');
    }
}

/**
 * Generic fetch helper that returns text or null.
 */
async function fetchTextOrNull(url, options) {
    const res = await fetch(url, options);
    return isResponseOk(res) ? await res.text() : null;
}

/**
 * Create Stripe update session and redirect.
 */
async function createAndRedirectUpdate({siteUrl, identity, successUrl, cancelUrl, el, errorEl, clickHandler}) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, successUrl, cancelUrl})
    });

    if (!isResponseOk(res)) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const data = await res.json();
    const stripe = window.Stripe(data.publicKey);
    const result = await stripe.redirectToCheckout({sessionId: data.sessionId});
    if (result.error) {
        throw new Error(t(result.error.message));
    }
}

/**
 * Handle edit‑billing click.
 */
function makeEditBillingHandler({el, siteUrl, errorEl, clickHandler}) {
    return async function editBillingHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        const successUrl = el.dataset.membersSuccess
            ? (new URL(el.dataset.membersSuccess, window.location.href)).href
            : undefined;
        const cancelUrl = el.dataset.membersCancel
            ? (new URL(el.dataset.membersCancel, window.location.href)).href
            : undefined;

        try {
            const identity = await fetchTextOrNull(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
            await createAndRedirectUpdate({siteUrl, identity, successUrl, cancelUrl, el, errorEl, clickHandler});
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
 * Create Stripe billing portal session and redirect.
 */
async function createAndRedirectPortal({siteUrl, identity, returnUrl, el, errorEl, clickHandler}) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, returnUrl})
    });

    if (!isResponseOk(res)) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }

    const data = await res.json();
    window.location.assign(data.url);
}

/**
 * Handle manage‑billing click.
 */
function makeManageBillingHandler({el, siteUrl, errorEl, clickHandler}) {
    return async function manageBillingHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identity = await fetchTextOrNull(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
            await createAndRedirectPortal({siteUrl, identity, returnUrl: undefined, el, errorEl, clickHandler});
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
 * Sign‑out handler.
 */
function makeSignoutHandler({el, siteUrl, clickHandler}) {
    return async function signoutHandler(event) {
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
function makeCancelSubscriptionHandler({el, siteUrl, errorEl, doAction, hasRetentionOffers, clickHandler}) {
    return async function cancelSubscriptionHandler(event) {
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

        try {
            const identity = await fetchTextOrNull(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
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
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    };
}

/**
 * Continue subscription handler.
 */
function makeContinueSubscriptionHandler({el, siteUrl, errorEl, clickHandler}) {
    return async function continueSubscriptionHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        const subscriptionId = el.dataset.membersContinueSubscription;
        if (errorEl) errorEl.innerText = '';

        try {
            const identity = await fetchTextOrNull(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
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
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    };
}

/**
 * Initialise data‑attribute handlers.
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
        const clickHandler = makeEditBillingHandler({el, siteUrl, errorEl, clickHandler: null});
        // bind actual reference after creation
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = makeManageBillingHandler({el, siteUrl, errorEl, clickHandler: null});
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    // Sign out
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = makeSignoutHandler({el, siteUrl, clickHandler: null});
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = makeCancelSubscriptionHandler({
            el,
            siteUrl,
            errorEl,
            doAction,
            hasRetentionOffers,
            clickHandler: null
        });
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = makeContinueSubscriptionHandler({el, siteUrl, errorEl, clickHandler: null});
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });
}