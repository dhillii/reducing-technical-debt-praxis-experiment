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

/* ---------- Form Submit ---------- */
export async function formSubmitHandler({
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
    if (errorEl) errorEl.innerText = '';
    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset?.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(i => i.value);
    const newsletterInputs = Array.from(
        event.target.querySelectorAll(
            'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
        )
    );
    const newsletters = newsletterInputs.map(i => ({name: i.value}));

    form.classList.add('loading');
    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        urlHistory: getUrlHistory()
    };
    if (wantsOTC) reqBody.includeOTC = true;
    if (newsletterInputs.length) {
        reqBody.newsletters = newsletters;
    } else {
        const checkable = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkable.length) reqBody.newsletters = [];
    }

    try {
        const integrityRes = await fetch(`${siteUrl}/members/api/integrity-token/`);
        const integrityToken = await integrityRes.text();

        const magicRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicRes.ok) {
            form.classList.add('success');
            let responseBody;
            if (wantsOTC) {
                try {
                    responseBody = await magicRes.clone().json();
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
            const apiError = await HumanReadableError.fromApiResponse(magicRes);
            const msg = chooseBestErrorMessage(apiError, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, msg);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/* ---------- Plan Click ---------- */
async function createStripeSession({
    siteUrl,
    requestData,
    identity,
    successUrl,
    cancelUrl,
    metadata
}) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        })
    });
    if (!res.ok) throw new Error(t('Could not create stripe checkout session'));
    return res.json();
}

export async function planClickHandler({
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

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess
        ? new URL(el.dataset.membersSuccess, window.location.href).href
        : undefined;
    const cancelUrl = el.dataset.membersCancel
        ? new URL(el.dataset.membersCancel, window.location.href).href
        : undefined;

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = identityRes.ok ? await identityRes.text() : null;
        const session = await createStripeSession({
            siteUrl,
            requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        });

        if (session.url) {
            window.location.assign(session.url);
        } else {
            const stripe = window.Stripe(session.publicKey);
            const result = await stripe.redirectToCheckout({sessionId: session.sessionId});
            if (result.error) throw new Error(result.error.message);
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/* ---------- Edit Billing ---------- */
async function createStripeUpdateSession({siteUrl, identity, successUrl, cancelUrl}) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, successUrl, cancelUrl})
    });
    if (!res.ok) throw new Error(t('Could not create stripe checkout session'));
    return res.json();
}

export function handleEditBillingClick({
    el,
    errorEl,
    siteUrl,
    successUrl,
    cancelUrl,
    clickHandler
}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
            const identity = identityRes.ok ? await identityRes.text() : null;
            const result = await createStripeUpdateSession({siteUrl, identity, successUrl, cancelUrl});
            const stripe = window.Stripe(result.publicKey);
            const redirect = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirect.error) throw new Error(t(redirect.error.message));
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) errorEl.innerText = err.message;
            el.classList.add('error');
        }
    };
}

/* ---------- Manage Billing ---------- */
async function createBillingPortalSession({siteUrl, identity, returnUrl}) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, returnUrl})
    });
    if (!res.ok) throw new Error(t('Could not create Stripe billing portal session'));
    return res.json();
}

export function handleManageBillingClick({
    el,
    errorEl,
    siteUrl,
    returnUrl,
    clickHandler
}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
            const identity = identityRes.ok ? await identityRes.text() : null;
            const result = await createBillingPortalSession({siteUrl, identity, returnUrl});
            window.location.assign(result.url);
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) errorEl.innerText = err.message;
            el.classList.add('error');
        }
    };
}

/* ---------- Signout ---------- */
export function handleSignoutClick({el, siteUrl, clickHandler}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    };
}

/* ---------- Cancel Subscription ---------- */
export function handleCancelSubscriptionClick({
    el,
    errorEl,
    siteUrl,
    offers,
    doAction,
    clickHandler
}) {
    const hasRetentionOffers = (offers || []).some(o => o.redemption_type === 'retention');

    return async function (event) {
        event.preventDefault();
        const subscriptionId = el.dataset.membersCancelSubscription;

        if (hasRetentionOffers) {
            doAction('openPopup', {
                page: 'accountPlan',
                pageData: {subscriptionId, action: 'cancel'}
            });
            return;
        }

        el.removeEventListener('click', clickHandler);
        el.classList.remove('error');
        el.classList.add('loading');
        if (errorEl) errorEl.innerText = '';

        try {
            const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
            const identity = identityRes.ok ? await identityRes.text() : null;
            const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, smart_cancel: true})
            });
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
            }
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) errorEl.innerText = err.message;
        }
    };
}

/* ---------- Continue Subscription ---------- */
export function handleContinueSubscriptionClick({
    el,
    errorEl,
    siteUrl,
    clickHandler
}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        const subscriptionId = el.dataset.membersContinueSubscription;
        if (errorEl) errorEl.innerText = '';

        try {
            const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
            const identity = identityRes.ok ? await identityRes.text() : null;
            const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, cancel_at_period_end: false})
            });
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) errorEl.innerText = t('There was an error continuing your subscription, please try again.');
            }
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) errorEl.innerText = err.message;
        }
    };
}

/* ---------- Data Attributes Initialization ---------- */
export function handleDataAttributes({
    siteUrl,
    site = {},
    member,
    offers = [],
    doAction,
    captureException
} = {}) {
    if (!siteUrl) return;
    siteUrl = siteUrl.replace(/\/$/, '');

    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({
                event,
                form,
                errorEl,
                siteUrl,
                submitHandler,
                doAction,
                captureException
            });
        };
        form.addEventListener('submit', submitHandler);
    });

    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            planClickHandler({
                event,
                el,
                errorEl,
                siteUrl,
                site,
                member,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess
            ? new URL(el.dataset.membersSuccess, window.location.href).href
            : undefined;
        const cancelUrl = el.dataset.membersCancel
            ? new URL(el.dataset.membersCancel, window.location.href).href
            : undefined;
        const clickHandler = handleEditBillingClick({
            el,
            errorEl,
            siteUrl,
            successUrl,
            cancelUrl,
            clickHandler: null // placeholder, will be set after definition
        });
        // assign self-reference for re-attachment on error
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn
            ? new URL(el.dataset.membersReturn, window.location.href).href
            : undefined;
        const clickHandler = handleManageBillingClick({
            el,
            errorEl,
            siteUrl,
            returnUrl,
            clickHandler: null
        });
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = handleSignoutClick({el, siteUrl, clickHandler: null});
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = handleCancelSubscriptionClick({
            el,
            errorEl,
            siteUrl,
            offers,
            doAction,
            clickHandler: null
        });
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = handleContinueSubscriptionClick({
            el,
            errorEl,
            siteUrl,
            clickHandler: null
        });
        clickHandler.clickHandler = clickHandler;
        el.addEventListener('click', clickHandler);
    });
}
```