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
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    return {email, name};
}

/** @param {HTMLElement} form - The form element */
function extractLabels(form) {
    const labels = [];
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

/** @param {HTMLElement} form - The form element */
function extractNewsletters(form) {
    const newsletters = [];
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return {newsletters, newsletterInputs};
}

/** @param {HTMLElement} form - The form element */
function getAutoRedirectValue(form) {
    return form?.dataset?.membersAutoredirect || 'true';
}

/** @param {HTMLElement} form - The form element */
function getEmailType(form) {
    return form.dataset.membersForm || undefined;
}

/** @param {HTMLElement} form - The form element */
function shouldSetEmptyNewsletters(form, newsletterInputs) {
    if (newsletterInputs.length > 0) {
        return false;
    }
    const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkableNewsletterInputs.length > 0;
}

/** @param {Object} reqBody - The request body */
function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, shouldSetEmpty) {
    const body = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: (autoRedirect === 'true')
    };
    if (wantsOTC) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (newsletters.length > 0) {
        body.newsletters = newsletters;
    } else if (shouldSetEmpty) {
        body.newsletters = [];
    }
    return body;
}

/** @param {Object} responseBody - The response body */
function getOTCRef(responseBody) {
    return responseBody?.otc_ref;
}

/** @param {string} email - The email address */
function getTrimmedEmail(email) {
    return (email || '').trim();
}

/** @param {Object} responseBody - The response body */
function handleOTCSuccess(email, responseBody, doAction, captureException) {
    const otcRef = getOTCRef(responseBody);
    if (!otcRef || typeof doAction !== 'function') {
        return;
    }
    try {
        doAction('startSigninOTCFromCustomForm', {
            email: getTrimmedEmail(email),
            otcRef,
            inboxLinks: responseBody?.inboxLinks
        });
    } catch (e) {
        console.error(e);
        captureException?.(e);
    }
}

/** @param {Response} magicLinkRes - The response object */
async function parseOTCResponse(magicLinkRes) {
    try {
        return await magicLinkRes.clone().json();
    } catch (e) {
        return undefined;
    }
}

/** @param {Response} magicLinkRes - The response object */
async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException) {
    let responseBody;
    if (wantsOTC) {
        responseBody = await parseOTCResponse(magicLinkRes);
    }
    handleOTCSuccess(email, responseBody, doAction, captureException);
}

/** @param {Response} magicLinkRes - The response object */
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

    const {email, name} = extractFormInputs(form);
    const labels = extractLabels(form);
    const {newsletters, newsletterInputs} = extractNewsletters(form);
    const autoRedirect = getAutoRedirectValue(form);
    const emailType = getEmailType(form);
    const wantsOTC = isSigninWithOTC(emailType, form);
    const urlHistory = getUrlHistory();
    const shouldSetEmpty = shouldSetEmptyNewsletters(form, newsletterInputs);

    const reqBody = buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, shouldSetEmpty);

    form.classList.add('loading');

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
            await handleMagicLinkFailure(magicLinkRes, errorEl);
            form.classList.add('error');
            return;
        }

        form.classList.add('success');
        await handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @param {string} url - The URL string */
function buildAbsoluteUrl(url) {
    if (!url) {
        return undefined;
    }
    return (new URL(url, window.location.href)).href;
}

/** @param {Response} res - The response object */
function isResponseOk(res) {
    return res.ok;
}

/** @param {Response} res - The response object */
async function extractResponseText(res) {
    if (!isResponseOk(res)) {
        return null;
    }
    return res.text();
}

/** @param {Response} res - The response object */
async function extractResponseJson(res) {
    if (!isResponseOk(res)) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/** @param {Object} responseBody - The response body */
function hasCheckoutUrl(responseBody) {
    return responseBody.url;
}

/** @param {Object} responseBody - The response body */
function handleCheckoutUrl(responseBody) {
    return window.location.assign(responseBody.url);
}

/** @param {Object} responseBody - The response body */
async function handleStripeCheckout(responseBody) {
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

/** @param {Object} requestData - The request data */
function buildCheckoutSessionBody(requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    return {
        ...requestData,
        identity: identity,
        successUrl: checkoutSuccessUrl,
        cancelUrl: checkoutCancelUrl,
        metadata
    };
}

/** @param {HTMLElement} el - The element */
function resetPlanClickHandler(el, clickHandler) {
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
}

/** @param {HTMLElement} el - The element */
function handlePlanClickError(el, err, errorEl, clickHandler) {
    console.error(err);
    resetPlanClickHandler(el, clickHandler);
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
    const checkoutSuccessUrl = buildAbsoluteUrl(el.dataset.membersSuccess);
    const checkoutCancelUrl = buildAbsoluteUrl(el.dataset.membersCancel);

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
            const body = buildCheckoutSessionBody(requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
            return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            }).then(extractResponseJson);
        })
        .then(function (responseBody) {
            if (hasCheckoutUrl(responseBody)) {
                return handleCheckoutUrl(responseBody);
            }
            return handleStripeCheckout(responseBody);
        })
        .catch(function (err) {
            handlePlanClickError(el, err, errorEl, clickHandler);
        });
}

/** @param {HTMLElement} el - The element */
function resetBillingClickHandler(el, clickHandler) {
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
}

/** @param {HTMLElement} el - The element */
function handleBillingClickError(el, err, errorEl, clickHandler) {
    console.error(err);
    resetBillingClickHandler(el, clickHandler);
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

/** @param {string} identity - The identity token */
function buildUpdateSessionBody(identity, successUrl, cancelUrl) {
    return {
        identity: identity,
        successUrl: successUrl,
        cancelUrl: cancelUrl
    };
}

/** @param {Response} res - The response object */
async function extractUpdateSessionJson(res) {
    if (!isResponseOk(res)) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/** @param {Object} result - The result object */
function handleUpdateCheckout(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

/** @param {Object} result - The result object */
function handleUpdateCheckoutResult(result) {
    if (result.error) {
        throw new Error(t(result.error.message));
    }
}

/** @param {string} identity - The identity token */
function buildBillingPortalBody(identity, returnUrl) {
    return {
        identity: identity,
        returnUrl
    };
}

/** @param {Response} res - The response object */
async function extractBillingPortalJson(res) {
    if (!isResponseOk(res)) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }
    return res.json();
}

/** @param {Object} result - The result object */
function handleBillingPortalResult(result) {
    return window.location.assign(result.url);
}

/** @param {Response} res - The response object */
function handleSignoutResponse(res, siteUrl, el, clickHandler) {
    if (res.ok) {
        window.location.replace(siteUrl);
        return;
    }
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    el.classList.add('error');
}

/** @param {boolean} hasRetentionOffers - Whether retention offers exist */
function shouldOpenRetentionPortal(hasRetentionOffers) {
    return hasRetentionOffers;
}

/** @param {string} subscriptionId - The subscription ID */
function buildCancelSubscriptionBody(identity) {
    return {
        identity: identity,
        smart_cancel: true
    };
}

/** @param {Response} res - The response object */
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

/** @param {string} identity - The identity token */
function buildContinueSubscriptionBody(identity) {
    return {
        identity: identity,
        cancel_at_period_end: false
    };
}

/** @param {Response} res - The response object */
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
        const successUrl = buildAbsoluteUrl(el.dataset.membersSuccess);
        const cancelUrl = buildAbsoluteUrl(el.dataset.membersCancel);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(extractResponseText)
                .then(function (identity) {
                    const body = buildUpdateSessionBody(identity, successUrl, cancelUrl);
                    return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(body)
                    }).then(extractUpdateSessionJson);
                })
                .then(handleUpdateCheckout)
                .then(handleUpdateCheckoutResult)
                .catch(function (err) {
                    handleBillingClickError(el, err, errorEl, clickHandler);
                });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = buildAbsoluteUrl(el.dataset.membersReturn);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(extractResponseText)
                .then(function (identity) {
                    const body = buildBillingPortalBody(identity, returnUrl);
                    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(body)
                    }).then(extractBillingPortalJson);
                })
                .then(handleBillingPortalResult)
                .catch(function (err) {
                    handleBillingClickError(el, err, errorEl, clickHandler);
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
                handleSignoutResponse(res, siteUrl, el, clickHandler);
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

            if (shouldOpenRetentionPortal(hasRetentionOffers)) {
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

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(extractResponseText)
                .then(function (identity) {
                    const body = buildCancelSubscriptionBody(identity);
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(body)
                    });
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

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(extractResponseText)
                .then(function (identity) {
                    const body = buildContinueSubscriptionBody(identity);
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(body)
                    });
                })
                .then(function (res) {
                    handleContinueSubscriptionResponse(res, el, errorEl, clickHandler);
                });
        }
        el.addEventListener('click', clickHandler);
    });
}