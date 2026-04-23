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

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        return null;
    }
    return res.json();
}

async function getSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) {
        return null;
    }
    return res.text();
}

async function createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
    const body = {
        ...requestData,
        identity,
        successUrl,
        cancelUrl,
        metadata
    };
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

async function redirectToStripeCheckout(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

async function handleFormSubmit({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
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
    let emailType = undefined;
    const labels = [];
    const newsletters = [];

    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }

    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }

    if (form.dataset.membersForm) {
        emailType = form.dataset.membersForm;
    }

    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
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
    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

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
            form.classList.add('success');
            let responseBody;
            if (wantsOTC) {
                try {
                    responseBody = await magicLinkRes.clone().json();
                } catch (e) {
                    responseBody = undefined;
                }
            }
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
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

async function handlePlanClick({event, el, errorEl, siteUrl, site, member, clickHandler}) {
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

    try {
        const identity = await getSessionIdentity(siteUrl);
        const responseBody = await createStripeCheckoutSession(
            siteUrl,
            requestData,
            identity,
            checkoutSuccessUrl,
            checkoutCancelUrl,
            metadata
        );
        await redirectToStripeCheckout(responseBody);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

async function handleEditBillingClick({event, el, errorEl, siteUrl, successUrl, cancelUrl}) {
    el.removeEventListener('click', handleEditBillingClick);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await getSessionIdentity(siteUrl);
        const result = await fetchJson(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                successUrl,
                cancelUrl
            })
        });
        if (!result) throw new Error(t('Could not create stripe checkout session'));
        const stripe = window.Stripe(result.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
        if (redirectResult.error) {
            throw new Error(t(redirectResult.error.message));
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', handleEditBillingClick);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

async function handleManageBillingClick({event, el, errorEl, siteUrl, returnUrl}) {
    el.removeEventListener('click', handleManageBillingClick);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await getSessionIdentity(siteUrl);
        const result = await fetchJson(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                returnUrl
            })
        });
        if (!result) throw new Error(t('Could not create Stripe billing portal session'));
        window.location.assign(result.url);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', handleManageBillingClick);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

async function handleSignoutClick({event, el, siteUrl}) {
    el.removeEventListener('click', handleSignoutClick);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');
    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', handleSignoutClick);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', handleSignoutClick);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

async function handleCancelSubscriptionClick({event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction}) {
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

    el.removeEventListener('click', handleCancelSubscriptionClick);
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const identity = await getSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                smart_cancel: true
            })
        });
        if (res.ok) {
            window.location.reload();
        } else {
            throw new Error();
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', handleCancelSubscriptionClick);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) {
            errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
        }
    }
}

async function handleContinueSubscriptionClick({event, el, errorEl, siteUrl, subscriptionId}) {
    event.preventDefault();
    el.removeEventListener('click', handleContinueSubscriptionClick);
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const identity = await getSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                cancel_at_period_end: false
            })
        });
        if (res.ok) {
            window.location.reload();
        } else {
            throw new Error();
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', handleContinueSubscriptionClick);
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
        const submitHandler = (event) => handleFormSubmit({event, form, errorEl, siteUrl, submitHandler, doAction, captureException});
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = (event) => handlePlanClick({event, el, errorEl, siteUrl, site, member, clickHandler});
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

        const clickHandler = (event) => handleEditBillingClick({event, el, errorEl, siteUrl, successUrl, cancelUrl});
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        let returnUrl;

        if (membersReturn) {
            returnUrl = (new URL(membersReturn, window.location.href)).href;
        }

        const clickHandler = (event) => handleManageBillingClick({event, el, errorEl, siteUrl, returnUrl});
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        const clickHandler = (event) => handleSignoutClick({event, el, siteUrl});
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;
        const clickHandler = (event) => handleCancelSubscriptionClick({
            event,
            el,
            errorEl,
            siteUrl,
            subscriptionId,
            hasRetentionOffers,
            doAction
        });
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;
        const clickHandler = (event) => handleContinueSubscriptionClick({
            event,
            el,
            errorEl,
            siteUrl,
            subscriptionId
        });
        el.addEventListener('click', clickHandler);
    });
}