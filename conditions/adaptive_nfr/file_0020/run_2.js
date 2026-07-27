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

/** @returns {HTMLInputElement|null} */
function getEmailInput(form) {
    return form.querySelector('input[data-members-email]');
}

/** @returns {HTMLInputElement|null} */
function getNameInput(form) {
    return form.querySelector('input[data-members-name]');
}

/** @returns {string} */
function getAutoRedirectValue(form) {
    return form?.dataset?.membersAutoredirect || 'true';
}

/** @returns {string[]} */
function extractLabels(form) {
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    const labels = [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

/** @returns {Array<{name: string}>} */
function extractNewsletters(form) {
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    const newsletters = [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return newsletters;
}

/** @returns {string|undefined} */
function getEmailType(form) {
    return form.dataset.membersForm || undefined;
}

/** @returns {boolean} */
function shouldIncludeOTC(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}

/** @returns {Array<{name: string}>} */
function getNewslettersForRequest(form, newsletterInputs) {
    if (newsletterInputs.length > 0) {
        return Array.from(newsletterInputs).map(input => ({name: input.value}));
    }
    const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    if (checkableNewsletterInputs.length > 0) {
        return [];
    }
    return undefined;
}

/** @returns {Object} */
function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters) {
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
    if (newsletters !== undefined) {
        reqBody.newsletters = newsletters;
    }
    return reqBody;
}

/** @returns {boolean} */
function isResponseOk(res) {
    return res.ok;
}

/** @returns {void} */
function handleOTCResponse(responseBody, email, doAction, captureException) {
    const otcRef = responseBody?.otc_ref;
    if (!otcRef || typeof doAction !== 'function') {
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

/** @returns {void} */
async function handleMagicLinkSuccess(form, wantsOTC, magicLinkRes, email, doAction, captureException) {
    form.classList.add('success');
    if (!wantsOTC) {
        return;
    }
    let responseBody;
    try {
        responseBody = await magicLinkRes.clone().json();
    } catch (e) {
        responseBody = undefined;
    }
    handleOTCResponse(responseBody, email, doAction, captureException);
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

    const emailInput = getEmailInput(form);
    const nameInput = getNameInput(form);
    const autoRedirect = getAutoRedirectValue(form);
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = getEmailType(form);
    const labels = extractLabels(form);
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    const newsletters = getNewslettersForRequest(form, newsletterInputs);
    const wantsOTC = shouldIncludeOTC(emailType, form);

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters);

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

        if (isResponseOk(magicLinkRes)) {
            await handleMagicLinkSuccess(form, wantsOTC, magicLinkRes, email, doAction, captureException);
        } else {
            await handleMagicLinkFailure(magicLinkRes, errorEl);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @returns {string|null} */
function buildCheckoutUrl(successUrl) {
    if (!successUrl) {
        return null;
    }
    return (new URL(successUrl, window.location.href)).href;
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
        if (!isResponseOk(res)) {
            return null;
        }
        return res.text();
    });
}

/** @returns {Promise<Object>} */
function createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...requestData,
            identity: identity,
            successUrl: successUrl,
            cancelUrl: cancelUrl,
            metadata
        })
    }).then(function (res) {
        if (!isResponseOk(res)) {
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
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = buildCheckoutUrl(successUrl);
    const checkoutCancelUrl = buildCheckoutUrl(cancelUrl);

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

/** @returns {string|null} */
function buildUrlFromDataset(datasetValue) {
    if (!datasetValue) {
        return null;
    }
    return (new URL(datasetValue, window.location.href)).href;
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
        if (!isResponseOk(res)) {
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

/** @returns {Promise<string|null>} */
function fetchSessionIdentityForUpdate(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!isResponseOk(res)) {
            return null;
        }
        return res.text();
    });
}

/** @returns {Promise<Object>} */
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
        if (!isResponseOk(res)) {
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
function handleCancelSubscriptionWithRetention(subscriptionId, doAction) {
    doAction('openPopup', {
        page: 'accountPlan',
        pageData: {
            subscriptionId,
            action: 'cancel'
        }
    });
    return Promise.resolve();
}

/** @returns {Promise<void>} */
function cancelSubscriptionRequest(siteUrl, subscriptionId, identity) {
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
    if (isResponseOk(res)) {
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

/** @returns {Promise<void>} */
function continueSubscriptionRequest(siteUrl, subscriptionId, identity) {
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
    if (isResponseOk(res)) {
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
        let membersSuccess = el.dataset.membersSuccess;
        let membersCancel = el.dataset.membersCancel;
        let successUrl = buildUrlFromDataset(membersSuccess);
        let cancelUrl = buildUrlFromDataset(membersCancel);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            fetchSessionIdentityForUpdate(siteUrl)
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
        let errorEl = el.querySelector('[data-members-error]');
        let membersReturn = el.dataset.membersReturn;
        let returnUrl = buildUrlFromDataset(membersReturn);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            fetchSessionIdentityForUpdate(siteUrl)
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
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            event.preventDefault();

            let subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                return handleCancelSubscriptionWithRetention(subscriptionId, doAction);
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            return fetchSessionIdentityForUpdate(siteUrl)
                .then(function (identity) {
                    return cancelSubscriptionRequest(siteUrl, subscriptionId, identity);
                })
                .then(function (res) {
                    handleCancelSubscriptionSuccess(res, el, errorEl, clickHandler);
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

            if (errorEl) {
                errorEl.innerText = '';
            }

            return fetchSessionIdentityForUpdate(siteUrl)
                .then(function (identity) {
                    return continueSubscriptionRequest(siteUrl, subscriptionId, identity);
                })
                .then(function (res) {
                    handleContinueSubscriptionSuccess(res, el, errorEl, clickHandler);
                });
        }
        el.addEventListener('click', clickHandler);
    });
}