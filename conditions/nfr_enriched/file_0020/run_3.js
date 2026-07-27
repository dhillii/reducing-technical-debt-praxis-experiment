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

// Extracts form input values and configuration
function extractFormData(event, form) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm || undefined;
    
    return {email, name, emailType, autoRedirect};
}

// Collects label values from form inputs
function collectLabels(event) {
    const labels = [];
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

// Collects newsletter selections from form inputs
function collectNewsletters(event) {
    const newsletters = [];
    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return {newsletters, newsletterInputs};
}

// Builds request body for magic link API
function buildMagicLinkRequestBody(formData, labels, newsletters, newsletterInputs, event) {
    const reqBody = {
        email: formData.email,
        emailType: formData.emailType,
        labels: labels,
        name: formData.name,
        autoRedirect: (formData.autoRedirect === 'true')
    };
    
    const wantsOTC = formData.emailType === 'signin' && event.target.closest('form')?.dataset?.membersOtc === 'true';
    
    if (wantsOTC) {
        reqBody.includeOTC = true;
    }
    
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }
    
    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }
    
    return {reqBody, wantsOTC};
}

// Fetches integrity token for form submission
async function fetchIntegrityToken(siteUrl) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return integrityTokenRes.text();
}

// Sends magic link request to API
async function sendMagicLinkRequest(siteUrl, reqBody, integrityToken) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

// Handles successful magic link response
async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, form) {
    form.classList.add('success');
    
    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await magicLinkRes.clone().json();
        } catch (e) {
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

// Handles magic link response errors
async function handleMagicLinkError(magicLinkRes, errorEl, form) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
    form.classList.add('error');
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
    
    const formData = extractFormData(event, form);
    const labels = collectLabels(event);
    const {newsletters, newsletterInputs} = collectNewsletters(event);
    const {reqBody, wantsOTC} = buildMagicLinkRequestBody(formData, labels, newsletters, newsletterInputs, event);
    
    form.classList.add('loading');
    
    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLinkRequest(siteUrl, reqBody, integrityToken);
        
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        
        if (magicLinkRes.ok) {
            await handleMagicLinkSuccess(magicLinkRes, wantsOTC, formData.email, doAction, captureException, form);
        } else {
            await handleMagicLinkError(magicLinkRes, errorEl, form);
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

// Fetches session identity for authenticated requests
async function fetchSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    if (!res.ok) {
        return null;
    }
    return res.text();
}

// Creates Stripe checkout session
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
    return res.json();
}

// Handles Stripe redirect or checkout
async function handleStripeCheckout(responseBody) {
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

// Handles plan click errors
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
        .then(responseBody => handleStripeCheckout(responseBody))
        .catch(err => handlePlanClickError(err, el, errorEl, clickHandler));
}

// Normalizes URL with proper base
function normalizeUrl(urlString, baseUrl) {
    if (!urlString) {
        return undefined;
    }
    return (new URL(urlString, baseUrl)).href;
}

// Handles edit billing click errors
function handleEditBillingError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

// Creates Stripe update session
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
    return res.json();
}

// Handles Stripe update session checkout
async function handleStripeUpdateCheckout(result) {
    const stripe = window.Stripe(result.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
    if (redirectResult.error) {
        throw new Error(t(redirectResult.error.message));
    }
}

// Handles manage billing click errors
function handleManageBillingError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

// Creates Stripe billing portal session
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
    return res.json();
}

// Handles signout click
function handleSignoutClick(event, el, siteUrl, clickHandler) {
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

// Updates subscription status
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

// Handles cancel subscription click
function handleCancelSubscriptionClick(event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler) {
    event.preventDefault();
    
    if (hasRetentionOffers) {
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
    
    return updateSubscriptionStatus(siteUrl, subscriptionId, {smart_cancel: true})
        .then(function (res) {
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                
                if (errorEl) {
                    errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
                }
            }
        });
}

// Handles continue subscription click
function handleContinueSubscriptionClick(event, el, errorEl, siteUrl, subscriptionId, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');
    
    if (errorEl) {
        errorEl.innerText = '';
    }
    
    return updateSubscriptionStatus(siteUrl, subscriptionId, {cancel_at_period_end: false})
        .then(function (res) {
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                
                if (errorEl) {
                    errorEl.innerText = t('There was an error continuing your subscription, please try again.');
                }
            }
        });
}

// Attaches form submit handlers
function attachFormHandlers(siteUrl, doAction, captureException) {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

// Attaches plan click handlers
function attachPlanHandlers(siteUrl, site, member) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

// Attaches edit billing handlers
function attachEditBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = normalizeUrl(membersSuccess, window.location.href);
        const cancelUrl = normalizeUrl(membersCancel, window.location.href);
        
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            
            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            
            fetchSessionIdentity(siteUrl)
                .then(identity => createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl))
                .then(result => handleStripeUpdateCheckout(result))
                .catch(err => handleEditBillingError(err, el, errorEl, clickHandler));
        }
        el.addEventListener('click', clickHandler);
    });
}

// Attaches manage billing handlers
function attachManageBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = normalizeUrl(membersReturn, window.location.href);
        
        function clickHandler(event) {
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
        }
        el.addEventListener('click', clickHandler);
    });
}

// Attaches signout handlers
function attachSignoutHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick(event, el, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

// Attaches cancel subscription handlers
function attachCancelSubscriptionHandlers(siteUrl, offers, doAction) {
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');
    
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            const subscriptionId = el.dataset.membersCancelSubscription;
            handleCancelSubscriptionClick(event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

// Attaches continue subscription handlers
function attachContinueSubscriptionHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            const subscriptionId = el.dataset.membersContinueSubscription;
            handleContinueSubscriptionClick(event, el, errorEl, siteUrl, subscriptionId, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }
    
    siteUrl = siteUrl.replace(/\/$/, '');
    
    attachFormHandlers(siteUrl, doAction, captureException);
    attachPlanHandlers(siteUrl, site, member);
    attachEditBillingHandlers(siteUrl);
    attachManageBillingHandlers(siteUrl);
    attachSignoutHandlers(siteUrl);
    attachCancelSubscriptionHandlers(siteUrl, offers, doAction);
    attachContinueSubscriptionHandlers(siteUrl);
}