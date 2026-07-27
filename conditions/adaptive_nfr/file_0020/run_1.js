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
function extractFormConfig(form) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm || undefined;
    return {autoRedirect, emailType};
}

/** @param {NodeList} labelInputs - Label input elements */
function extractLabels(labelInputs) {
    const labels = [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

/** @param {NodeList} newsletterInputs - Newsletter input elements */
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

/** @param {Object} params - Request body parameters */
function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, shouldSetEmpty) {
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
    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else if (shouldSetEmpty) {
        reqBody.newsletters = [];
    }
    
    return reqBody;
}

/** @param {Object} responseBody - Response body from magic link */
function hasOTCRef(responseBody) {
    return responseBody?.otc_ref;
}

/** @param {Object} params - Handler parameters */
async function handleOTCAction(doAction, captureException, email, responseBody) {
    if (!hasOTCRef(responseBody) || typeof doAction !== 'function') {
        return;
    }
    
    try {
        doAction('startSigninOTCFromCustomForm', {
            email: (email || '').trim(),
            otcRef: responseBody.otc_ref,
            inboxLinks: responseBody?.inboxLinks
        });
    } catch (e) {
        console.error(e);
        captureException?.(e);
    }
}

/** @param {Response} magicLinkRes - Response from magic link endpoint */
async function handleMagicLinkSuccess(magicLinkRes, form, wantsOTC, doAction, captureException, email) {
    form.classList.add('success');
    
    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await magicLinkRes.clone().json();
        } catch (e) {
            responseBody = undefined;
        }
    }
    
    await handleOTCAction(doAction, captureException, email, responseBody);
}

/** @param {Response} magicLinkRes - Response from magic link endpoint */
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
    
    const {emailInput, nameInput, labelInputs, newsletterInputs} = extractFormInputs(form);
    const {autoRedirect, emailType} = extractFormConfig(form);
    
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
        
        if (magicLinkRes.ok) {
            await handleMagicLinkSuccess(magicLinkRes, form, wantsOTC, doAction, captureException, email);
        } else {
            await handleMagicLinkFailure(magicLinkRes, errorEl);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @param {Response} res - Fetch response */
function isResponseOk(res) {
    return res.ok;
}

/** @param {Response} res - Fetch response */
async function extractResponseText(res) {
    if (!isResponseOk(res)) {
        return null;
    }
    return res.text();
}

/** @param {Object} responseBody - Response body from checkout session */
function hasCheckoutUrl(responseBody) {
    return responseBody.url;
}

/** @param {Object} responseBody - Response body from checkout session */
function hasSessionId(responseBody) {
    return responseBody.sessionId;
}

/** @param {Object} redirectResult - Result from Stripe redirect */
function hasRedirectError(redirectResult) {
    return redirectResult.error;
}

/** @param {Object} params - Checkout parameters */
async function handleCheckoutUrl(responseBody) {
    return window.location.assign(responseBody.url);
}

/** @param {Object} params - Checkout parameters */
async function handleStripeCheckout(responseBody) {
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });
    
    if (hasRedirectError(redirectResult)) {
        throw new Error(redirectResult.error.message);
    }
}

/** @param {Object} params - Handler parameters */
function handleCheckoutError(err, el, errorEl, clickHandler) {
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

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(extractResponseText)
    .then(function (identity) {
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
            if (!isResponseOk(res)) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        });
    }).then(function (responseBody) {
        if (hasCheckoutUrl(responseBody)) {
            return handleCheckoutUrl(responseBody);
        }
        return handleStripeCheckout(responseBody);
    }).catch(function (err) {
        handleCheckoutError(err, el, errorEl, clickHandler);
    });
}

/** @param {string} urlString - URL string to convert */
function buildAbsoluteUrl(urlString) {
    if (!urlString) {
        return undefined;
    }
    return (new URL(urlString, window.location.href)).href;
}

/** @param {HTMLElement} el - Element to clear error */
function clearElementError(el) {
    if (el) {
        el.innerText = '';
    }
}

/** @param {Response} res - Fetch response */
async function handleSessionResponse(res) {
    if (!isResponseOk(res)) {
        return null;
    }
    return res.text();
}

/** @param {Response} res - Fetch response */
function validateCheckoutSessionResponse(res) {
    if (!isResponseOk(res)) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/** @param {Response} res - Fetch response */
function validateBillingPortalResponse(res) {
    if (!isResponseOk(res)) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }
    return res.json();
}

/** @param {Object} result - Stripe result */
function handleBillingPortalRedirect(result) {
    return window.location.assign(result.url);
}

/** @param {Object} result - Stripe result */
function handleStripeRedirectError(result) {
    if (result.error) {
        throw new Error(t(result.error.message));
    }
}

/** @param {HTMLElement} el - Element to handle error */
function handleBillingError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

/** @param {HTMLElement} el - Element to handle error */
function handleSignoutError(el) {
    el.addEventListener('click', el._clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');
}

/** @param {boolean} hasRetentionOffers - Whether retention offers exist */
function shouldOpenRetentionPortal(hasRetentionOffers) {
    return hasRetentionOffers;
}

/** @param {Object} params - Cancellation parameters */
function handleRetentionOfferAction(doAction, subscriptionId) {
    doAction('openPopup', {
        page: 'accountPlan',
        pageData: {
            subscriptionId,
            action: 'cancel'
        }
    });
}

/** @param {Response} res - Fetch response */
async function handleCancelSubscriptionResponse(res, el, errorEl, clickHandler) {
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

/** @param {Response} res - Fetch response */
async function handleContinueSubscriptionResponse(res, el, errorEl, clickHandler) {
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
        let successUrl = buildAbsoluteUrl(el.dataset.membersSuccess);
        let cancelUrl = buildAbsoluteUrl(el.dataset.membersCancel);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            clearElementError(errorEl);
            el.classList.add('loading');
            
            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(handleSessionResponse)
            .then(function (identity) {
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
                }).then(validateCheckoutSessionResponse);
            }).then(function (result) {
                let stripe = window.Stripe(result.publicKey);
                return stripe.redirectToCheckout({
                    sessionId: result.sessionId
                });
            }).then(handleStripeRedirectError)
            .catch(function (err) {
                handleBillingError(err, el, errorEl, clickHandler);
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        let returnUrl = buildAbsoluteUrl(el.dataset.membersReturn);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            clearElementError(errorEl);
            el.classList.add('loading');
            
            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(handleSessionResponse)
            .then(function (identity) {
                return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        identity: identity,
                        returnUrl
                    })
                }).then(validateBillingPortalResponse);
            }).then(handleBillingPortalRedirect)
            .catch(function (err) {
                handleBillingError(err, el, errorEl, clickHandler);
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
                if (isResponseOk(res)) {
                    window.location.replace(siteUrl);
                } else {
                    handleSignoutError(el);
                }
            });
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            event.preventDefault();

            let subscriptionId = el.dataset.membersCancelSubscription;

            if (shouldOpenRetentionPortal(hasRetentionOffers)) {
                handleRetentionOfferAction(doAction, subscriptionId);
                return;
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            clearElementError(errorEl);

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(handleSessionResponse)
            .then(function (identity) {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        identity: identity,
                        smart_cancel: true
                    })
                });
            }).then(function (res) {
                return handleCancelSubscriptionResponse(res, el, errorEl, clickHandler);
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            let subscriptionId = el.dataset.membersContinueSubscription;

            clearElementError(errorEl);

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(handleSessionResponse)
            .then(function (identity) {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        identity: identity,
                        cancel_at_period_end: false
                    })
                });
            }).then(function (res) {
                return handleContinueSubscriptionResponse(res, el, errorEl, clickHandler);
            });
        }
        el.addEventListener('click', clickHandler);
    });
}