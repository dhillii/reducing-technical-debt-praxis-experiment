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

// Extract form input collection logic
function collectFormLabels(form) {
    const labels = [];
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

// Extract newsletter collection logic
function collectFormNewsletters(form) {
    const newsletters = [];
    const newsletterInputs = form.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return {newsletters, newsletterInputs};
}

// Extract request body construction logic
function buildMagicLinkRequestBody(email, emailType, labels, name, autoRedirect, newsletters, newsletterInputs, wantsOTC, urlHistory, form) {
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
    
    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }
    
    return reqBody;
}

// Extract integrity token fetching logic
async function fetchIntegrityToken(siteUrl) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return await integrityTokenRes.text();
}

// Extract magic link sending logic
async function sendMagicLink(siteUrl, reqBody, integrityToken) {
    const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
    return magicLinkRes;
}

// Extract OTC response handling logic
async function extractOTCResponse(magicLinkRes, wantsOTC) {
    if (!wantsOTC) {
        return undefined;
    }
    try {
        return await magicLinkRes.clone().json();
    } catch (e) {
        return undefined;
    }
}

// Extract OTC action invocation logic
function invokeOTCAction(doAction, captureException, email, responseBody) {
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

// Extract success response handling logic
async function handleMagicLinkSuccess(magicLinkRes, form, wantsOTC, doAction, captureException, email, errorEl) {
    form.classList.add('success');
    const responseBody = await extractOTCResponse(magicLinkRes, wantsOTC);
    invokeOTCAction(doAction, captureException, email, responseBody);
}

// Extract error response handling logic
async function handleMagicLinkError(magicLinkRes, form, errorEl) {
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
    
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    
    const labels = collectFormLabels(event.target);
    const {newsletters, newsletterInputs} = collectFormNewsletters(event.target);
    
    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildMagicLinkRequestBody(email, emailType, labels, name, autoRedirect, newsletters, newsletterInputs, wantsOTC, urlHistory, event.target);

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        
        if (magicLinkRes.ok) {
            await handleMagicLinkSuccess(magicLinkRes, form, wantsOTC, doAction, captureException, email, errorEl);
        } else {
            await handleMagicLinkError(magicLinkRes, form, errorEl);
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

// Extract checkout URL construction logic
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

// Extract session fetching logic
function fetchSession(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });
}

// Extract checkout session creation logic
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

// Extract Stripe redirect logic
function redirectToStripeCheckout(responseBody) {
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

// Extract plan click error handling logic
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
    const {checkoutSuccessUrl, checkoutCancelUrl} = buildCheckoutUrls(successUrl, cancelUrl);

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetchSession(siteUrl)
        .then(function (identity) {
            return createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
        })
        .then(function (responseBody) {
            return redirectToStripeCheckout(responseBody);
        })
        .catch(function (err) {
            handlePlanClickError(err, el, errorEl, clickHandler);
        });
}

// Extract billing URL construction logic
function buildBillingUrls(membersSuccess, membersCancel) {
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

// Extract update session creation logic
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

// Extract Stripe update session redirect logic
function redirectToStripeUpdateSession(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

// Extract update session error handling logic
function handleUpdateSessionError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

// Extract billing portal session creation logic
function createBillingPortalSession(siteUrl, identity, returnUrl) {
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

// Extract billing portal error handling logic
function handleBillingPortalError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

// Extract subscription cancellation logic
function cancelSubscription(siteUrl, subscriptionId, identity) {
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
}

// Extract subscription continuation logic
function continueSubscription(siteUrl, subscriptionId, identity) {
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
}

// Setup form submission handlers
function setupFormHandlers(siteUrl, doAction, captureException) {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

// Setup plan click handlers
function setupPlanHandlers(siteUrl, site, member) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

// Setup edit billing handlers
function setupEditBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const {successUrl, cancelUrl} = buildBillingUrls(el.dataset.membersSuccess, el.dataset.membersCancel);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            
            fetchSession(siteUrl)
                .then(function (identity) {
                    return createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl);
                })
                .then(function (result) {
                    return redirectToStripeUpdateSession(result);
                })
                .then(function (result) {
                    if (result.error) {
                        throw new Error(t(result.error.message));
                    }
                })
                .catch(function (err) {
                    handleUpdateSessionError(err, el, errorEl, clickHandler);
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

// Setup manage billing handlers
function setupManageBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            
            fetchSession(siteUrl)
                .then(function (identity) {
                    return createBillingPortalSession(siteUrl, identity, returnUrl);
                })
                .then(function (result) {
                    return window.location.assign(result.url);
                })
                .catch(function (err) {
                    handleBillingPortalError(err, el, errorEl, clickHandler);
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

// Setup signout handlers
function setupSignoutHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, {
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
        el.addEventListener('click', clickHandler);
    });
}

// Setup cancel subscription handlers
function setupCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers) {
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

            return fetchSession(siteUrl)
                .then(function (identity) {
                    return cancelSubscription(siteUrl, subscriptionId, identity);
                })
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
        el.addEventListener('click', clickHandler);
    });
}

// Setup continue subscription handlers
function setupContinueSubscriptionHandlers(siteUrl) {
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

            return fetchSession(siteUrl)
                .then(function (identity) {
                    return continueSubscription(siteUrl, subscriptionId, identity);
                })
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
        el.addEventListener('click', clickHandler);
    });
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    
    setupFormHandlers(siteUrl, doAction, captureException);
    setupPlanHandlers(siteUrl, site, member);
    setupEditBillingHandlers(siteUrl);
    setupManageBillingHandlers(siteUrl);
    setupSignoutHandlers(siteUrl);
    
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');
    setupCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers);
    setupContinueSubscriptionHandlers(siteUrl);
}
```