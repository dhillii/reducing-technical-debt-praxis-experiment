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

/** @returns {Object|undefined} */
async function parseOTCResponse(magicLinkRes, wantsOTC) {
    if (!wantsOTC) {
        return undefined;
    }
    
    try {
        return await magicLinkRes.clone().json();
    } catch (e) {
        return undefined;
    }
}

/** @returns {boolean} */
function hasOTCRef(responseBody) {
    return responseBody?.otc_ref !== undefined;
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
async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, form, doAction, email, captureException) {
    form.classList.add('success');
    const responseBody = await parseOTCResponse(magicLinkRes, wantsOTC);
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
        
        if (magicLinkRes.ok) {
            await handleMagicLinkSuccess(magicLinkRes, wantsOTC, form, doAction, email, captureException);
        } else {
            await handleMagicLinkFailure(magicLinkRes, errorEl);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @returns {string|undefined} */
function buildCheckoutUrl(successUrl) {
    if (!successUrl) {
        return undefined;
    }
    return (new URL(successUrl, window.location.href)).href;
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

/** @returns {boolean} */
function hasCheckoutUrl(responseBody) {
    return responseBody.url !== undefined;
}

/** @returns {Promise<void>} */
function redirectToCheckoutUrl(responseBody) {
    return window.location.assign(responseBody.url);
}

/** @returns {Promise<void>} */
function redirectToStripeCheckout(responseBody) {
    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    }).then(function (redirectResult) {
        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
        }
    });
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

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = buildCheckoutUrl(successUrl);
    const checkoutCancelUrl = buildCheckoutUrl(cancelUrl);
    
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
        .then(function (identity) {
            return createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
        })
        .then(function (responseBody) {
            if (hasCheckoutUrl(responseBody)) {
                return redirectToCheckoutUrl(responseBody);
            }
            return redirectToStripeCheckout(responseBody);
        })
        .catch(function (err) {
            handleCheckoutError(err, el, errorEl, clickHandler);
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
function redirectToStripeUpdateCheckout(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

/** @returns {void} */
function handleUpdateSessionError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

/** @returns {void} */
function handleUpdateSessionResult(result, el, errorEl) {
    if (result.error) {
        throw new Error(t(result.error.message));
    }
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

/** @returns {void} */
function handleBillingPortalError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

/** @returns {Promise<void>} */
function handleSignoutResponse(res, el, clickHandler, siteUrl) {
    if (res.ok) {
        return window.location.replace(siteUrl);
    }
    
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');
}

/** @returns {void} */
function handleCancelSubscriptionWithRetention(doAction, subscriptionId) {
    doAction('openPopup', {
        page: 'accountPlan',
        pageData: {
            subscriptionId,
            action: 'cancel'
        }
    });
}

/** @returns {Promise<Object>} */
function updateSubscriptionCancel(siteUrl, subscriptionId, identity) {
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

/** @returns {void} */
function handleCancelSubscriptionResponse(res, el, errorEl, clickHandler) {
    if (res.ok) {
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

/** @returns {Promise<Object>} */
function updateSubscriptionContinue(siteUrl, subscriptionId, identity) {
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

/** @returns {void} */
function handleContinueSubscriptionResponse(res, el, errorEl, clickHandler) {
    if (res.ok) {
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

/** @returns {boolean} */
function hasRetentionOffers(offers) {
    return (offers || []).some(offer => offer.redemption_type === 'retention');
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
        const successUrl = buildBillingUrl(membersSuccess);
        const cancelUrl = buildBillingUrl(membersCancel);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            
            fetchSessionIdentity(siteUrl)
                .then(function (identity) {
                    return createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl);
                })
                .then(function (result) {
                    return redirectToStripeUpdateCheckout(result);
                })
                .then(function (result) {
                    handleUpdateSessionResult(result, el, errorEl);
                })
                .catch(function (err) {
                    handleUpdateSessionError(err, el, errorEl, clickHandler);
                });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = buildBillingUrl(membersReturn);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            
            fetchSessionIdentity(siteUrl)
                .then(function (identity) {
                    return createStripeBillingPortalSession(siteUrl, identity, returnUrl);
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

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            
            fetch(`${siteUrl}/members/api/session`, {
                method: 'DELETE'
            }).then(function (res) {
                handleSignoutResponse(res, el, clickHandler, siteUrl);
            });
        }
        el.addEventListener('click', clickHandler);
    });

    const retentionOffersAvailable = hasRetentionOffers(offers);

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        
        function clickHandler(event) {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

            if (retentionOffersAvailable) {
                handleCancelSubscriptionWithRetention(doAction, subscriptionId);
                return;
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            fetchSessionIdentity(siteUrl)
                .then(function (identity) {
                    return updateSubscriptionCancel(siteUrl, subscriptionId, identity);
                })
                .then(function (res) {
                    handleCancelSubscriptionResponse(res, el, errorEl, clickHandler);
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

            fetchSessionIdentity(siteUrl)
                .then(function (identity) {
                    return updateSubscriptionContinue(siteUrl, subscriptionId, identity);
                })
                .then(function (res) {
                    handleContinueSubscriptionResponse(res, el, errorEl, clickHandler);
                });
        }
        el.addEventListener('click', clickHandler);
    });
}
```