```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Sets the error message on an element if it exists.
 * @param {HTMLElement|null} errorEl
 * @param {string} message
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles generic form errors.
 * @param {Error} error
 * @param {HTMLFormElement} form
 * @param {HTMLElement|null} errorEl
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extracts email and name from the form event.
 * @param {Event} event
 * @returns {{email: string|null, name: string|undefined}}
 */
function extractEmailAndName(event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const email = emailInput?.value ?? null;
    const name = (nameInput?.value ?? '').trim() || undefined;
    return {email, name};
}

/**
 * Extracts labels from the form event.
 * @param {Event} event
 * @returns {string[]}
 */
function extractLabels(event) {
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    return Array.from(labelInputs, (el) => el.value);
}

/**
 * Extracts newsletter selections from the form event.
 * @param {Event} event
 * @returns {{name: string}[]}
 */
function extractNewsletters(event) {
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    return Array.from(newsletterInputs, (el) => ({name: el.value}));
}

/**
 * Builds the request body for the magic link API.
 * @param {object} params
 * @returns {object}
 */
function buildRequestBody(params) {
    const {
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletters
    } = params;
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
 * Sends the magic link request.
 * @param {string} siteUrl
 * @param {object} reqBody
 * @returns {Promise<Response>}
 */
async function sendMagicLink(siteUrl, reqBody) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

/**
 * Handles a successful magic link response.
 * @param {Response} magicLinkRes
 * @param {HTMLFormElement} form
 * @param {boolean} wantsOTC
 * @param {Function} doAction
 * @param {Function} captureException
 * @param {string|null} email
 */
async function handleMagicLinkSuccess(
    magicLinkRes,
    form,
    wantsOTC,
    doAction,
    captureException,
    email
) {
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
 * Handles a failed magic link response.
 * @param {Response} magicLinkRes
 * @param {HTMLFormElement} form
 * @param {HTMLElement|null} errorEl
 */
async function handleMagicLinkError(magicLinkRes, form, errorEl) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
    form.classList.add('error');
}

/**
 * Main form submit handler.
 * @param {object} params
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

    const {email, name} = extractEmailAndName(event);
    const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = extractLabels(event);
    const newsletters = extractNewsletters(event);

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

    form.classList.add('loading');
    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);
        form.removeEventListener('submit', submitHandler);
        form.classList.remove('loading');
        if (magicLinkRes.ok) {
            await handleMagicLinkSuccess(magicLinkRes, form, wantsOTC, doAction, captureException, email);
        } else {
            await handleMagicLinkError(magicLinkRes, form, errorEl);
        }
    } catch (err) {
        handleError(err, form, errorEl);
    } finally {
        form.addEventListener('submit', submitHandler);
    }
}

/**
 * Fetches the current session identity.
 * @param {string} siteUrl
 * @returns {Promise<string|null>}
 */
async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) return null;
    return res.text();
}

/**
 * Creates a Stripe checkout session.
 * @param {object} params
 * @returns {Promise<object>}
 */
async function createCheckoutSession({
    siteUrl,
    requestData,
    identity,
    successUrl,
    cancelUrl,
    metadata
}) {
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
    if (!res.ok) throw new Error(t('Could not create stripe checkout session'));
    return res.json();
}

/**
 * Redirects to Stripe checkout or handles errors.
 * @param {object} responseBody
 * @returns {Promise<void>}
 */
async function redirectToStripe(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
    if (redirectResult.error) throw new Error(redirectResult.error.message);
}

/**
 * Main plan click handler.
 * @param {object} params
 */
export async function planClickHandler({
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

    try {
        const identity = await fetchIdentity(siteUrl);
        const responseBody = await createCheckoutSession({
            siteUrl,
            requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        });
        await redirectToStripe(responseBody);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Attaches a submit handler to a form element.
 * @param {HTMLFormElement} form
 * @param {string} siteUrl
 * @param {Function} doAction
 * @param {Function} captureException
 */
function attachFormSubmitHandler(form, siteUrl, doAction, captureException) {
    const errorEl = form.querySelector('[data-members-error]');
    const submitHandler = (event) => {
        formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
    };
    form.addEventListener('submit', submitHandler);
}

/**
 * Attaches a click handler to a plan element.
 * @param {HTMLElement} el
 * @param {string} siteUrl
 * @param {object} site
 * @param {object|null} member
 * @param {Function} doAction
 */
function attachPlanClickHandler(el, siteUrl, site, member, doAction) {
    const errorEl = el.querySelector('[data-members-error]');
    const clickHandler = (event) => {
        planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler});
    };
    el.addEventListener('click', clickHandler);
}

/**
 * Handles edit billing click events.
 * @param {HTMLElement} el
 * @param {string} siteUrl
 * @param {Function} doAction
 */
function attachEditBillingHandler(el, siteUrl, doAction) {
    const errorEl = el.querySelector('[data-members-error]');
    const membersSuccess = el.dataset.membersSuccess;
    const membersCancel = el.dataset.membersCancel;
    const successUrl = membersSuccess
        ? new URL(membersSuccess, window.location.href).href
        : undefined;
    const cancelUrl = membersCancel
        ? new URL(membersCancel, window.location.href).href
        : undefined;

    const clickHandler = async (event) => {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identity = await fetchIdentity(siteUrl);
            const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, successUrl, cancelUrl})
            });
            if (!res.ok) throw new Error(t('Could not create stripe checkout session'));
            const result = await res.json();
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirectResult.error) throw new Error(t(redirectResult.error.message));
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) errorEl.innerText = err.message;
            el.classList.add('error');
        }
    };
    el.addEventListener('click', clickHandler);
}

/**
 * Handles billing portal click events.
 * @param {HTMLElement} el
 * @param {string} siteUrl
 * @param {Function} doAction
 */
function attachBillingPortalHandler(el, siteUrl, doAction) {
    const errorEl = el.querySelector('[data-members-error]');
    const membersReturn = el.dataset.membersReturn;
    const returnUrl = membersReturn
        ? new URL(membersReturn, window.location.href).href
        : undefined;

    const clickHandler = async (event) => {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identity = await fetchIdentity(siteUrl);
            const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, returnUrl})
            });
            if (!res.ok) throw new Error(t('Could not create Stripe billing portal session'));
            const result = await res.json();
            window.location.assign(result.url);
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) errorEl.innerText = err.message;
            el.classList.add('error');
        }
    };
    el.addEventListener('click', clickHandler);
}

/**
 * Handles signout click events.
 * @param {HTMLElement} el
 * @param {string} siteUrl
 */
function attachSignoutHandler(el, siteUrl) {
    const clickHandler = async (event) => {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        try {
            const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
            if (res.ok) window.location.replace(siteUrl);
            else throw new Error('Signout failed');
        } catch {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    };
    el.addEventListener('click', clickHandler);
}

/**
 * Handles subscription cancellation.
 * @param {HTMLElement} el
 * @param {string} siteUrl
 * @param {Function} doAction
 * @param {boolean} hasRetentionOffers
 */
function attachCancelSubscriptionHandler(el, siteUrl, doAction, hasRetentionOffers) {
    const errorEl = el.parentElement.querySelector('[data-members-error]');
    const clickHandler = async (event) => {
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
            const identity = await fetchIdentity(siteUrl);
            const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, smart_cancel: true})
            });
            if (res.ok) window.location.reload();
            else throw new Error('Cancel failed');
        } catch {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
        }
    };
    el.addEventListener('click', clickHandler);
}

/**
 * Handles subscription continuation.
 * @param {HTMLElement} el
 * @param {string} siteUrl
 * @param {Function} doAction
 */
function attachContinueSubscriptionHandler(el, siteUrl, doAction) {
    const errorEl = el.parentElement.querySelector('[data-members-error]');
    const clickHandler = async (event) => {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        const subscriptionId = el.dataset.membersContinueSubscription;

        if (errorEl) errorEl.innerText = '';

        try {
            const identity = await fetchIdentity(siteUrl);
            const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, cancel_at_period_end: false})
            });
            if (res.ok) window.location.reload();
            else throw new Error('Continue failed');
        } catch {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) errorEl.innerText = t('There was an error continuing your subscription, please try again.');
        }
    };
    el.addEventListener('click', clickHandler);
}

/**
 * Initializes all data attribute handlers on the page.
 * @param {object} params
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
    document.querySelectorAll('form[data-members-form]').forEach((form) => {
        attachFormSubmitHandler(form, siteUrl, doAction, captureException);
    });

    // Plans
    document.querySelectorAll('[data-members-plan]').forEach((el) => {
        attachPlanClickHandler(el, siteUrl, site, member, doAction);
    });

    // Edit billing
    document.querySelectorAll('[data-members-edit-billing]').forEach((el) => {
        attachEditBillingHandler(el, siteUrl, doAction);
    });

    // Billing portal
    document.querySelectorAll('[data-members-manage-billing]').forEach((el) => {
        attachBillingPortalHandler(el, siteUrl, doAction);
    });

    // Signout
    document.querySelectorAll('[data-members-signout]').forEach((el) => {
        attachSignoutHandler(el, siteUrl);
    });

    const hasRetentionOffers = offers.some((offer) => offer.redemption_type === 'retention');

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach((el) => {
        attachCancelSubscriptionHandler(el, siteUrl, doAction, hasRetentionOffers);
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach((el) => {
        attachContinueSubscriptionHandler(el, siteUrl, doAction);
    });
}
```