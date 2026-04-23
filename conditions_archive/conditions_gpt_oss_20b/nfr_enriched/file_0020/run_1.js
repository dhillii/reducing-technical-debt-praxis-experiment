```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Sets the error message on the provided element if it exists.
 * @param {HTMLElement|null} errorEl
 * @param {string} message
 */
function setErrorMessage(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles generic errors during form submission.
 * @param {Error} error
 * @param {HTMLFormElement} form
 * @param {HTMLElement|null} errorEl
 */
function handleFormError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    setErrorMessage(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Builds the request body for the magic link API.
 * @param {string} email
 * @param {string|undefined} emailType
 * @param {string[]} labels
 * @param {string|undefined} name
 * @param {boolean} autoRedirect
 * @param {boolean} wantsOTC
 * @param {string[]} newsletters
 * @param {string|null} urlHistory
 * @returns {object}
 */
function buildMagicLinkBody(email, emailType, labels, name, autoRedirect, wantsOTC, newsletters, urlHistory) {
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect
    };
    if (wantsOTC) body.includeOTC = true;
    if (urlHistory) body.urlHistory = urlHistory;
    if (newsletters.length) body.newsletters = newsletters;
    return body;
}

/**
 * Sends the magic link request.
 * @param {string} siteUrl
 * @param {object} body
 * @returns {Promise<Response>}
 */
async function sendMagicLink(siteUrl, body) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...body, integrityToken})
    });
}

/**
 * Handles the response from the magic link API.
 * @param {Response} res
 * @param {boolean} wantsOTC
 * @param {function} doAction
 * @param {string} email
 * @param {function|null} captureException
 * @returns {Promise<void>}
 */
async function processMagicLinkResponse(res, wantsOTC, doAction, email, captureException) {
    if (!res.ok) {
        const e = await HumanReadableError.fromApiResponse(res);
        throw new Error(chooseBestErrorMessage(e, t('Failed to send magic link email')));
    }

    const responseBody = wantsOTC ? await res.clone().json().catch(() => undefined) : undefined;
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
 * Handles form submission for the members form.
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
    setErrorMessage(errorEl, '');

    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
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
    const reqBody = buildMagicLinkBody(email, emailType, labels, name, autoRedirect === 'true', wantsOTC, newsletters, urlHistory);

    form.classList.add('loading');

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        await processMagicLinkResponse(magicLinkRes, wantsOTC, doAction, email, captureException);

        if (magicLinkRes.ok) {
            form.classList.add('success');
        }
    } catch (err) {
        handleFormError(err, form, errorEl);
    }
}

/**
 * Handles plan click events.
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

    setErrorMessage(errorEl, '');
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = sessionRes.ok ? await sessionRes.text() : null;

        const checkoutRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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

        if (!checkoutRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const checkoutBody = await checkoutRes.json();

        if (checkoutBody.url) {
            window.location.assign(checkoutBody.url);
        } else {
            const stripe = window.Stripe(checkoutBody.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: checkoutBody.sessionId});
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        setErrorMessage(errorEl, err.message);
        el.classList.add('error');
    }
}

/**
 * Handles edit billing click events.
 * @param {object} params
 */
async function handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    setErrorMessage(errorEl, '');
    el.classList.add('loading');

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = sessionRes.ok ? await sessionRes.text() : null;

        const updateRes = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, successUrl, cancelUrl})
        });

        if (!updateRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const result = await updateRes.json();
        const stripe = window.Stripe(result.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});

        if (redirectResult.error) {
            throw new Error(t(redirectResult.error.message));
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        setErrorMessage(errorEl, err.message);
        el.classList.add('error');
    }
}

/**
 * Handles manage billing click events.
 * @param {object} params
 */
async function handleManageBillingClick({el, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    setErrorMessage(errorEl, '');
    el.classList.add('loading');

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = sessionRes.ok ? await sessionRes.text() : null;

        const portalRes = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, returnUrl})
        });

        if (!portalRes.ok) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }

        const result = await portalRes.json();
        window.location.assign(result.url);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        setErrorMessage(errorEl, err.message);
        el.classList.add('error');
    }
}

/**
 * Handles signout click events.
 * @param {object} params
 */
async function handleSignoutClick({el, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    el.classList.remove('error');
    el.classList.add('loading');

    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            throw new Error('Signout failed');
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

/**
 * Handles cancel subscription click events.
 * @param {object} params
 */
async function handleCancelSubscriptionClick({
    el,
    errorEl,
    siteUrl,
    subscriptionId,
    hasRetentionOffers,
    doAction,
    clickHandler
}) {
    event.preventDefault();

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

    setErrorMessage(errorEl, '');

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = sessionRes.ok ? await sessionRes.text() : null;

        const cancelRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, smart_cancel: true})
        });

        if (cancelRes.ok) {
            window.location.reload();
        } else {
            throw new Error(t('There was an error cancelling your subscription, please try again.'));
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        setErrorMessage(errorEl, err.message);
    }
}

/**
 * Handles continue subscription click events.
 * @param {object} params
 */
async function handleContinueSubscriptionClick({
    el,
    errorEl,
    siteUrl,
    subscriptionId,
    clickHandler
}) {
    event.preventDefault();

    el.removeEventListener('click', clickHandler);
    el.classList.remove('error');
    el.classList.add('loading');

    setErrorMessage(errorEl, '');

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = sessionRes.ok ? await sessionRes.text() : null;

        const continueRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, cancel_at_period_end: false})
        });

        if (continueRes.ok) {
            window.location.reload();
        } else {
            throw new Error(t('There was an error continuing your subscription, please try again.'));
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        setErrorMessage(errorEl, err.message);
    }
}

/**
 * Initializes data attribute handlers for the Ghost members integration.
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

    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    // Forms
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        form.addEventListener('submit', submitHandler);
    });

    // Plan buttons
    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler});
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? new URL(membersSuccess, window.location.href).href : undefined;
        const cancelUrl = membersCancel ? new URL(membersCancel, window.location.href).href : undefined;
        const clickHandler = event => handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler});
        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? new URL(membersReturn, window.location.href).href : undefined;
        const clickHandler = event => handleManageBillingClick({el, errorEl, siteUrl, returnUrl, clickHandler});
        el.addEventListener('click', clickHandler);
    });

    // Signout
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = event => handleSignoutClick({el, siteUrl, clickHandler});
        el.addEventListener('click', clickHandler);
    });

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;
        const clickHandler = event => handleCancelSubscriptionClick({
            el,
            errorEl,
            siteUrl,
            subscriptionId,
            hasRetentionOffers,
            doAction,
            clickHandler
        });
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;
        const clickHandler = event => handleContinueSubscriptionClick({
            el,
            errorEl,
            siteUrl,
            subscriptionId,
            clickHandler
        });
        el.addEventListener('click', clickHandler);
    });
}
```