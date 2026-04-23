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
function getFormInputValue(form, selector) {
    const input = form.querySelector(selector);
    return input?.value;
}

/** @param {HTMLElement} form - The form element */
function getFormInputValues(form, selector) {
    const inputs = form.querySelectorAll(selector) || [];
    return Array.from(inputs).map(input => input.value);
}

/** @param {HTMLElement} form - The form element */
function getFormLabels(form) {
    return getFormInputValues(form, 'input[data-members-label]');
}

/** @param {HTMLElement} form - The form element */
function getFormNewsletters(form) {
    const inputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    return Array.from(inputs).map(input => ({name: input.value}));
}

/** @param {HTMLElement} form - The form element */
function hasCheckableNewsletterInputs(form) {
    const inputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return inputs.length > 0;
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

/** @param {Object} magicLinkRes - The response object */
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
    if (!hasOTCRef(responseBody) || !isDoActionFunction(doAction)) {
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

/** @param {Object} magicLinkRes - The response object */
async function handleMagicLinkError(magicLinkRes, errorEl) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
}

/** @param {Object} reqBody - The request body */
function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, newsletterInputs) {
    const body = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: parseAutoRedirect(autoRedirect)
    };

    if (wantsOTC) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (newsletterInputs.length > 0) {
        body.newsletters = newsletters;
    }

    return body;
}

/** @param {HTMLElement} form - The form element */
function handleNewsletterDefaults(form, reqBody) {
    if (reqBody.newsletters !== undefined) {
        return;
    }

    if (!hasCheckableNewsletterInputs(form)) {
        return;
    }

    reqBody.newsletters = [];
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

    const email = getFormInputValue(form, 'input[data-members-email]');
    const nameInput = getFormInputValue(form, 'input[data-members-name]');
    const name = (nameInput || '').trim() || undefined;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm;
    const labels = getFormLabels(form);
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    const newsletters = getFormNewsletters(form);
    const wantsOTC = isSigninWithOTC(emailType, form);

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, newsletterInputs);
    handleNewsletterDefaults(form, reqBody);

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

        if (!magicLinkRes.ok) {
            await handleMagicLinkError(magicLinkRes, errorEl);
            form.classList.add('error');
            return;
        }

        form.classList.add('success');
        await handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @param {Object} responseBody - The response body */
function hasCheckoutUrl(responseBody) {
    return responseBody?.url;
}

/** @param {Object} redirectResult - The redirect result */
function hasRedirectError(redirectResult) {
    return redirectResult?.error;
}

/** @param {Object} res - The response object */
async function handleCheckoutSessionResponse(res) {
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/** @param {Object} responseBody - The response body */
function redirectToCheckoutUrl(responseBody) {
    return window.location.assign(responseBody.url);
}

/** @param {Object} responseBody - The response body */
async function handleStripeCheckout(responseBody) {
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });

    if (hasRedirectError(redirectResult)) {
        throw new Error(redirectResult.error.message);
    }
}

/** @param {Object} responseBody - The response body */
async function processCheckoutResponse(responseBody) {
    if (hasCheckoutUrl(responseBody)) {
        return redirectToCheckoutUrl(responseBody);
    }
    return handleStripeCheckout(responseBody);
}

/** @param {HTMLElement} el - The element */
function resetElementState(el, clickHandler) {
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
}

/** @param {HTMLElement} el - The element */
function setElementError(el, message) {
    el.classList.add('error');
    if (el) {
        el.innerText = message;
    }
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

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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
        }).then(handleCheckoutSessionResponse);
    }).then(processCheckoutResponse).catch(function (err) {
        console.error(err);
        resetElementState(el, clickHandler);
        setElementError(errorEl, err.message);
        el.classList.add('error');
    });
}

/** @param {string} siteUrl - The site URL */
function getSessionIdentity(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });
}

/** @param {string} siteUrl - The site URL */
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

/** @param {Object} result - The result object */
function redirectToStripeCheckout(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

/** @param {Object} result - The result object */
function hasStripeError(result) {
    return result?.error;
}

/** @param {HTMLElement} el - The element */
function handleEditBillingError(el, err, clickHandler, errorEl) {
    console.error(err);
    resetElementState(el, clickHandler);
    setElementError(errorEl, err.message);
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

        getSessionIdentity(siteUrl).then(function (identity) {
            return createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl);
        }).then(redirectToStripeCheckout).then(function (result) {
            if (hasStripeError(result)) {
                throw new Error(t(result.error.message));
            }
        }).catch(function (err) {
            handleEditBillingError(el, err, clickHandler, errorEl);
        });
    };
}

/** @param {string} siteUrl - The site URL */
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

/** @param {Object} result - The result object */
function redirectToBillingPortal(result) {
    return window.location.assign(result.url);
}

function handleManageBillingClickHandler(el, errorEl, siteUrl, returnUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        el.classList.add('loading');

        getSessionIdentity(siteUrl).then(function (identity) {
            return createStripeBillingPortalSession(siteUrl, identity, returnUrl);
        }).then(redirectToBillingPortal).catch(function (err) {
            console.error(err);
            resetElementState(el, clickHandler);
            setElementError(errorEl, err.message);
            el.classList.add('error');
        });
    };
}

/** @param {Object} res - The response object */
function isSessionOk(res) {
    return res.ok;
}

function handleSignoutClickHandler(el, siteUrl, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        fetch(`${siteUrl}/members/api/session`, {
            method: 'DELETE'
        }).then(function (res) {
            if (isSessionOk(res)) {
                window.location.replace(siteUrl);
                return;
            }
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        });
    };
}

/** @param {string} subscriptionId - The subscription ID */
function cancelSubscriptionRequest(siteUrl, identity, subscriptionId) {
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

/** @param {Object} res - The response object */
function handleCancelSubscriptionResponse(res, el, clickHandler, errorEl) {
    if (isSessionOk(res)) {
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

function handleCancelSubscriptionClickHandler(el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler) {
    return function (event) {
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

        getSessionIdentity(siteUrl).then(function (identity) {
            return cancelSubscriptionRequest(siteUrl, identity, subscriptionId);
        }).then(function (res) {
            handleCancelSubscriptionResponse(res, el, clickHandler, errorEl);
        });
    };
}

/** @param {string} subscriptionId - The subscription ID */
function continueSubscriptionRequest(siteUrl, identity, subscriptionId) {
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

/** @param {Object} res - The response object */
function handleContinueSubscriptionResponse(res, el, clickHandler, errorEl) {
    if (isSessionOk(res)) {
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

function handleContinueSubscriptionClickHandler(el, errorEl, siteUrl, subscriptionId, clickHandler) {
    return function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        if (errorEl) {
            errorEl.innerText = '';
        }

        getSessionIdentity(siteUrl).then(function (identity) {
            return continueSubscriptionRequest(siteUrl, identity, subscriptionId);
        }).then(function (res) {
            handleContinueSubscriptionResponse(res, el, clickHandler, errorEl);
        });
    };
}

/** @param {Array} offers - The offers array */
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

        let successUrl;
        if (membersSuccess) {
            successUrl = (new URL(membersSuccess, window.location.href)).href;
        }

        let cancelUrl;
        if (membersCancel) {
            cancelUrl = (new URL(membersCancel, window.location.href)).href;
        }

        const clickHandler = handleEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl, function clickHandlerRef(event) {
            clickHandler(event);
        });
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;

        let returnUrl;
        if (membersReturn) {
            returnUrl = (new URL(membersReturn, window.location.href)).href;
        }

        const clickHandler = handleManageBillingClickHandler(el, errorEl, siteUrl, returnUrl, function clickHandlerRef(event) {
            clickHandler(event);
        });
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        const clickHandler = handleSignoutClickHandler(el, siteUrl, function clickHandlerRef(event) {
            clickHandler(event);
        });
        el.addEventListener('click', clickHandler);
    });

    const retentionOffers = hasRetentionOffers(offers);

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;
        const clickHandler = handleCancelSubscriptionClickHandler(el, errorEl, siteUrl, subscriptionId, retentionOffers, doAction, function clickHandlerRef(event) {
            clickHandler(event);
        });
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;
        const clickHandler = handleContinueSubscriptionClickHandler(el, errorEl, siteUrl, subscriptionId, function clickHandlerRef(event) {
            clickHandler(event);
        });
        el.addEventListener('click', clickHandler);
    });
}