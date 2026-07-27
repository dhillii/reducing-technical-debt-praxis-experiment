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

function isFormValid(form) {
    return form && form.dataset.membersForm;
}

function getFormRequestData(form, siteUrl) {
    const emailInput = form.querySelector('input[data-members-email]');
    const nameInput = form.querySelector('input[data-members-name]');
    const autoRedirect = form.dataset.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const labels = Array.prototype.map.call(form.querySelectorAll('input[data-members-label]'), input => input.value);
    const newsletters = Array.prototype.map.call(form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'), input => ({name: input.value}));
    const wantsOTC = emailType === 'signin' && form.dataset.membersOtc === 'true';
    const urlHistory = getUrlHistory();
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
    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }
    return reqBody;
}

function sendMagicLinkRequest(siteUrl, reqBody) {
    return fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'})
        .then(res => res.text())
        .then(integrityToken => fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        }));
}

function handleMagicLinkResponse(magicLinkRes, form, errorEl, wantsOTC, doAction) {
    if (!magicLinkRes.ok) {
        throw new Error(t('Failed to send magic link email'));
    }
    return magicLinkRes.clone().json()
        .then(responseBody => {
            const otcRef = responseBody?.otc_ref;
            if (otcRef && typeof doAction === 'function') {
                doAction('startSigninOTCFromCustomForm', {
                    email: responseBody.email,
                    otcRef,
                    inboxLinks: responseBody?.inboxLinks
                });
            }
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
}

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    if (!isFormValid(form)) {
        return;
    }
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    errorEl.innerText = '';
    form.classList.remove('success', 'invalid', 'error');
    form.classList.add('loading');
    try {
        const reqBody = getFormRequestData(form, siteUrl);
        const magicLinkRes = await sendMagicLinkRequest(siteUrl, reqBody);
        await handleMagicLinkResponse(magicLinkRes, form, errorEl, reqBody.includeOTC, doAction);
        form.classList.add('success');
    } catch (err) {
        handleError(err, form, errorEl);
    } finally {
        form.classList.remove('loading');
        form.addEventListener('submit', submitHandler);
    }
}

function getPlanRequestData(el, site, member) {
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }
    return {requestData, metadata};
}

function createStripeCheckoutSession(siteUrl, requestData, metadata, successUrl, cancelUrl) {
    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => res.text())
        .then(identity => fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                ...requestData,
                identity,
                successUrl,
                cancelUrl,
                metadata
            })
        }));
}

function handleCheckoutResponse(responseBody, errorEl) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }
    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    errorEl.innerText = '';
    el.classList.add('loading');
    try {
        const {requestData, metadata} = getPlanRequestData(el, site, member);
        const successUrl = el.dataset.membersSuccess;
        const cancelUrl = el.dataset.membersCancel;
        const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
        const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;
        const responseBody = await createStripeCheckoutSession(siteUrl, requestData, metadata, checkoutSuccessUrl, checkoutCancelUrl);
        await handleCheckoutResponse(responseBody, errorEl);
    } catch (err) {
        console.error(err);
        el.classList.remove('loading');
        el.classList.add('error');
        errorEl.innerText = err.message;
    } finally {
        el.addEventListener('click', clickHandler);
    }
}

function handleEditBillingClick(event, el, errorEl, siteUrl) {
    el.removeEventListener('click', event);
    event.preventDefault();
    errorEl.innerText = '';
    el.classList.add('loading');
    const membersSuccess = el.dataset.membersSuccess;
    const membersCancel = el.dataset.membersCancel;
    const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
    const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;
    fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => res.text())
        .then(identity => fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                successUrl,
                cancelUrl
            })
        }))
        .then(res => res.json())
        .then(result => {
            const stripe = window.Stripe(result.publicKey);
            return stripe.redirectToCheckout({
                sessionId: result.sessionId
            });
        })
        .catch(err => {
            console.error(err);
            el.classList.remove('loading');
            el.classList.add('error');
            errorEl.innerText = err.message;
        });
}

function handleManageBillingClick(event, el, errorEl, siteUrl) {
    el.removeEventListener('click', event);
    event.preventDefault();
    errorEl.innerText = '';
    el.classList.add('loading');
    const membersReturn = el.dataset.membersReturn;
    const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;
    fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => res.text())
        .then(identity => fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                returnUrl
            })
        }))
        .then(res => res.json())
        .then(result => window.location.assign(result.url))
        .catch(err => {
            console.error(err);
            el.classList.remove('loading');
            el.classList.add('error');
            errorEl.innerText = err.message;
        });
}

function handleSignoutClick(event, el, siteUrl) {
    el.removeEventListener('click', event);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');
    fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
        .then(res => {
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.classList.remove('loading');
                el.classList.add('error');
            }
        });
}

function handleCancelSubscriptionClick(event, el, errorEl, siteUrl, doAction, offers) {
    event.preventDefault();
    const subscriptionId = el.dataset.membersCancelSubscription;
    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');
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
    el.removeEventListener('click', event);
    el.classList.remove('error');
    el.classList.add('loading');
    errorEl.innerText = '';
    fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => res.text())
        .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                smart_cancel: true
            })
        }))
        .then(res => {
            if (res.ok) {
                window.location.reload();
            } else {
                el.classList.remove('loading');
                el.classList.add('error');
                errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
            }
        });
}

function handleContinueSubscriptionClick(event, el, errorEl, siteUrl) {
    event.preventDefault();
    const subscriptionId = el.dataset.membersContinueSubscription;
    el.removeEventListener('click', event);
    el.classList.remove('error');
    el.classList.add('loading');
    errorEl.innerText = '';
    fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => res.text())
        .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                cancel_at_period_end: false
            })
        }))
        .then(res => {
            if (res.ok) {
                window.location.reload();
            } else {
                el.classList.remove('loading');
                el.classList.add('error');
                errorEl.innerText = t('There was an error continuing your subscription, please try again.');
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
        function clickHandler(event) {
            handleEditBillingClick(event, el, errorEl, siteUrl);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleManageBillingClick(event, el, errorEl, siteUrl);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick(event, el, siteUrl);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleCancelSubscriptionClick(event, el, errorEl, siteUrl, doAction, offers);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleContinueSubscriptionClick(event, el, errorEl, siteUrl);
        }
        el.addEventListener('click', clickHandler);
    });
}