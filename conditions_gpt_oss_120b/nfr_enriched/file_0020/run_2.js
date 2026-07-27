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

/**
 * Extracts values from a form submission event.
 */
function extractFormData(event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];

    const labels = Array.from(labelInputs, el => el.value);
    const newsletters = Array.from(newsletterInputs, el => ({name: el.value}));

    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;

    return {email, name, labels, newsletters, newsletterInputs};
}

/**
 * Builds request body for magic link API.
 */
function buildRequestBody({email, name, labels, newsletters, autoRedirect, wantsOTC, urlHistory, newsletterInputs}) {
    const reqBody = {
        email,
        emailType: undefined,
        labels,
        name,
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
        const checkableNewsletterInputs = document.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }
    return reqBody;
}

/**
 * Handles the magic link response for OTC flows.
 */
async function handleOtcResponse({response, email, doAction, captureException, errorEl, form}) {
    const responseBody = await response.clone().json().catch(() => undefined);
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
}

/**
 * Main form submit handler.
 */
export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) errorEl.innerText = '';
    form.classList.remove('success', 'invalid', 'error');

    const {email, name, labels, newsletters, newsletterInputs} = extractFormData(event);
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildRequestBody({
        email,
        name,
        labels,
        newsletters,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletterInputs
    });
    reqBody.emailType = emailType;

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
            if (wantsOTC) {
                await handleOtcResponse({response: magicLinkRes, email, doAction, captureException, errorEl, form});
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

/**
 * Retrieves identity token from the session endpoint.
 */
async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) return null;
    return res.text();
}

/**
 * Creates a Stripe checkout session.
 */
async function createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
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
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/**
 * Redirects to Stripe checkout or navigates to URL.
 */
async function processStripeResponse(responseBody) {
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

/**
 * Handles plan click events.
 */
export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
    const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    try {
        const identity = await fetchIdentity(siteUrl);
        const responseBody = await createStripeCheckoutSession(
            siteUrl,
            requestData,
            identity,
            checkoutSuccessUrl,
            checkoutCancelUrl,
            metadata
        );
        await processStripeResponse(responseBody);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Handles edit billing click events.
 */
async function handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    try {
        const identity = await fetchIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, successUrl, cancelUrl})
        });
        if (!res.ok) throw new Error(t('Could not create stripe checkout session'));
        const result = await res.json();
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

/**
 * Handles manage billing click events.
 */
async function handleManageBillingClick({el, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    try {
        const identity = await fetchIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, returnUrl})
        });
        if (!res.ok) throw new Error(t('Could not create Stripe billing portal session'));
        const result = await res.json();
        window.location.assign(result.url);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Handles signout click events.
 */
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

/**
 * Handles subscription cancellation click events.
 */
async function handleCancelSubscriptionClick({el, errorEl, siteUrl, subscriptionId, clickHandler, hasRetentionOffers, doAction}) {
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
        const identity = await fetchIdentity(siteUrl);
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
    }
}

/**
 * Handles subscription continuation click events.
 */
async function handleContinueSubscriptionClick({el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    el.classList.remove('error');
    el.classList.add('loading');
    if (errorEl) errorEl.innerText = '';

    try {
        const identity = await fetchIdentity(siteUrl);
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
    }
}

/**
 * Initializes data attribute handlers.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) return;
    siteUrl = siteUrl.replace(/\/$/, '');

    // Form submissions
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    // Plan clicks
    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            planClickHandler({event, el, errorEl, member, site, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess ? (new URL(el.dataset.membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = el.dataset.membersCancel ? (new URL(el.dataset.membersCancel, window.location.href)).href : undefined;
        const clickHandler = event => {
            handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn ? (new URL(el.dataset.membersReturn, window.location.href)).href : undefined;
        const clickHandler = event => {
            handleManageBillingClick({el, errorEl, siteUrl, returnUrl, clickHandler});
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

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            const subscriptionId = el.dataset.membersCancelSubscription;
            handleCancelSubscriptionClick({
                el,
                errorEl,
                siteUrl,
                subscriptionId,
                clickHandler,
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
                subscriptionId,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });
}