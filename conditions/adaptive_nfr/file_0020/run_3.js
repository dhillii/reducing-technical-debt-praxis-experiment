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

/** @param {string} emailType - The form type */
function isSigninWithOTC(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}

/** @param {HTMLElement} form - The form element */
function extractFormInputs(form) {
    const emailInput = form.querySelector('input[data-members-email]');
    const nameInput = form.querySelector('input[data-members-name]');
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    
    return {emailInput, nameInput, labelInputs, newsletterInputs};
}

/** @param {HTMLElement} form - The form element */
function extractFormMetadata(form) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm || undefined;
    return {autoRedirect, emailType};
}

/** @param {Array} labelInputs - Label input elements */
function extractLabels(labelInputs) {
    const labels = [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

/** @param {Array} newsletterInputs - Newsletter input elements */
function extractNewsletters(newsletterInputs) {
    const newsletters = [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return newsletters;
}

/** @param {HTMLElement} form - The form element */
function shouldSetEmptyNewsletters(form, newsletterInputs) {
    if (newsletterInputs.length > 0) {
        return false;
    }
    const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkableNewsletterInputs.length > 0;
}

/** @param {Object} reqBody - Request body object */
function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, shouldSetEmpty) {
    const body = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: (autoRedirect === 'true')
    };
    
    if (wantsOTC) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (newsletters.length > 0) {
        body.newsletters = newsletters;
    } else if (shouldSetEmpty) {
        body.newsletters = [];
    }
    
    return body;
}

/** @param {Object} responseBody - Response body from magic link */
function hasOTCRef(responseBody) {
    return responseBody?.otc_ref;
}

/** @param {Function} doAction - Action dispatcher */
function isDoActionFunction(doAction) {
    return typeof doAction === 'function';
}

async function handleOTCSignin(responseBody, email, doAction, captureException) {
    const otcRef = responseBody?.otc_ref;
    if (!otcRef || !isDoActionFunction(doAction)) {
        return;
    }
    
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

async function handleMagicLinkResponse(magicLinkRes, wantsOTC, email, doAction, captureException, form, errorEl) {
    if (!magicLinkRes.ok) {
        const e = await HumanReadableError.fromApiResponse(magicLinkRes);
        const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
        displayErrorIfElementExists(errorEl, errorMessage);
        form.classList.add('error');
        return;
    }
    
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
    
    await handleOTCSignin(responseBody, email, doAction, captureException);
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
    
    const {emailInput, nameInput, labelInputs, newsletterInputs} = extractFormInputs(form);
    const {autoRedirect, emailType} = extractFormMetadata(form);
    
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const labels = extractLabels(labelInputs);
    const newsletters = extractNewsletters(newsletterInputs);
    const wantsOTC = isSigninWithOTC(emailType, form);
    const shouldSetEmpty = shouldSetEmptyNewsletters(form, newsletterInputs);
    
    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, shouldSetEmpty);

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
        
        await handleMagicLinkResponse(magicLinkRes, wantsOTC, email, doAction, captureException, form, errorEl);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @param {string} url - URL string to validate */
function isValidUrl(url) {
    return !!url;
}

/** @param {string} url - URL string to convert */
function buildAbsoluteUrl(url) {
    if (!isValidUrl(url)) {
        return undefined;
    }
    return (new URL(url, window.location.href)).href;
}

/** @param {Object} responseBody - Stripe response body */
function hasCheckoutUrl(responseBody) {
    return responseBody?.url;
}

async function handleCheckoutUrlResponse(responseBody) {
    if (hasCheckoutUrl(responseBody)) {
        return window.location.assign(responseBody.url);
    }
    return responseBody;
}

async function handleStripeRedirect(responseBody) {
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });
    
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

async function fetchCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
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

async function fetchSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    
    if (!res.ok) {
        return null;
    }
    
    return res.text();
}

function handlePlanClickError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = buildAbsoluteUrl(successUrl);
    const checkoutCancelUrl = buildAbsoluteUrl(cancelUrl);

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetchSessionIdentity(siteUrl)
        .then(identity => fetchCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata))
        .then(responseBody => handleCheckoutUrlResponse(responseBody))
        .then(responseBody => handleStripeRedirect(responseBody))
        .catch(err => handlePlanClickError(err, el, errorEl, clickHandler));
}

/** @param {string} url - URL string to validate */
function isUrlPresent(url) {
    return !!url;
}

async function fetchBillingUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
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

async function handleBillingUpdateCheckout(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

async function handleBillingUpdateResult(result) {
    if (result.error) {
        throw new Error(t(result.error.message));
    }
}

function handleBillingUpdateError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

function handleEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    
    return fetchSessionIdentity(siteUrl)
        .then(identity => fetchBillingUpdateSession(siteUrl, identity, successUrl, cancelUrl))
        .then(result => handleBillingUpdateCheckout(result))
        .then(result => handleBillingUpdateResult(result))
        .catch(err => handleBillingUpdateError(err, el, errorEl, clickHandler));
}

async function fetchBillingPortalSession(siteUrl, identity, returnUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
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

function handleBillingPortalError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

function handleManageBillingClickHandler(el, errorEl, siteUrl, returnUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    
    return fetchSessionIdentity(siteUrl)
        .then(identity => fetchBillingPortalSession(siteUrl, identity, returnUrl))
        .then(result => window.location.assign(result.url))
        .catch(err => handleBillingPortalError(err, el, errorEl, clickHandler));
}

function handleSignoutClickHandler(el, siteUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');
    
    return fetch(`${siteUrl}/members/api/session`, {
        method: 'DELETE'
    }).then(function (res) {
        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    });
}

/** @param {Array} offers - Offers array */
function hasRetentionOffer(offers) {
    return (offers || []).some(offer => offer.redemption_type === 'retention');
}

async function fetchSubscriptionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    
    if (!res.ok) {
        return null;
    }
    
    return res.text();
}

async function updateSubscriptionCancel(siteUrl, subscriptionId, identity) {
    const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity: identity,
            smart_cancel: true
        })
    });
    
    return res;
}

function handleCancelSubscriptionSuccess(el, errorEl, clickHandler) {
    window.location.reload();
}

function handleCancelSubscriptionError(res, el, errorEl, clickHandler) {
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');

    if (errorEl) {
        errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
    }
}

function handleCancelSubscriptionClickHandler(el, errorEl, siteUrl, subscriptionId, hasRetention, doAction, clickHandler) {
    event.preventDefault();

    if (hasRetention) {
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
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    return fetchSubscriptionIdentity(siteUrl)
        .then(identity => updateSubscriptionCancel(siteUrl, subscriptionId, identity))
        .then(res => {
            if (res.ok) {
                handleCancelSubscriptionSuccess(el, errorEl, clickHandler);
            } else {
                handleCancelSubscriptionError(res, el, errorEl, clickHandler);
            }
        });
}

async function updateSubscriptionContinue(siteUrl, subscriptionId, identity) {
    const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity: identity,
            cancel_at_period_end: false
        })
    });
    
    return res;
}

function handleContinueSubscriptionSuccess(el, errorEl, clickHandler) {
    window.location.reload();
}

function handleContinueSubscriptionError(res, el, errorEl, clickHandler) {
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');

    if (errorEl) {
        errorEl.innerText = t('There was an error continuing your subscription, please try again.');
    }
}

function handleContinueSubscriptionClickHandler(el, errorEl, siteUrl, subscriptionId, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    const subscriptionIdValue = el.dataset.membersContinueSubscription;

    if (errorEl) {
        errorEl.innerText = '';
    }

    return fetchSubscriptionIdentity(siteUrl)
        .then(identity => updateSubscriptionContinue(siteUrl, subscriptionIdValue, identity))
        .then(res => {
            if (res.ok) {
                handleContinueSubscriptionSuccess(el, errorEl, clickHandler);
            } else {
                handleContinueSubscriptionError(res, el, errorEl, clickHandler);
            }
        });
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        let errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        let membersSuccess = el.dataset.membersSuccess;
        let membersCancel = el.dataset.membersCancel;
        let successUrl = buildAbsoluteUrl(membersSuccess);
        let cancelUrl = buildAbsoluteUrl(membersCancel);

        function clickHandler(event) {
            handleEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        let membersReturn = el.dataset.membersReturn;
        let returnUrl = buildAbsoluteUrl(membersReturn);

        function clickHandler(event) {
            handleManageBillingClickHandler(el, errorEl, siteUrl, returnUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClickHandler(el, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetention = hasRetentionOffer(offers);

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            const subscriptionId = el.dataset.membersCancelSubscription;
            handleCancelSubscriptionClickHandler(el, errorEl, siteUrl, subscriptionId, hasRetention, doAction, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            const subscriptionId = el.dataset.membersContinueSubscription;
            handleContinueSubscriptionClickHandler(el, errorEl, siteUrl, subscriptionId, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}