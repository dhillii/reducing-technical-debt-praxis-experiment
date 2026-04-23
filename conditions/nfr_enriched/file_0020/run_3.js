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

function extractFormInputs(form) {
    const emailInput = form.querySelector('input[data-members-email]');
    const nameInput = form.querySelector('input[data-members-name]');
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    
    const labels = Array.from(labelInputs).map(input => input.value);
    const newsletters = Array.from(newsletterInputs).map(input => ({name: input.value}));
    
    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels,
        newsletters,
        newsletterInputs
    };
}

function buildRequestBody(inputs, form, emailType, wantsOTC) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const urlHistory = getUrlHistory();
    const reqBody = {
        email: inputs.email,
        emailType: emailType,
        labels: inputs.labels,
        name: inputs.name,
        autoRedirect: (autoRedirect === 'true')
    };
    
    if (wantsOTC) {
        reqBody.includeOTC = true;
    }
    
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }
    
    if (inputs.newsletterInputs.length > 0) {
        reqBody.newsletters = inputs.newsletters;
    } else {
        const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }
    
    return reqBody;
}

async function fetchIntegrityToken(siteUrl) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return integrityTokenRes.text();
}

async function sendMagicLink(siteUrl, reqBody, integrityToken) {
    const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
    return magicLinkRes;
}

function handleOTCResponse(responseBody, email, doAction, captureException) {
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

async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, errorEl) {
    if (magicLinkRes.ok) {
        let responseBody;
        if (wantsOTC) {
            try {
                responseBody = await magicLinkRes.clone().json();
            } catch (e) {
                responseBody = undefined;
            }
        }
        handleOTCResponse(responseBody, email, doAction, captureException);
        return true;
    } else {
        const e = await HumanReadableError.fromApiResponse(magicLinkRes);
        const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
        displayErrorIfElementExists(errorEl, errorMessage);
        return false;
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
    
    const inputs = extractFormInputs(event.target);
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const reqBody = buildRequestBody(inputs, form, emailType, wantsOTC);
    
    form.classList.add('loading');
    
    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);
        
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        
        const success = await handleMagicLinkSuccess(magicLinkRes, wantsOTC, inputs.email, doAction, captureException, errorEl);
        if (success) {
            form.classList.add('success');
        } else {
            form.classList.add('error');
        }
    } catch (err) {
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        handleError(err, form, errorEl);
    }
}

function buildCheckoutMetadata(member, urlHistory) {
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }
    return metadata;
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

function handleCheckoutRedirect(responseBody) {
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

function handlePlanClickError(err, el, clickHandler, errorEl) {
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
    const urlHistory = getUrlHistory();
    const metadata = buildCheckoutMetadata(member, urlHistory);
    
    return fetchSessionIdentity(siteUrl)
        .then(identity => createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata))
        .then(responseBody => handleCheckoutRedirect(responseBody))
        .catch(err => handlePlanClickError(err, el, clickHandler, errorEl));
}

function buildUrlFromDataset(datasetUrl) {
    if (datasetUrl) {
        return (new URL(datasetUrl, window.location.href)).href;
    }
    return undefined;
}

async function handleEditBillingClick(siteUrl, successUrl, cancelUrl, el, errorEl) {
    const identity = await fetchSessionIdentity(siteUrl);
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
    
    const result = await res.json();
    const stripe = window.Stripe(result.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
    
    if (redirectResult.error) {
        throw new Error(t(redirectResult.error.message));
    }
}

function handleEditBillingError(err, el, clickHandler, errorEl) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

async function handleManageBillingClick(siteUrl, returnUrl, el, errorEl) {
    const identity = await fetchSessionIdentity(siteUrl);
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
    
    const result = await res.json();
    return window.location.assign(result.url);
}

function handleManageBillingError(err, el, clickHandler, errorEl) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

async function handleSignoutClick(siteUrl, el, clickHandler) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        method: 'DELETE'
    });
    
    if (res.ok) {
        window.location.replace(siteUrl);
    } else {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

async function handleCancelSubscriptionClick(siteUrl, subscriptionId, el, clickHandler, errorEl) {
    const identity = await fetchSessionIdentity(siteUrl);
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
}

async function handleContinueSubscriptionClick(siteUrl, subscriptionId, el, clickHandler, errorEl) {
    const identity = await fetchSessionIdentity(siteUrl);
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
}

function attachFormSubmitHandlers(siteUrl, doAction, captureException) {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

function attachPlanClickHandlers(siteUrl, site, member) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

function attachEditBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = buildUrlFromDataset(el.dataset.membersSuccess);
        const cancelUrl = buildUrlFromDataset(el.dataset.membersCancel);
        
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            
            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            
            handleEditBillingClick(siteUrl, successUrl, cancelUrl, el, errorEl)
                .catch(err => handleEditBillingError(err, el, clickHandler, errorEl));
        }
        el.addEventListener('click', clickHandler);
    });
}

function attachManageBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = buildUrlFromDataset(el.dataset.membersReturn);
        
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            
            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            
            handleManageBillingClick(siteUrl, returnUrl, el, errorEl)
                .catch(err => handleManageBillingError(err, el, clickHandler, errorEl));
        }
        el.addEventListener('click', clickHandler);
    });
}

function attachSignoutHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            
            handleSignoutClick(siteUrl, el, clickHandler)
                .catch(() => {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

function attachCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        
        function clickHandler(event) {
            event.preventDefault();
            
            const subscriptionId = el.dataset.membersCancelSubscription;
            
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
            
            handleCancelSubscriptionClick(siteUrl, subscriptionId, el, clickHandler, errorEl)
                .catch(() => {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

function attachContinueSubscriptionHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            
            const subscriptionId = el.dataset.membersContinueSubscription;
            
            if (errorEl) {
                errorEl.innerText = '';
            }
            
            handleContinueSubscriptionClick(siteUrl, subscriptionId, el, clickHandler, errorEl)
                .catch(() => {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }
    
    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');
    
    attachFormSubmitHandlers(siteUrl, doAction, captureException);
    attachPlanClickHandlers(siteUrl, site, member);
    attachEditBillingHandlers(siteUrl);
    attachManageBillingHandlers(siteUrl);
    attachSignoutHandlers(siteUrl);
    attachCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers);
    attachContinueSubscriptionHandlers(siteUrl);
}