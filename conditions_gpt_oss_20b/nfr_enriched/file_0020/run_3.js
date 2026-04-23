import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/* eslint-disable no-console */

function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Fetch the current identity token from the session endpoint.
 */
async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) return null;
    return res.text();
}

/**
 * Create a Stripe checkout session and return the response body.
 */
async function createStripeCheckoutSession(siteUrl, payload) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(t('Could not create stripe checkout session'));
    return res.json();
}

/**
 * Redirect the browser to the Stripe checkout URL.
 */
async function redirectToStripeCheckout(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
    if (redirectResult.error) throw new Error(redirectResult.error.message);
}

/**
 * Handle a generic Stripe session flow: fetch identity, create session, redirect.
 */
async function handleStripeSession({
    siteUrl,
    payload,
    successUrl,
    cancelUrl,
    metadata,
    errorEl,
    el,
    clickHandler
}) {
    try {
        const identity = await fetchIdentity(siteUrl);
        const sessionPayload = {
            ...payload,
            identity,
            successUrl,
            cancelUrl,
            metadata
        };
        const responseBody = await createStripeCheckoutSession(siteUrl, sessionPayload);
        await redirectToStripeCheckout(responseBody);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Build the request body for the magic link request.
 */
function buildMagicLinkRequestBody({
    email,
    emailType,
    labels,
    name,
    autoRedirect,
    wantsOTC,
    urlHistory,
    newsletters
}) {
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect
    };
    if (wantsOTC) body.includeOTC = true;
    if (urlHistory) body.urlHistory = urlHistory;
    if (newsletters.length > 0) body.newsletters = newsletters;
    return body;
}

/**
 * Handle the success response of the magic link request.
 */
async function handleMagicLinkSuccess({
    magicLinkRes,
    form,
    email,
    wantsOTC,
    doAction,
    captureException
}) {
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
}

/**
 * Handle the error response of the magic link request.
 */
async function handleMagicLinkError({
    magicLinkRes,
    form,
    errorEl
}) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
    form.classList.add('error');
}

/**
 * Submit handler for member forms.
 */
export async function formSubmitHandler({
    event,
    form,
    errorEl,
    siteUrl,
    submitHandler,
    doAction,
    captureException
}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) errorEl.innerText = '';
    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(el => el.value);
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    );
    const newsletters = Array.from(newsletterInputs).map(el => ({name: el.value}));

    const urlHistory = getUrlHistory();
    const reqBody = buildMagicLinkRequestBody({
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        wantsOTC,
        urlHistory,
        newsletters
    });

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
            await handleMagicLinkSuccess({
                magicLinkRes,
                form,
                email,
                wantsOTC,
                doAction,
                captureException
            });
        } else {
            await handleMagicLinkError({magicLinkRes, form, errorEl});
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Click handler for plan elements.
 */
export function planClickHandler({
    event,
    el,
    errorEl,
    siteUrl,
    site,
    member,
    clickHandler
}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess
        ? new URL(el.dataset.membersSuccess, window.location.href).href
        : undefined;
    const cancelUrl = el.dataset.membersCancel
        ? new URL(el.dataset.membersCancel, window.location.href).href
        : undefined;

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    handleStripeSession({
        siteUrl,
        payload: requestData,
        successUrl,
        cancelUrl,
        metadata,
        errorEl,
        el,
        clickHandler
    });
}

/**
 * Attach event listeners to all data attribute elements.
 */
export function handleDataAttributes({
    siteUrl,
    site = {},
    member,
    offers = [],
    doAction,
    captureException
} = {}) {
    if (!siteUrl) return;
    siteUrl = siteUrl.replace(/\/$/, '');

    // Forms
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        form.addEventListener('submit', submitHandler);
    });

    // Plan buttons
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess
            ? new URL(el.dataset.membersSuccess, window.location.href).href
            : undefined;
        const cancelUrl = el.dataset.membersCancel
            ? new URL(el.dataset.membersCancel, window.location.href).href
            : undefined;
        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            if (errorEl) errorEl.innerText = '';
            el.classList.add('loading');
            handleStripeSession({
                siteUrl,
                payload: {},
                successUrl,
                cancelUrl,
                metadata: {},
                errorEl,
                el,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn
            ? new URL(el.dataset.membersReturn, window.location.href).href
            : undefined;
        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            if (errorEl) errorEl.innerText = '';
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(res => (res.ok ? res.text() : null))
                .then(identity => {
                    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({identity, returnUrl})
                    });
                })
                .then(res => {
                    if (!res.ok) throw new Error(t('Could not create Stripe billing portal session'));
                    return res.json();
                })
                .then(result => window.location.assign(result.url))
                .catch(err => {
                    console.error(err);
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    if (errorEl) errorEl.innerText = err.message;
                    el.classList.add('error');
                });
        };
        el.addEventListener('click', clickHandler);
    });

    // Signout
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), el => {
        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
                .then(res => {
                    if (res.ok) window.location.replace(siteUrl);
                    else {
                        el.addEventListener('click', clickHandler);
                        el.classList.remove('loading');
                        el.classList.add('error');
                    }
                });
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    // Cancel subscription
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
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
            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(res => (res.ok ? res.text() : null))
                .then(identity => {
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({identity, smart_cancel: true})
                    });
                })
                .then(res => {
                    if (res.ok) window.location.reload();
                    else {
                        el.addEventListener('click', clickHandler);
                        el.classList.remove('loading');
                        el.classList.add('error');
                        if (errorEl) errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
                    }
                });
        };
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            const subscriptionId = el.dataset.membersContinueSubscription;
            if (errorEl) errorEl.innerText = '';
            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(res => (res.ok ? res.text() : null))
                .then(identity => {
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({identity, cancel_at_period_end: false})
                    });
                })
                .then(res => {
                    if (res.ok) window.location.reload();
                    else {
                        el.addEventListener('click', clickHandler);
                        el.classList.remove('loading');
                        el.classList.add('error');
                        if (errorEl) errorEl.innerText = t('There was an error continuing your subscription, please try again.');
                    }
                });
        };
        el.addEventListener('click', clickHandler);
    });
}