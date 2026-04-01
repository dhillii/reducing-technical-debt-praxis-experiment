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

/** @returns {string|undefined} */
function extractName(nameInput) {
    return (nameInput?.value || '').trim() || undefined;
}

/** @returns {boolean} */
function shouldAutoRedirect(form) {
    return (form?.dataset?.membersAutoredirect || 'true') === 'true';
}

/** @returns {Object} */
function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, hasNewsletterInputs) {
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: autoRedirect
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (hasNewsletterInputs) {
        reqBody.newsletters = newsletters;
    } else if (hasCheckableNewsletterInputs({target: {querySelectorAll: () => []}})) {
        reqBody.newsletters = [];
    }

    return reqBody;
}

/** @returns {boolean} */
function hasOtcRef(responseBody) {
    return responseBody?.otc_ref !== undefined;
}

/** @returns {boolean} */
function isDoActionFunction(doAction) {
    return typeof doAction === 'function';
}

async function handleOTCResponse(magicLinkRes, wantsOTC) {
    if (!wantsOTC) {
        return undefined;
    }

    try {
        return await magicLinkRes.clone().json();
    } catch (e) {
        return undefined;
    }
}

function handleOTCAction(responseBody, email, doAction, captureException) {
    const otcRef = responseBody?.otc_ref;
    
    if (!hasOtcRef(responseBody)) {
        return;
    }

    if (!isDoActionFunction(doAction)) {
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

async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, form) {
    form.classList.add('success');
    const responseBody = await handleOTCResponse(magicLinkRes, wantsOTC);
    handleOTCAction(responseBody, email, doAction, captureException);
}

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
    const email = emailInput?.value;
    const name = extractName(nameInput);
    const emailType = extractEmailType(form);
    const autoRedirect = shouldAutoRedirect(form);
    const labels = extractLabels(event);
    const newsletters = extractNewsletters(event);
    const wantsOTC = isSigninWithOTC(emailType, form);
    
    form.classList.add('loading');
    
    const urlHistory = getUrlHistory();
    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    const hasNewsletterInputsFlag = hasNewsletterInputs(newsletterInputs);
    
    const reqBody = buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, hasNewsletterInputsFlag);

    if (!hasNewsletterInputsFlag && hasCheckableNewsletterInputs(event)) {
        reqBody.newsletters = [];
    }

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
            await handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, form);
        } else {
            await handleMagicLinkFailure(magicLinkRes, errorEl);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @returns {string|undefined} */
function buildCheckoutSuccessUrl(successUrl) {
    if (!successUrl) {
        return undefined;
    }
    return (new URL(successUrl, window.location.href)).href;
}

/** @returns {string|undefined} */
function buildCheckoutCancelUrl(cancelUrl) {
    if (!cancelUrl) {
        return undefined;
    }
    return (new URL(cancelUrl, window.location.href)).href;
}

/** @returns {Object} */
function buildCheckoutMetadata(member, urlHistory) {
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }
    return metadata;
}

/** @returns {Promise<string|null>} */
function fetchSessionIdentity(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });
}

/** @returns {Promise<Object>} */
function createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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
    }).then(function (res) {
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

/** @returns {Promise<void>} */
function handleCheckoutResponse(responseBody) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }
    
    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    }).then(function (redirectResult) {
        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
        }
    });
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
    const checkoutSuccessUrl = buildCheckoutSuccessUrl(successUrl);
    const checkoutCancelUrl = buildCheckoutCancelUrl(cancelUrl);

    if (errorEl) {
        errorEl.innerText = '';
    }
    
    el.classList.add('loading');
    
    const urlHistory = getUrlHistory();
    const metadata = buildCheckoutMetadata(member, urlHistory);

    return fetchSessionIdentity(siteUrl)
        .then(function (identity) {
            return createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
        })
        .then(function (responseBody) {
            return handleCheckoutResponse(responseBody);
        })
        .catch(function (err) {
            handlePlanClickError(err, el, errorEl, clickHandler);
        });
}

/** @returns {string|undefined} */
function buildBillingUrl(urlString) {
    if (!urlString) {
        return undefined;
    }
    return (new URL(urlString, window.location.href)).href;
}

/** @returns {Promise<Object>} */
function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
    return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity: identity,
            successUrl: successUrl,
            cancelUrl: cancelUrl
        })
    }).then(function (res) {
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

/** @returns {Promise<void>} */
function handleUpdateCheckoutResponse(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

function handleBillingError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

function handleEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        
        el.classList.add('loading');
        
        return fetchSessionIdentity(siteUrl)
            .then(function (identity) {
                return createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl);
            })
            .then(function (result) {
                return handleUpdateCheckoutResponse(result);
            })
            .then(function (result) {
                if (result.error) {
                    throw new Error(t(result.error.message));
                }
            })
            .catch(function (err) {
                handleBillingError(err, el, errorEl, clickHandler);
            });
    };
}

/** @returns {Promise<Object>} */
function createStripeBillingPortalSession(siteUrl, identity, returnUrl) {
    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity: identity,
            returnUrl
        })
    }).then(function (res) {
        if (!res.ok) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }
        return res.json();
    });
}

function handleManageBillingClickHandler(el, errorEl, siteUrl, returnUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        
        el.classList.add('loading');
        
        return fetchSessionIdentity(siteUrl)
            .then(function (identity) {
                return createStripeBillingPortalSession(siteUrl, identity, returnUrl);
            })
            .then(function (result) {
                return window.location.assign(result.url);
            })
            .catch(function (err) {
                handleBillingError(err, el, errorEl, clickHandler);
            });
    };
}

function handleSignoutClickHandler(el, siteUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');
        
        return fetch(`${siteUrl}/members/api/session`, {