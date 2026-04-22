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
    let emailType;
    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(i => i.value);
    const newsletterInputs = Array.from(
        event.target.querySelectorAll(
            'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
        )
    );
    const newsletters = newsletterInputs.map(i => ({name: i.value}));

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
        autoRedirect: autoRedirect === 'true',
        ...(wantsOTC && {includeOTC: true}),
        ...(urlHistory && {urlHistory}),
        ...(newsletterInputs.length ? {newsletters} : {})
    };

    if (!newsletterInputs.length) {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length) {
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
                } catch {
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

/* ---------- Plan Click ---------- */
async function handlePlanClick({
    el,
    errorEl,
    siteUrl,
    site,
    member,
    clickHandler
}) {
    el.removeEventListener('click', clickHandler);
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = successUrl ? new URL(successUrl, window.location.href).href : undefined;
    const checkoutCancelUrl = cancelUrl ? new URL(cancelUrl, window.location.href).href : undefined;

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = identityRes.ok ? await identityRes.text() : null;

        const sessionRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                ...requestData,
                identity,
                successUrl: checkoutSuccessUrl,
                cancelUrl: checkoutCancelUrl,
                metadata
            })
        });

        if (!sessionRes.ok) throw new Error(t('Could not create stripe checkout session'));

        const responseBody = await sessionRes.json();

        if (responseBody.url) {
            window.location.assign(responseBody.url);
        } else {
            const stripe = window.Stripe(responseBody.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
            if (redirectResult.error) throw new Error(redirectResult.error.message);
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
async function handleEditBillingClick({
    el,
    errorEl,
    siteUrl,
    clickHandler,
    successUrl,
    cancelUrl
}) {
    el.removeEventListener('click', clickHandler);
    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = identityRes.ok ? await identityRes.text() : null;

        const sessionRes = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, successUrl, cancelUrl})
        });

        if (!sessionRes.ok) throw new Error(t('Could not create stripe checkout session'));

        const result = await sessionRes.json();
        const stripe = window.Stripe(result.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
        if (redirectResult.error) throw new Error(t(redirectResult.error.message));
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/* ---------- Manage Billing ---------- */
async function handleManageBillingClick({
    el,
    errorEl,
    siteUrl,
    clickHandler,
    returnUrl
}) {
    el.removeEventListener('click', clickHandler);
    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = identityRes.ok ? await identityRes.text() : null;

        const portalRes = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, returnUrl})
        });

        if (!portalRes.ok) throw new Error(t('Could not create Stripe billing portal session'));

        const result = await portalRes.json();
        window.location.assign(result.url);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/* ---------- Signout ---------- */
async function handleSignoutClick({el, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    el.classList.remove('error');
    el.classList.add('loading');

    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

/* ---------- Cancel Subscription ---------- */
async function handleCancelSubscriptionClick({
    el,
    errorEl,
    siteUrl,
    clickHandler,
    subscriptionId,
    hasRetentionOffers,
    doAction
}) {
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

        const cancelRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, smart_cancel: true})
        });

        if (cancelRes.ok) {
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
        if (errorEl) errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
    }
}

/* ---------- Continue Subscription ---------- */
async function handleContinueSubscriptionClick({
    el,
    errorEl,
    siteUrl,
    clickHandler,
    subscriptionId
}) {
    el.removeEventListener('click', clickHandler);
    el.classList.remove('error');
    el.classList.add('loading');
    if (errorEl) errorEl.innerText = '';

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = identityRes.ok ? await identityRes.text() : null;

        const continueRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, cancel_at_period_end: false})
        });

        if (continueRes.ok) {
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
        if (errorEl) errorEl.innerText = t('There was an error continuing your subscription, please try again.');
    }
}

/* ---------- Main Data Attribute Handler ---------- */
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

    // Form submissions
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

    // Plan clicks
    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            handlePlanClick({
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

    // Edit billing
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess
            ? new URL(el.dataset.membersSuccess, window.location.href).href
            : undefined;
        const cancelUrl = el.dataset.membersCancel
            ? new URL(el.dataset.membersCancel, window.location.href).href
            : undefined;
        const clickHandler = event => {
            handleEditBillingClick({
                el,
                errorEl,
                siteUrl,
                clickHandler,
                successUrl,
                cancelUrl
            });
        };
        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn
            ? new URL(el.dataset.membersReturn, window.location.href).href
            : undefined;
        const clickHandler = event => {
            handleManageBillingClick({
                el,
                errorEl,
                siteUrl,
                clickHandler,
                returnUrl
            });
        };
        el.addEventListener('click', clickHandler);
    });

    // Signout
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = event => {
            handleSignoutClick({el, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(o => o.redemption_type === 'retention');

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            const subscriptionId = el.dataset.membersCancelSubscription;
            handleCancelSubscriptionClick({
                el,
                errorEl,
                siteUrl,
                clickHandler,
                subscriptionId,
                hasRetentionOffers,
                doAction
            });
        };
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            const subscriptionId = el.dataset.membersContinueSubscription;
            handleContinueSubscriptionClick({
                el,
                errorEl,
                siteUrl,
                clickHandler,
                subscriptionId
            });
        };
        el.addEventListener('click', clickHandler);
    });
}