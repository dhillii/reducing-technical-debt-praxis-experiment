```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

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

/** @returns {boolean} */
function isSigninWithOTC(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}

/** @returns {boolean} */
function hasCheckableNewsletterInputs(event) {
    const checkableInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkableInputs.length > 0;
}

/** @returns {boolean} */
function hasNewsletterInputs(newsletterInputs) {
    return newsletterInputs.length > 0;
}

/** @returns {Array} */
function extractLabels(event) {
    const labels = [];
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

/** @returns {Array} */
function extractNewsletters(event) {
    const newsletters = [];
    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return newsletters;
}

/** @returns {string|undefined} */
function extractEmailType(form) {
    return form.dataset.membersForm || undefined;
}

/** @returns {string} */
function extractAutoRedirect(form) {
    return form?.dataset?.membersAutoredirect || 'true';
}

/** @returns {Object} */
function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, newsletterInputs) {
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: (autoRedirect === 'true')
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (hasNewsletterInputs(newsletterInputs)) {
        reqBody.newsletters = newsletters;
    } else if (hasCheckableNewsletterInputs({target: {querySelectorAll: () => []}})) {
        reqBody.newsletters = [];
    }

    return reqBody;
}

/** @returns {Promise<string>} */
async function fetchIntegrityToken(siteUrl) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return integrityTokenRes.text();
}

/** @returns {Promise<Response>} */
async function sendMagicLink(siteUrl, reqBody, integrityToken) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

/** @returns {Promise<Object|undefined>} */
async function parseOTCResponse(magicLinkRes) {
    try {
        return await magicLinkRes.clone().json();
    } catch (e) {
        return undefined;
    }
}

/** @returns {boolean} */
function hasOTCRef(responseBody) {
    return !!(responseBody?.otc_ref);
}

/** @returns {void} */
function handleOTCAction(doAction, email, otcRef, inboxLinks, captureException) {
    if (!hasOTCRef({otc_ref: otcRef}) || typeof doAction !== 'function') {
        return;
    }

    try {
        doAction('startSigninOTCFromCustomForm', {
            email: (email || '').trim(),
            otcRef,
            inboxLinks
        });
    } catch (e) {
        console.error(e);
        captureException?.(e);
    }
}

/** @returns {void} */
async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, doAction, email, errorEl, captureException) {
    let responseBody;

    if (wantsOTC) {
        responseBody = await parseOTCResponse(magicLinkRes);
    }

    const otcRef = responseBody?.otc_ref;
    handleOTCAction(doAction, email, otcRef, responseBody?.inboxLinks, captureException);
}

/** @returns {void} */
async function handleMagicLinkFailure(magicLinkRes, errorEl) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
}

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = extractAutoRedirect(form);
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = extractEmailType(form);
    const labels = extractLabels(event);
    const newsletters = extractNewsletters(event);
    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];

    const wantsOTC = isSigninWithOTC(emailType, form);

    form.classList.add('loading');

    const urlHistory = getUrlHistory();
    const reqBody = buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, newsletterInputs);

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (!magicLinkRes.ok) {
            await handleMagicLinkFailure(magicLinkRes, errorEl);
            form.classList.add('error');
            return;
        }

        form.classList.add('success');
        await handleMagicLinkSuccess(magicLinkRes, wantsOTC, doAction, email, errorEl, captureException);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @returns {string|null} */
function extractSessionIdentity(res) {
    if (!res.ok) {
        return null;
    }
    return res.text();
}

/** @returns {void} */
function handleCheckoutError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

/** @returns {Object} */
function buildCheckoutMetadata(member, urlHistory) {
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }
    return metadata;
}

/** @returns {Promise<Object>} */
async function createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity: identity,
            successUrl: checkoutSuccessUrl,
            cancelUrl: checkoutCancelUrl,
            metadata
        })
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

/** @returns {void} */
async function handleCheckoutResponse(responseBody) {
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

/** @returns {string|undefined} */
function buildUrlFromAttribute(urlAttribute) {
    if (!urlAttribute) {
        return undefined;
    }
    return (new URL(urlAttribute, window.location.href)).href;
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = buildUrlFromAttribute(el.dataset.membersSuccess);
    const checkoutCancelUrl = buildUrlFromAttribute(el.dataset.membersCancel);

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    const urlHistory = getUrlHistory();
    const metadata = buildCheckoutMetadata(member, urlHistory);

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then((res) => extractSessionIdentity(res))
        .then((identity) => createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata))
        .then((responseBody) => handleCheckoutResponse(responseBody))
        .catch((err) => handleCheckoutError(err, el, errorEl, clickHandler));
}

/** @returns {void} */
function handleEditBillingError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

/** @returns {Promise<Object>} */
async function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity: identity,
            successUrl: successUrl,
            cancelUrl: cancelUrl
        })
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

/** @returns {void} */
async function handleUpdateSessionResponse(result) {
    const stripe = window.Stripe(result.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: result.sessionId
    });

    if (redirectResult.error) {
        throw new Error(t(redirectResult.error.message));
    }
}

/** @returns {void} */
function handleManageBillingError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

/** @returns {Promise<Object>} */
async function createStripeBillingPortalSession(siteUrl, identity, returnUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity: identity,
            returnUrl
        })
    });

    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }

    return res.json();
}

/** @returns {void} */
function handleSignoutError(el, clickHandler) {
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');
}

/** @returns {void} */
function handleCancelSubscriptionError(el, errorEl, clickHandler) {
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');

    if (errorEl) {
        errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
    }
}

/** @returns {void} */
function handleContinueSubscriptionError(el, errorEl, clickHandler) {
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');

    if (errorEl) {
        errorEl.innerText = t('There was an error continuing your subscription, please try again.');
    }
}

/** @returns {boolean} */
function shouldOpenRetentionPortal(hasRetentionOffers) {
    return hasRetentionOffers;
}

/** @returns {void} */
async function performCancelSubscription(siteUrl, subscriptionId, errorEl) {
    const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });

    if (!sessionRes.ok) {
        return null;
    }

    const identity = await sessionRes.text();

    const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity: identity,
            smart_cancel: true
        })
    });

    if (!res.ok) {
        throw new Error('Failed to cancel subscription');
    }

    window.location.reload();
}

/** @returns {void} */
async function performContinueSubscription(siteUrl, subscriptionId, errorEl) {
    const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });

    if (!sessionRes.ok) {
        return null;
    }

    const identity = await sessionRes.text();

    const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON