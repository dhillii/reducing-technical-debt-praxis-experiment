```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ============================================================================
// Utility Functions
// ============================================================================

function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function clearError(errorEl) {
    displayErrorIfElementExists(errorEl, '');
}

function setElementClasses(el, classesToAdd = [], classesToRemove = []) {
    classesToRemove.forEach(cls => el.classList.remove(cls));
    classesToAdd.forEach(cls => el.classList.add(cls));
}

function handleError(error, form, errorEl) {
    setElementClasses(form, ['error']);
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

function getFormInputs(form, selector) {
    return Array.from(form.querySelectorAll(selector));
}

function extractFormData(form, event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm || undefined;
    
    const labels = getFormInputs(event.target, 'input[data-members-label]')
        .map(input => input.value);
    
    const newsletterInputs = getFormInputs(
        event.target,
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    );
    
    const newsletters = newsletterInputs.map(input => ({name: input.value}));
    
    return {
        email,
        name,
        emailType,
        labels,
        newsletters,
        newsletterInputs,
        autoRedirect
    };
}

function buildRequestBody(formData, urlHistory) {
    const {email, emailType, labels, name, autoRedirect, newsletters, newsletterInputs} = formData;
    const wantsOTC = emailType === 'signin' && formData.form?.dataset?.membersOtc === 'true';
    
    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };
    
    if (wantsOTC) {
        reqBody.includeOTC = true;
    }
    
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }
    
    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = Array.from(
            document.querySelectorAll('input[type=checkbox][data-members-newsletter]')
        );
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }
    
    return {reqBody, wantsOTC};
}

async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return res.text();
}

async function sendMagicLink(siteUrl, reqBody, integrityToken) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException) {
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

// ============================================================================
// Form Submission Handler
// ============================================================================

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    clearError(errorEl);
    setElementClasses(form, [], ['success', 'invalid', 'error']);
    
    const formData = extractFormData(form, event);
    formData.form = form;
    
    setElementClasses(form, ['loading']);
    
    try {
        const urlHistory = getUrlHistory();
        const {reqBody, wantsOTC} = buildRequestBody(formData, urlHistory);
        
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);
        
        form.addEventListener('submit', submitHandler);
        setElementClasses(form, [], ['loading']);
        
        if (magicLinkRes.ok) {
            setElementClasses(form, ['success']);
            await handleMagicLinkSuccess(magicLinkRes, wantsOTC, formData.email, doAction, captureException);
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            setElementClasses(form, ['error']);
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

// ============================================================================
// Plan Click Handler
// ============================================================================

function buildCheckoutUrls(successUrl, cancelUrl) {
    let checkoutSuccessUrl;
    let checkoutCancelUrl;
    
    if (successUrl) {
        checkoutSuccessUrl = (new URL(successUrl, window.location.href)).href;
    }
    
    if (cancelUrl) {
        checkoutCancelUrl = (new URL(cancelUrl, window.location.href)).href;
    }
    
    return {checkoutSuccessUrl, checkoutCancelUrl};
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

async function createStripeCheckoutSession(siteUrl, requestData, identity, urls, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl: urls.checkoutSuccessUrl,
            cancelUrl: urls.checkoutCancelUrl,
            metadata
        })
    });
    
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    
    return res.json();
}

async function redirectToCheckout(responseBody) {
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

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const urls = buildCheckoutUrls(el.dataset.membersSuccess, el.dataset.membersCancel);
    
    clearError(errorEl);
    setElementClasses(el, ['loading']);
    
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }
    
    return fetchSessionIdentity(siteUrl)
        .then(identity => createStripeCheckoutSession(siteUrl, requestData, identity, urls, metadata))
        .then(redirectToCheckout)
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setElementClasses(el, ['error'], ['loading']);
            displayErrorIfElementExists(errorEl, err.message);
        });
}

// ============================================================================
// Stripe Session Handlers
// ============================================================================

async function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity,
            successUrl,
            cancelUrl
        })
    });
    
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    
    return res.json();
}

async function createStripeBillingPortalSession(siteUrl, identity, returnUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity,
            returnUrl
        })
    });
    
    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }
    
    return res.json();
}

function handleSessionError(el, errorEl, clickHandler, errorMessage) {
    console.error(errorMessage);
    el.addEventListener('click', clickHandler);
    setElementClasses(el, ['error'], ['loading']);
    displayErrorIfElementExists(errorEl, errorMessage);
}

// ============================================================================
// Edit Billing Handler
// ============================================================================

function createEditBillingClickHandler(el, errorEl, siteUrl, clickHandler) {
    return async function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        
        clearError(errorEl);
        setElementClasses(el, ['loading']);
        
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;
        
        try {
            const identity = await fetchSessionIdentity(siteUrl);
            const result = await createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl);
            
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({
                sessionId: result.sessionId
            });
            
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        } catch (err) {
            handleSessionError(el, errorEl, clickHandler, err.message);
        }
    };
}

// ============================================================================
// Manage Billing Handler
// ============================================================================

function createManageBillingClickHandler(el, errorEl, siteUrl, clickHandler) {
    return async function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        
        clearError(errorEl);
        setElementClasses(el, ['loading']);
        
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;
        
        try {
            const identity = await fetchSessionIdentity(siteUrl);
            const result = await createStripeBillingPortalSession(siteUrl, identity, returnUrl);
            window.location.assign(result.url);
        } catch (err) {
            handleSessionError(el, errorEl, clickHandler, err.message);
        }
    };
}

// ============================================================================
// Signout Handler
// ============================================================================

function createSignoutClickHandler(el, siteUrl, clickHandler) {
    return async function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementClasses(el, ['loading'], ['error']);
        
        try {
            const res = await fetch(`${siteUrl}/members/api/session`, {
                method: 'DELETE'
            });
            
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                throw new Error('Failed to sign out');
            }
        } catch (err) {
            el.addEventListener('click', clickHandler);
            setElementClasses(el, ['error'], ['loading']);
        }
    };
}

// ============================================================================
// Subscription Handlers
// ============================================================================

async function updateSubscription(siteUrl, subscriptionId, body) {
    const identity = await fetchSessionIdentity(siteUrl);
    
    const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity,
            ...body
        })
    });
    
    return res;
}

function createCancelSubscriptionClickHandler(el, errorEl, siteUrl, clickHandler, hasRetentionOffers, doAction) {
    return function(event) {
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
        setElementClasses(el, ['loading'], ['error']);
        clearError(errorEl);
        
        updateSubscription(siteUrl, subscriptionId, {smart_cancel: true})
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    throw new Error(t('There was an error cancelling your subscription, please try again.'));
                }
            })
            .catch(err => {
                el.addEventListener('click', clickHandler);
                setElementClasses(el, ['error'], ['loading']);
                displayErrorIfElementExists(errorEl, err.message);
            });
    };
}

function createContinueSubscriptionClickHandler(el, errorEl, siteUrl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementClasses(el, ['loading'], ['error']);
        clearError(errorEl