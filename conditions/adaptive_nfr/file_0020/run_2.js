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

/** @returns {Promise<Object|undefined>} */
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
function handleOTCAction(doAction, captureException, email, otcRef, inboxLinks) {
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

/** @returns {Promise<void>} */
async function handleMagicLinkSuccess(magicLinkRes, form, errorEl, wantsOTC, doAction, captureException, email) {
    form.classList.add('success');
    const responseBody = await parseOTCResponse(magicLinkRes, wantsOTC);
    const otcRef = responseBody?.otc_ref;
    handleOTCAction(doAction, captureException, email, otcRef, responseBody?.inboxLinks);
}

/** @returns {Promise<void>} */
async function handleMagicLinkFailure(magicLinkRes, form, errorEl) {
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
            await handleMagicLinkSuccess(magicLinkRes, form, errorEl, wantsOTC, doAction, captureException, email);
        } else {
            await handleMagicLinkFailure(magicLinkRes, form, errorEl);
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @returns {string|undefined} */
function buildCheckoutSuccessUrl(el) {
    const successUrl = el.dataset.membersSuccess;
    return successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
}

/** @returns {string|undefined} */
function buildCheckoutCancelUrl(el) {
    const cancelUrl = el.dataset.membersCancel;
    return cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;
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
    const checkoutSuccessUrl = buildCheckoutSuccessUrl(el);
    const checkoutCancelUrl = buildCheckoutCancelUrl(el);
    
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
            handleCheckoutError(err, el, errorEl, clickHandler);
        });
}

/** @returns {string|undefined} */
function buildBillingSuccessUrl(el) {
    const membersSuccess = el.dataset.membersSuccess;
    return membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
}

/** @returns {string|undefined} */
function buildBillingCancelUrl(el) {
    const membersCancel = el.dataset.membersCancel;
    return membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;
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
    }).then(function (result) {
        if (result.error) {
            throw new Error(t(result.error.message));
        }
    });
}

/** @returns {void} */
function handleUpdateCheckoutError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

/** @returns {string|undefined} */
function buildBillingReturnUrl(el) {
    const membersReturn = el.dataset.membersReturn;
    return membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;
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
function handleCancelSubscriptionWithRetention(doAction, subscriptionId) {
    doAction('openPopup', {
        page: 'accountPlan',
        pageData: {
            subscriptionId,
            action: 'cancel'
        }
    });
    return Promise.resolve();
}

/** @returns {Promise<Object|null>} */
function fetchCancelSessionIdentity(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });
}

/** @returns {Promise<Response>} */
function submitCancelSubscription(siteUrl, subscriptionId, identity) {
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
function handleCancelSubscriptionSuccess(res, el, errorEl, clickHandler) {
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

/** @returns {Promise<Response>} */
function submitContinueSubscription(siteUrl, subscriptionId, identity) {
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
function handleContinueSubscriptionSuccess(res, el, errorEl, clickHandler) {
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
        const successUrl = buildBillingSuccessUrl(el);
        const cancelUrl = buildBillingCancelUrl(el);

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
                    return handleUpdateCheckoutResponse(result);
                })
                .catch(function (err) {
                    handleUpdateCheckoutError(err, el, errorEl, clickHandler);
                });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = buildBillingReturnUrl(el);

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

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                return handleCancelSubscriptionWithRetention(doAction, subscriptionId);
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            return fetchCancelSessionIdentity(siteUrl)
                .then(function (identity) {
                    return submitCancelSubscription(siteUrl, subscriptionId, identity);
                })
                .then(function (res) {
                    handleCancelSubscriptionSuccess(res, el, errorEl, clickHandler);
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

            return fetchCancelSessionIdentity(siteUrl)
                .then(function (identity) {
                    return submitContinueSubscription(siteUrl, subscriptionId, identity);
                })
                .then(function (res) {
                    handleContinueSubscriptionSuccess(res, el, errorEl, clickHandler);
                });
        }
        el.addEventListener('click', clickHandler);
    });
}
```