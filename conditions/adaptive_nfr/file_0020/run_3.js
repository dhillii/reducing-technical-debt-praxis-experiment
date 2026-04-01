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
function hasSelectedNewsletters(newsletterInputs) {
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
function getEmailType(form) {
    return form.dataset.membersForm || undefined;
}

/** @returns {boolean} */
function shouldAutoRedirect(form) {
    return (form?.dataset?.membersAutoredirect || 'true') === 'true';
}

/** @returns {Object} */
function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, newsletterInputs) {
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: autoRedirect
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (hasSelectedNewsletters(newsletterInputs)) {
        reqBody.newsletters = newsletters;
    } else if (hasCheckableNewsletterInputs({target: {querySelectorAll: () => []}})) {
        reqBody.newsletters = [];
    }

    return reqBody;
}

/** @returns {void} */
function clearFormErrors(form, errorEl) {
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');
}

/** @returns {void} */
function handleMagicLinkSuccess(form, wantsOTC, responseBody, email, doAction, captureException) {
    form.classList.add('success');

    if (!wantsOTC) {
        return;
    }

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
async function handleMagicLinkResponse(magicLinkRes, form, wantsOTC, email, errorEl, doAction, captureException) {
    form.addEventListener('submit', submitHandler);
    form.classList.remove('loading');

    if (!magicLinkRes.ok) {
        const e = await HumanReadableError.fromApiResponse(magicLinkRes);
        const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
        displayErrorIfElementExists(errorEl, errorMessage);
        form.classList.add('error');
        return;
    }

    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await magicLinkRes.clone().json();
        } catch (e) {
            responseBody = undefined;
        }
    }

    handleMagicLinkSuccess(form, wantsOTC, responseBody, email, doAction, captureException);
}

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    clearFormErrors(form, errorEl);

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = getEmailType(form);
    const autoRedirect = shouldAutoRedirect(form);
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

        await handleMagicLinkResponse(magicLinkRes, form, wantsOTC, email, errorEl, doAction, captureException);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @returns {void} */
function buildCheckoutUrls(el) {
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const result = {};

    if (successUrl) {
        result.checkoutSuccessUrl = (new URL(successUrl, window.location.href)).href;
    }

    if (cancelUrl) {
        result.checkoutCancelUrl = (new URL(cancelUrl, window.location.href)).href;
    }

    return result;
}

/** @returns {void} */
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
    const {checkoutSuccessUrl, checkoutCancelUrl} = buildCheckoutUrls(el);

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
        }).then(function (res) {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        });
    }).then(function (responseBody) {
        return handleCheckoutRedirect(responseBody);
    }).catch(function (err) {
        handleCheckoutError(err, el, errorEl, clickHandler);
    });
}

/** @returns {void} */
function handleEditBillingClick(event, el, errorEl, siteUrl, clickHandler, successUrl, cancelUrl) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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
    }).then(function (result) {
        const stripe = window.Stripe(result.publicKey);
        return stripe.redirectToCheckout({
            sessionId: result.sessionId
        });
    }).then(function (result) {
        if (result.error) {
            throw new Error(t(result.error.message));
        }
    }).catch(function (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    });
}

/** @returns {void} */
function handleManageBillingClick(event, el, errorEl, siteUrl, clickHandler, returnUrl) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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
    }).then(function (result) {
        return window.location.assign(result.url);
    }).catch(function (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    });
}

/** @returns {void} */
function handleSignoutClick(event, el, siteUrl, clickHandler) {
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

/** @returns {void} */
function handleCancelSubscriptionWithRetention(subscriptionId, doAction) {
    doAction('openPopup', {
        page: 'accountPlan',
        pageData: {
            subscriptionId,
            action: 'cancel'
        }
    });
}

/** @returns {void} */
function handleCancelSubscriptionClick(event, el, errorEl, siteUrl, clickHandler, subscriptionId, hasRetentionOffers, doAction) {
    event.preventDefault();

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

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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

/** @returns {void} */
function handleContinueSubscriptionClick(event, el, errorEl, siteUrl, clickHandler, subscriptionId) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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
        let cancelUrl;

        if (membersSuccess) {
            successUrl = (new URL(membersSuccess, window.location.href)).href;
        }

        if (membersCancel) {
            cancelUrl = (new URL(membersCancel, window.location.href)).href;
        }

        function clickHandler(event) {
            handleEditBillingClick(event, el, errorEl, siteUrl, clickHandler, successUrl, cancelUrl);
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
            handleManageBillingClick(event, el, errorEl, siteUrl, clickHandler, returnUrl);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick(event, el, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            const subscriptionId = el.dataset.membersCancelSubscription;
            handleCancelSubscriptionClick(event, el, errorEl, siteUrl, clickHandler, subscriptionId, hasRetentionOffers, doAction);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            const subscriptionId = el.dataset.membersContinueSubscription;
            handleContinueSubscriptionClick(event, el, errorEl, siteUrl, clickHandler, subscriptionId);
        }
        el.addEventListener('click', clickHandler);
    });
}
```