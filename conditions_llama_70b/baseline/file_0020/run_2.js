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

async function formSubmitHandler({
    event,
    form,
    errorEl,
    siteUrl,
    submitHandler,
    doAction,
    captureException
}) {
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
    labelInputs.forEach(labelInput => {
        labels.push(labelInput.value);
    });

    let newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    newsletterInputs.forEach(newsletterInput => {
        newsletters.push({ name: newsletterInput.value });
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
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];

        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    try {
        const magicLinkRes = await getMagicLinkResponse(siteUrl, reqBody);
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        await handleMagicLinkResponse(magicLinkRes, form, errorEl, wantsOTC, doAction);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

async function getCheckoutSessionResponse(siteUrl, requestData) {
    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });
        if (!res.ok) {
            return null;
        }
        const identity = await res.text();
        const checkoutSessionRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...requestData,
                identity: identity
            })
        });
        if (!checkoutSessionRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return await checkoutSessionRes.json();
    } catch (err) {
        throw err;
    }
}

async function handleCheckoutSessionResponse(responseBody, el, errorEl) {
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

async function planClickHandler({
    event,
    el,
    errorEl,
    siteUrl,
    site,
    member,
    clickHandler
}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    let plan = el.dataset.membersPlan;
    let requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    let successUrl = el.dataset.membersSuccess;
    let cancelUrl = el.dataset.membersCancel;
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
    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const responseBody = await getCheckoutSessionResponse(siteUrl, {
            ...requestData,
            successUrl: checkoutSuccessUrl,
            cancelUrl: checkoutCancelUrl,
            metadata
        });
        await handleCheckoutSessionResponse(responseBody, el, errorEl);
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

async function getBillingPortalSessionResponse(siteUrl, requestData) {
    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });
        if (!res.ok) {
            return null;
        }
        const identity = await res.text();
        const billingPortalSessionRes = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: identity,
                ...requestData
            })
        });
        if (!billingPortalSessionRes.ok) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }
        return await billingPortalSessionRes.json();
    } catch (err) {
        throw err;
    }
}

async function handleBillingPortalSessionResponse(responseBody, el, errorEl) {
    return window.location.assign(responseBody.url);
}

async function handleEditBillingClick({
    event,
    el,
    errorEl,
    siteUrl,
    membersSuccess,
    membersCancel
}) {
    el.removeEventListener('click', event => handleEditBillingClick({
        event,
        el,
        errorEl,
        siteUrl,
        membersSuccess,
        membersCancel
    }));
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    let successUrl;
    let cancelUrl;

    if (membersSuccess) {
        successUrl = (new URL(membersSuccess, window.location.href)).href;
    }

    if (membersCancel) {
        cancelUrl = (new URL(membersCancel, window.location.href)).href;
    }

    try {
        const responseBody = await getBillingPortalSessionResponse(siteUrl, {
            successUrl: successUrl,
            cancelUrl: cancelUrl
        });
        await handleBillingPortalSessionResponse(responseBody, el, errorEl);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', event => handleEditBillingClick({
            event,
            el,
            errorEl,
            siteUrl,
            membersSuccess,
            membersCancel
        }));
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

async function handleManageBillingClick({
    event,
    el,
    errorEl,
    siteUrl,
    membersReturn
}) {
    el.removeEventListener('click', event => handleManageBillingClick({
        event,
        el,
        errorEl,
        siteUrl,
        membersReturn
    }));
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    let returnUrl;

    if (membersReturn) {
        returnUrl = (new URL(membersReturn, window.location.href)).href;
    }

    try {
        const responseBody = await getBillingPortalSessionResponse(siteUrl, {
            returnUrl: returnUrl
        });
        await handleBillingPortalSessionResponse(responseBody, el, errorEl);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', event => handleManageBillingClick({
            event,
            el,
            errorEl,
            siteUrl,
            membersReturn
        }));
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

async function handleSignoutClick({
    event,
    el,
    siteUrl
}) {
    el.removeEventListener('click', event => handleSignoutClick({
        event,
        el,
        siteUrl
    }));
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');
    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {
            method: 'DELETE'
        });
        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', event => handleSignoutClick({
                event,
                el,
                siteUrl
            }));
            el.classList.remove('loading');
            el.classList.add('error');
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', event => handleSignoutClick({
            event,
            el,
            siteUrl
        }));
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

async function handleCancelSubscriptionClick({
    event,
    el,
    errorEl,
    siteUrl,
    subscriptionId,
    doAction,
    offers
}) {
    event.preventDefault();

    let errorElParent = el.parentElement.querySelector('[data-members-error]');

    if (offers.some(offer => offer.redemption_type === 'retention')) {
        doAction('openPopup', {
            page: 'accountPlan',
            pageData: {
                subscriptionId,
                action: 'cancel'
            }
        });

        return;
    }

    el.removeEventListener('click', event => handleCancelSubscriptionClick({
        event,
        el,
        errorEl,
        siteUrl,
        subscriptionId,
        doAction,
        offers
    }));
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorElParent) {
        errorElParent.innerText = '';
    }

    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });
        if (!res.ok) {
            return null;
        }

        const identity = await res.text();
        const subscriptionRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: identity,
                smart_cancel: true
            })
        });
        if (subscriptionRes.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', event => handleCancelSubscriptionClick({
                event,
                el,
                errorEl,
                siteUrl,
                subscriptionId,
                doAction,
                offers
            }));
            el.classList.remove('loading');
            el.classList.add('error');

            if (errorElParent) {
                errorElParent.innerText = t('There was an error cancelling your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', event => handleCancelSubscriptionClick({
            event,
            el,
            errorEl,
            siteUrl,
            subscriptionId,
            doAction,
            offers
        }));
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorElParent) {
            errorElParent.innerText = err.message;
        }
    }
}

async function handleContinueSubscriptionClick({
    event,
    el,
    errorEl,
    siteUrl,
    subscriptionId
}) {
    el.removeEventListener('click', event => handleContinueSubscriptionClick({
        event,
        el,
        errorEl,
        siteUrl,
        subscriptionId
    }));
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    let errorElParent = el.parentElement.querySelector('[data-members-error]');

    if (errorElParent) {
        errorElParent.innerText = '';
    }

    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });
        if (!res.ok) {
            return null;
        }

        const identity = await res.text();
        const subscriptionRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: identity,
                cancel_at_period_end: false
            })
        });
        if (subscriptionRes.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', event => handleContinueSubscriptionClick({
                event,
                el,
                errorEl,
                siteUrl,
                subscriptionId
            }));
            el.classList.remove('loading');
            el.classList.add('error');

            if (errorElParent) {
                errorElParent.innerText = t('There was an error continuing your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', event => handleContinueSubscriptionClick({
            event,
            el,
            errorEl,
            siteUrl,
            subscriptionId
        }));
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorElParent) {
            errorElParent.innerText = err.message;
        }
    }
}

export function handleDataAttributes({
    siteUrl,
    site = {},
    member,
    offers = [],
    doAction,
    captureException
} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        let errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({ event, errorEl, form, siteUrl, submitHandler, doAction, captureException });
        }
        form.addEventListener('submit', submitHandler);
    });

    document.querySelectorAll('[data-members-plan]').forEach(el => {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({ el, event, errorEl, member, site, siteUrl, clickHandler });
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        let errorEl = el.querySelector('[data-members-error]');
        let membersSuccess = el.dataset.membersSuccess;
        let membersCancel = el.dataset.membersCancel;
        function clickHandler(event) {
            handleEditBillingClick({ event, el, errorEl, siteUrl, membersSuccess, membersCancel });
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        let errorEl = el.querySelector('[data-members-error]');
        let membersReturn = el.dataset.membersReturn;
        function clickHandler(event) {
            handleManageBillingClick({ event, el, errorEl, siteUrl, membersReturn });
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-signout]').forEach(el => {
        function clickHandler(event) {
            handleSignoutClick({ event, el, siteUrl });
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        let subscriptionId = el.dataset.membersCancelSubscription;
        function clickHandler(event) {
            handleCancelSubscriptionClick({ event, el, errorEl, siteUrl, subscriptionId, doAction, offers });
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        let subscriptionId = el.dataset.membersContinueSubscription;
        function clickHandler(event) {
            handleContinueSubscriptionClick({ event, el, errorEl, siteUrl, subscriptionId });
        }
        el.addEventListener('click', clickHandler);
    });
}