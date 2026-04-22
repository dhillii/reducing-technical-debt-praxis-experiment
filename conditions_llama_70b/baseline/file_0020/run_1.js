```javascript
/* eslint-disable no-console */
import { getCheckoutSessionDataFromPlanAttribute, getUrlHistory } from './utils/helpers';
import { HumanReadableError, chooseBestErrorMessage } from './utils/errors';
import { t } from './utils/i18n';

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

async function getMagicLinkResponse(siteUrl, reqBody) {
    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, { method: 'GET' });
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...reqBody, integrityToken })
        });

        return magicLinkRes;
    } catch (err) {
        throw err;
    }
}

async function handleMagicLinkResponse(magicLinkRes, form, errorEl, wantsOTC, doAction) {
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
                    email: (responseBody?.email || '').trim(),
                    otcRef,
                    inboxLinks: responseBody?.inboxLinks
                });
            } catch (e) {
                console.error(e);
            }
        }
    } else {
        const e = await HumanReadableError.fromApiResponse(magicLinkRes);
        const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
        displayErrorIfElementExists(errorEl, errorMessage);
        form.classList.add('error');
    }
}

async function getCheckoutSessionResponse(siteUrl, requestData) {
    try {
        const res = await fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' });
        if (!res.ok) {
            return null;
        }
        const identity = await res.text();

        const response = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestData, identity })
        });

        return response;
    } catch (err) {
        throw err;
    }
}

async function handleCheckoutSessionResponse(response, el, errorEl) {
    if (response.ok) {
        const responseBody = await response.json();
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        return stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        });
    } else {
        throw new Error(t('Could not create stripe checkout session'));
    }
}

async function getUpdateSessionResponse(siteUrl, requestData) {
    try {
        const res = await fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' });
        if (!res.ok) {
            return null;
        }
        const identity = await res.text();

        const response = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestData, identity })
        });

        return response;
    } catch (err) {
        throw err;
    }
}

async function getBillingPortalSessionResponse(siteUrl, requestData) {
    try {
        const res = await fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' });
        if (!res.ok) {
            return null;
        }
        const identity = await res.text();

        const response = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestData, identity })
        });

        return response;
    } catch (err) {
        throw err;
    }
}

async function handleFormSubmit(event, form, errorEl, siteUrl, submitHandler, doAction, captureException) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');
    let emailInput = event.target.querySelector('input[data-members-email]');
    let nameInput = event.target.querySelector('input[data-members-name]');
    let autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    let email = emailInput?.value;
    let name = (nameInput?.value || '').trim() || undefined;
    let emailType = undefined;
    let labels = [];
    let newsletters = [];

    let labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    labelInputs.forEach((input) => {
        labels.push(input.value);
    });

    let newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    newsletterInputs.forEach((input) => {
        newsletters.push({ name: input.value });
    });

    if (form.dataset.membersForm) {
        emailType = form.dataset.membersForm;
    }

    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
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
        const magicLinkRes = await getMagicLinkResponse(siteUrl, reqBody);
        await handleMagicLinkResponse(magicLinkRes, form, errorEl, wantsOTC, doAction);
    } catch (err) {
        handleError(err, form, errorEl);
    } finally {
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
    }
}

async function handlePlanClick(event, el, errorEl, siteUrl, site, member, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    let plan = el.dataset.membersPlan;
    let requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    let successUrl = el.dataset.membersSuccess;
    let cancelUrl = el.dataset.membersCancel;
    let checkoutSuccessUrl;
    let checkoutCancelUrl;

    if (successUrl) {
        checkoutSuccessUrl = new URL(successUrl, window.location.href).href;
    }

    if (cancelUrl) {
        checkoutCancelUrl = new URL(cancelUrl, window.location.href).href;
    }

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    const metadata = member ? { checkoutType: 'upgrade' } : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const response = await getCheckoutSessionResponse(siteUrl, { ...requestData, successUrl: checkoutSuccessUrl, cancelUrl: checkoutCancelUrl, metadata });
        await handleCheckoutSessionResponse(response, el, errorEl);
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

async function handleEditBillingClick(event, el, errorEl, siteUrl, site, member, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    let membersSuccess = el.dataset.membersSuccess;
    let membersCancel = el.dataset.membersCancel;
    let successUrl;
    let cancelUrl;

    if (membersSuccess) {
        successUrl = new URL(membersSuccess, window.location.href).href;
    }

    if (membersCancel) {
        cancelUrl = new URL(membersCancel, window.location.href).href;
    }

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const response = await getUpdateSessionResponse(siteUrl, { successUrl, cancelUrl });
        const responseBody = await response.json();
        const stripe = window.Stripe(responseBody.publicKey);
        await stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        });
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

async function handleManageBillingClick(event, el, errorEl, siteUrl, site, member, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    let membersReturn = el.dataset.membersReturn;
    let returnUrl;

    if (membersReturn) {
        returnUrl = new URL(membersReturn, window.location.href).href;
    }

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const response = await getBillingPortalSessionResponse(siteUrl, { returnUrl });
        const responseBody = await response.json();
        window.location.assign(responseBody.url);
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

async function handleSignoutClick(event, el, siteUrl) {
    el.removeEventListener('click', () => handleSignoutClick(event, el, siteUrl));
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    try {
        const response = await fetch(`${siteUrl}/members/api/session`, { method: 'DELETE' });
        if (response.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', () => handleSignoutClick(event, el, siteUrl));
            el.classList.remove('loading');
            el.classList.add('error');
        }
    } catch (err) {
        console.error(err);
    }
}

async function handleCancelSubscriptionClick(event, el, errorEl, siteUrl, doAction) {
    event.preventDefault();
    let subscriptionId = el.dataset.membersCancelSubscription;

    const hasRetentionOffers = (doAction.offers || []).some((offer) => offer.redemption_type === 'retention');

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

    el.removeEventListener('click', () => handleCancelSubscriptionClick(event, el, errorEl, siteUrl, doAction));
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const response = await fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' });
        if (!response.ok) {
            return null;
        }

        const identity = await response.text();

        const updateResponse = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: identity,
                smart_cancel: true
            })
        });

        if (updateResponse.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', () => handleCancelSubscriptionClick(event, el, errorEl, siteUrl, doAction));
            el.classList.remove('loading');
            el.classList.add('error');

            if (errorEl) {
                errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', () => handleCancelSubscriptionClick(event, el, errorEl, siteUrl, doAction));
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = err.message;
        }
    }
}

async function handleContinueSubscriptionClick(event, el, errorEl, siteUrl) {
    el.removeEventListener('click', () => handleContinueSubscriptionClick(event, el, errorEl, siteUrl));
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    let subscriptionId = el.dataset.membersContinueSubscription;

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const response = await fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' });
        if (!response.ok) {
            return null;
        }

        const identity = await response.text();

        const updateResponse = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: identity,
                cancel_at_period_end: false
            })
        });

        if (updateResponse.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', () => handleContinueSubscriptionClick(event, el, errorEl, siteUrl));
            el.classList.remove('loading');
            el.classList.add('error');

            if (errorEl) {
                errorEl.innerText = t('There was an error continuing your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', () => handleContinueSubscriptionClick(event, el, errorEl, siteUrl));
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = err.message;
        }
    }
}

export function handleDataAttributes({ siteUrl, site = {}, member, offers = [], doAction, captureException } = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    document.querySelectorAll('form[data-members-form]').forEach((form) => {
        let errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            handleFormSubmit(event, form, errorEl, siteUrl, submitHandler, doAction, captureException);
        }
        form.addEventListener('submit', submitHandler);
    });

    document.querySelectorAll('[data-members-plan]').forEach((el) => {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            handlePlanClick(event, el, errorEl, siteUrl, site, member, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-edit-billing]').forEach((el) => {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleEditBillingClick(event, el, errorEl, siteUrl, site, member, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-manage-billing]').forEach((el) => {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleManageBillingClick(event, el, errorEl, siteUrl, site, member, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-signout]').forEach((el) => {
        function clickHandler(event) {
            handleSignoutClick(event, el, siteUrl);
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-cancel-subscription]').forEach((el) => {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleCancelSubscriptionClick(event, el, errorEl, siteUrl, doAction);
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-continue-subscription]').forEach((el) => {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleContinueSubscriptionClick(event, el, errorEl, siteUrl);
        }
        el.addEventListener('click', clickHandler);
    });
}
```