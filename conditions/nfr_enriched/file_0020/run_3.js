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

// Extract label inputs from form
function extractLabels(form) {
    const labels = [];
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

// Extract newsletter inputs from form
function extractNewsletters(form) {
    const newsletters = [];
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return {newsletters, newsletterInputs};
}

// Build request body for magic link submission
function buildMagicLinkRequestBody(email, emailType, labels, name, autoRedirect, newsletters, newsletterInputs, form, urlHistory) {
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: (autoRedirect === 'true')
    };

    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return {reqBody, wantsOTC};
}

// Fetch integrity token
async function fetchIntegrityToken(siteUrl) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return await integrityTokenRes.text();
}

// Send magic link request
async function sendMagicLinkRequest(siteUrl, reqBody, integrityToken) {
    return await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

// Handle successful magic link response
function handleMagicLinkSuccess(form, magicLinkRes, wantsOTC, responseBody, email, doAction, captureException) {
    form.classList.add('success');

    if (!wantsOTC || !responseBody) {
        return;
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

// Parse magic link response body
async function parseMagicLinkResponseBody(magicLinkRes, wantsOTC) {
    if (!wantsOTC) {
        return undefined;
    }

    try {
        return await magicLinkRes.clone().json();
    } catch (e) {
        return undefined;
    }
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
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm || undefined;
    const labels = extractLabels(event.target);
    const {newsletters, newsletterInputs} = extractNewsletters(event.target);

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const {reqBody, wantsOTC} = buildMagicLinkRequestBody(email, emailType, labels, name, autoRedirect, newsletters, newsletterInputs, form, urlHistory);

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLinkRequest(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            const responseBody = await parseMagicLinkResponseBody(magicLinkRes, wantsOTC);
            handleMagicLinkSuccess(form, magicLinkRes, wantsOTC, responseBody, email, doAction, captureException);
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

// Fetch session identity
async function fetchSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    if (!res.ok) {
        return null;
    }
    return await res.text();
}

// Create stripe checkout session
async function createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
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
    return await res.json();
}

// Handle stripe redirect
async function handleStripeRedirect(responseBody) {
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

// Handle plan click error
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

    let checkoutSuccessUrl;
    let checkoutCancelUrl;

    if (successUrl) {
        checkoutSuccessUrl = (new URL(successUrl, window.location.href)).href;
    }

    if (cancelUrl) {
        checkoutCancelUrl = (new URL(cancelUrl, window.location.href)).href;
    }

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
        .then(identity => createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata))
        .then(responseBody => handleStripeRedirect(responseBody))
        .catch(err => handlePlanClickError(err, el, errorEl, clickHandler));
}

// Build URLs from dataset attributes
function buildUrlsFromDataset(membersSuccess, membersCancel) {
    let successUrl;
    let cancelUrl;

    if (membersSuccess) {
        successUrl = (new URL(membersSuccess, window.location.href)).href;
    }

    if (membersCancel) {
        cancelUrl = (new URL(membersCancel, window.location.href)).href;
    }

    return {successUrl, cancelUrl};
}

// Create stripe update session
async function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
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
    return await res.json();
}

// Handle stripe update redirect
async function handleStripeUpdateRedirect(result) {
    const stripe = window.Stripe(result.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
    if (redirectResult.error) {
        throw new Error(t(redirectResult.error.message));
    }
}

// Handle edit billing error
function handleEditBillingError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

// Handle edit billing click
function createEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        el.classList.add('loading');

        fetchSessionIdentity(siteUrl)
            .then(identity => createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl))
            .then(result => handleStripeUpdateRedirect(result))
            .catch(err => handleEditBillingError(err, el, errorEl, clickHandler));
    };
}

// Create stripe billing portal session
async function createStripeBillingPortalSession(siteUrl, identity, returnUrl) {
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
    return await res.json();
}

// Handle manage billing error
function handleManageBillingError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

// Create manage billing click handler
function createManageBillingClickHandler(el, errorEl, siteUrl, returnUrl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        el.classList.add('loading');

        fetchSessionIdentity(siteUrl)
            .then(identity => createStripeBillingPortalSession(siteUrl, identity, returnUrl))
            .then(result => window.location.assign(result.url))
            .catch(err => handleManageBillingError(err, el, errorEl, clickHandler));
    };
}

// Create signout click handler
function createSignoutClickHandler(el, siteUrl) {
    return function(event) {
        el.removeEventListener('click', arguments.callee);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        fetch(`${siteUrl}/members/api/session`, {
            method: 'DELETE'
        }).then(function (res) {
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.addEventListener('click', arguments.callee);
                el.classList.remove('loading');
                el.classList.add('error');
            }
        });
    };
}

// Handle cancel subscription with retention offer
function handleCancelSubscriptionWithRetention(el, subscriptionId, doAction) {
    doAction('openPopup', {
        page: 'accountPlan',
        pageData: {
            subscriptionId,
            action: 'cancel'
        }
    });
}

// Update subscription status
async function updateSubscriptionStatus(siteUrl, subscriptionId, updateData) {
    const identity = await fetchSessionIdentity(siteUrl);
    const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity: identity,
            ...updateData
        })
    });
    return res;
}

// Handle cancel subscription error
function handleCancelSubscriptionError(err, el, errorEl, clickHandler) {
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');
    if (errorEl) {
        errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
    }
}

// Create cancel subscription click handler
function createCancelSubscriptionClickHandler(el, errorEl, siteUrl, hasRetentionOffers, doAction, clickHandler) {
    return function(event) {
        event.preventDefault();