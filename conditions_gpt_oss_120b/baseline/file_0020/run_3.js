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

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
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
    const newsletterInputs = Array.from(event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ));
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
        const checkable = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkable.length) reqBody.newsletters = [];
    }

    try {
        const integrityRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
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
            const apiError = await HumanReadableError.fromApiResponse(magicRes);
            const msg = chooseBestErrorMessage(apiError, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, msg);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

async function createStripeSession({siteUrl, endpoint, body}) {
    const sessionRes = await fetch(`${siteUrl}/members/api/${endpoint}/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    if (!sessionRes.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return sessionRes.json();
}

async function getIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) return null;
    return res.text();
}

export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = el.dataset.membersSuccess
        ? new URL(el.dataset.membersSuccess, window.location.href).href
        : undefined;
    const checkoutCancelUrl = el.dataset.membersCancel
        ? new URL(el.dataset.membersCancel, window.location.href).href
        : undefined;

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    try {
        const identity = await getIdentity(siteUrl);
        const session = await createStripeSession({
            siteUrl,
            endpoint: 'create-stripe-checkout-session',
            body: {
                ...requestData,
                identity,
                successUrl: checkoutSuccessUrl,
                cancelUrl: checkoutCancelUrl,
                metadata
            }
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

export async function editBillingHandler({event, el, errorEl, siteUrl, membersSuccess, membersCancel, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const successUrl = membersSuccess ? new URL(membersSuccess, window.location.href).href : undefined;
    const cancelUrl = membersCancel ? new URL(membersCancel, window.location.href).href : undefined;

    try {
        const identity = await getIdentity(siteUrl);
        const result = await createStripeSession({
            siteUrl,
            endpoint: 'create-stripe-update-session',
            body: {identity, successUrl, cancelUrl}
        });
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
}

export async function manageBillingHandler({event, el, errorEl, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    try {
        const identity = await getIdentity(siteUrl);
        const result = await createStripeSession({
            siteUrl,
            endpoint: 'create-stripe-billing-portal-session',
            body: {identity, returnUrl: undefined}
        });
        window.location.assign(result.url);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

export async function signoutHandler({event, el, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            throw new Error('Signout failed');
        }
    } catch {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

export async function cancelSubscriptionHandler({event, el, errorEl, siteUrl, subscriptionId, clickHandler, doAction, offers}) {
    event.preventDefault();

    const hasRetentionOffers = (offers || []).some(o => o.redemption_type === 'retention');
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
        const identity = await getIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, smart_cancel: true})
        });
        if (res.ok) {
            window.location.reload();
        } else {
            throw new Error('Cancel failed');
        }
    } catch {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
    }
}

export async function continueSubscriptionHandler({event, el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    event.preventDefault();
    el.removeEventListener('click', clickHandler);
    el.classList.remove('error');
    el.classList.add('loading');
    if (errorEl) errorEl.innerText = '';

    try {
        const identity = await getIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, cancel_at_period_end: false})
        });
        if (res.ok) {
            window.location.reload();
        } else {
            throw new Error('Continue failed');
        }
    } catch {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) errorEl.innerText = t('There was an error continuing your subscription, please try again.');
    }
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) return;
    siteUrl = siteUrl.replace(/\/$/, '');

    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const clickHandler = event => {
            editBillingHandler({event, el, errorEl, siteUrl, membersSuccess, membersCancel, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            manageBillingHandler({event, el, errorEl, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = event => {
            signoutHandler({event, el, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            cancelSubscriptionHandler({
                event,
                el,
                errorEl,
                siteUrl,
                subscriptionId: el.dataset.membersCancelSubscription,
                clickHandler,
                doAction,
                offers
            });
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            continueSubscriptionHandler({
                event,
                el,
                errorEl,
                siteUrl,
                subscriptionId: el.dataset.membersContinueSubscription,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });
}