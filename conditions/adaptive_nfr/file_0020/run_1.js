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
function getFormEmailInput(form) {
    return form.querySelector('input[data-members-email]');
}

/** @param {HTMLElement} form - The form element */
function getFormNameInput(form) {
    return form.querySelector('input[data-members-name]');
}

/** @param {HTMLElement} form - The form element */
function getFormLabels(form) {
    const labels = [];
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

/** @param {HTMLElement} form - The form element */
function getFormNewsletters(form) {
    const newsletters = [];
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return newsletters;
}

/** @param {HTMLElement} form - The form element */
function hasCheckableNewsletterInputs(form) {
    const checkableInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkableInputs.length > 0;
}

/** @param {string} autoRedirect - The auto redirect value */
function parseAutoRedirect(autoRedirect) {
    return (autoRedirect === 'true');
}

/** @param {Object} responseBody - The response body */
function hasOTCRef(responseBody) {
    return responseBody?.otc_ref;
}

/** @param {Function} doAction - The action function */
function isDoActionFunction(doAction) {
    return typeof doAction === 'function';
}

/** @param {Object} response - The response object */
function isResponseOk(response) {
    return response.ok;
}

/** @param {Object} redirectResult - The redirect result */
function hasRedirectError(redirectResult) {
    return redirectResult.error;
}

/** @param {Object} result - The result object */
function hasStripeError(result) {
    return result.error;
}

function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, newsletterInputs) {
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: parseAutoRedirect(autoRedirect)
    };
    
    if (wantsOTC) {
        reqBody.includeOTC = true;
    }
    
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }
    
    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    }
    
    return reqBody;
}

function handleOTCResponse(responseBody, email, doAction, captureException) {
    const otcRef = responseBody?.otc_ref;
    
    if (!hasOTCRef(responseBody)) {
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

async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, errorEl) {
    let responseBody;
    
    if (wantsOTC) {
        try {
            responseBody = await magicLinkRes.clone().json();
        } catch (e) {
            responseBody = undefined;
        }
    }
    
    handleOTCResponse(responseBody, email, doAction, captureException);
}

async function handleMagicLinkFailure(magicLinkRes, errorEl) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
}

async function sendMagicLink(siteUrl, reqBody, integrityToken) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

async function getIntegrityToken(siteUrl) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return integrityTokenRes.text();
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
    
    const emailInput = getFormEmailInput(form);
    const nameInput = getFormNameInput(form);
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const labels = getFormLabels(form);
    const newsletters = getFormNewsletters(form);
    const wantsOTC = isSigninWithOTC(emailType, form);
    
    form.classList.add('loading');
    
    const urlHistory = getUrlHistory();
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    const reqBody = buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, newsletterInputs);
    
    if (newsletterInputs.length === 0 && hasCheckableNewsletterInputs(form)) {
        reqBody.newsletters = [];
    }

    try {
        const integrityToken = await getIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        
        if (isResponseOk(magicLinkRes)) {
            form.classList.add('success');
            await handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, errorEl);
        } else {
            await handleMagicLinkFailure(magicLinkRes, errorEl);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

function handleCheckoutSessionResponse(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return Promise.resolve();
    }
    
    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    }).then(function (redirectResult) {
        if (hasRedirectError(redirectResult)) {
            throw new Error(redirectResult.error.message);
        }
    });
}

function handleCheckoutError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    
    el.classList.add('error');
}

function buildCheckoutRequestBody(requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    return {
        ...requestData,
        identity: identity,
        successUrl: checkoutSuccessUrl,
        cancelUrl: checkoutCancelUrl,
        metadata
    };
}

function getSessionIdentity(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!isResponseOk(res)) {
            return null;
        }
        return res.text();
    });
}

function createCheckoutSession(siteUrl, requestBody) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    }).then(function (res) {
        if (!isResponseOk(res)) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    
    let checkoutSuccessUrl;
    if (successUrl) {
        checkoutSuccessUrl = (new URL(successUrl, window.location.href)).href;
    }

    let checkoutCancelUrl;
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

    return getSessionIdentity(siteUrl).then(function (identity) {
        const requestBody = buildCheckoutRequestBody(requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
        return createCheckoutSession(siteUrl, requestBody);
    }).then(function (responseBody) {
        return handleCheckoutSessionResponse(responseBody);
    }).catch(function (err) {
        handleCheckoutError(err, el, errorEl, clickHandler);
    });
}

function buildUpdateSessionRequestBody(identity, successUrl, cancelUrl) {
    return {
        identity: identity,
        successUrl: successUrl,
        cancelUrl: cancelUrl
    };
}

function createUpdateSession(siteUrl, requestBody) {
    return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    }).then(function (res) {
        if (!isResponseOk(res)) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

function handleUpdateSessionResult(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    }).then(function (result) {
        if (hasStripeError(result)) {
            throw new Error(t(result.error.message));
        }
    });
}

function handleUpdateSessionError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    
    el.classList.add('error');
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

function createBillingPortalSession(siteUrl, requestBody) {
    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    }).then(function (res) {
        if (!isResponseOk(res)) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }
        return res.json();
    });
}

function handleSignoutResponse(res, el, clickHandler) {
    if (isResponseOk(res)) {
        window.location.replace(siteUrl);
        return;
    }
    
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');
}

function handleCancelSubscriptionWithRetention(subscriptionId, doAction) {
    doAction('openPopup', {
        page: 'accountPlan',
        pageData: {
            subscriptionId,
            action: 'cancel'
        }
    });
}

function handleCancelSubscriptionError(res, el, errorEl, clickHandler) {
    if (isResponseOk(res)) {
        window.location.reload();
        return;
    }
    
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');

    if (errorEl) {
        errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
    }
}

function handleContinueSubscriptionError(res, el, errorEl, clickHandler) {
    if (isResponseOk(res)) {
        window.location.reload();
        return;
    }
    
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');

    if (errorEl) {
        errorEl.innerText = t('There was an error continuing your subscription, please try again.');
    }
}

function buildCancelSubscriptionBody(identity) {
    return {
        identity: identity,
        smart_cancel: true
    };
}

function buildContinueSubscriptionBody(identity) {
    return {
        identity: identity,
        cancel_at_period_end: false
    };
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        
        let successUrl;
        if (membersSuccess) {
            successUrl = (new URL(membersSuccess, window.location.href)).href;
        }

        let cancelUrl;
        if (membersCancel) {
            cancelUrl = (new URL(membersCancel, window.location.href)).href;
        }

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            
            el.classList.add('loading');
            
            getSessionIdentity(siteUrl).then(function (identity) {
                const requestBody = buildUpdateSessionRequestBody(identity, successUrl, cancelUrl);
                return createUpdateSession(siteUrl, requestBody);
            }).then(function (result) {
                return handleUpdateSessionResult(result);
            }).catch(function (err) {
                handleUpdateSessionError(err, el, errorEl, clickHandler);
            });
        }
        
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        
        let returnUrl;
        if (membersReturn) {
            returnUrl = (new URL(membersReturn, window.location.href)).href;
        }

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            
            el.classList.add('loading');
            
            getSessionIdentity(siteUrl).then(function (identity) {
                return createBillingPortalSession(siteUrl, {
                    identity: identity,
                    returnUrl
                });
            }).then(function (result) {
                return window.location.assign(result.url);
            }).catch(function (err) {
                handleBillingPortalError(err, el, errorEl, clickHandler);
            });
        }
        
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            
            fetch(`${siteUrl}/members/api/session`, {
                method: 'DELETE'
            }).then(function (res) {
                handleSignoutResponse(res, el, clickHandler);
            });
        }
        
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        
        function clickHandler(event) {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                handleCancelSubscriptionWithRetention(subscriptionId, doAction);
                return;
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            getSessionIdentity(siteUrl).then(function (identity) {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(buildCancelSubscriptionBody(identity))
                });
            }).then(function (res) {
                handleCancelSubscriptionError(res, el, errorEl, clickHandler);
            });
        }
        
        el.addEventListener('click', clickHandler);
    });

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

            getSessionIdentity(siteUrl).then(function (identity) {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(buildContinueSubscriptionBody(identity))
                });
            }).then(function (res) {
                handleContinueSubscriptionError(res, el, errorEl, clickHandler);
            });
        }
        
        el.addEventListener('click', clickHandler);
    });
}