/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Update error element text if it exists.
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Apply error state to form and display message.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extract values from form inputs.
 */
function collectFormInputs(event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];

    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;

    const labels = Array.from(labelInputs, el => el.value);
    const newsletters = Array.from(newsletterInputs, el => ({name: el.value}));

    return {email, name, labels, newsletters, newsletterInputs};
}

/**
 * Build request payload for magic link.
 */
function buildRequestBody({email, name, labels, newsletters, newsletterInputs, form, siteUrl}) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset?.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const urlHistory = getUrlHistory();

    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (newsletterInputs.length > 0) {
        body.newsletters = newsletters;
    } else {
        const checkable = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkable.length > 0) {
            body.newsletters = [];
        }
    }
    return {body, wantsOTC};
}

/**
 * Retrieve integrity token from API.
 */
async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return await res.text();
}

/**
 * Send magic link request.
 */
async function sendMagicLink(siteUrl, payload) {
    return await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
}

/**
 * Process successful magic link response, handling OTC if required.
 */
async function processMagicLinkSuccess(response, wantsOTC, {email, doAction, captureException, errorEl, form}) {
    form.classList.add('success');

    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await response.clone().json();
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

    const {email, name, labels, newsletters, newsletterInputs} = collectFormInputs(event);
    const {body: reqBody, wantsOTC} = buildRequestBody({email, name, labels, newsletters, newsletterInputs, form, siteUrl});

    form.classList.add('loading');

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, {...reqBody, integrityToken});

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            await processMagicLinkSuccess(magicLinkRes, wantsOTC, {email, doAction, captureException, errorEl, form});
        } else {
            const apiError = await HumanReadableError.fromApiResponse(magicLinkRes);
            const message = chooseBestErrorMessage(apiError, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, message);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Create Stripe checkout session and redirect.
 */
async function createStripeSession({siteUrl, requestData, identity, successUrl, cancelUrl, metadata}) {
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
    return await res.json();
}

/**
 * Redirect to Stripe checkout or URL.
 */
function redirectToStripeOrUrl(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }
    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({sessionId: responseBody.sessionId})
        .then(result => {
            if (result.error) {
                throw new Error(result.error.message);
            }
        });
}

/**
 * Plan click handler.
 */
export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess
        ? (new URL(el.dataset.membersSuccess, window.location.href)).href
        : undefined;
    const cancelUrl = el.dataset.membersCancel
        ? (new URL(el.dataset.membersCancel, window.location.href)).href
        : undefined;

    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        const identity = sessionRes.ok ? await sessionRes.text() : null;
        const responseBody = await createStripeSession({siteUrl, requestData, identity, successUrl, cancelUrl, metadata});
        await redirectToStripeOrUrl(responseBody);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Generic fetch helper for session identity.
 */
async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? await res.text() : null;
}

/**
 * Helper to create Stripe update session.
 */
async function createStripeUpdateSession({siteUrl, identity, successUrl, cancelUrl}) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, successUrl, cancelUrl})
    });
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return await res.json();
}

/**
 * Click handler for edit billing.
 */
function editBillingClickHandler({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identity = await fetchIdentity(siteUrl);
            const result = await createStripeUpdateSession({siteUrl, identity, successUrl, cancelUrl});
            const stripe = window.Stripe(result.publicKey);
            await stripe.redirectToCheckout({sessionId: result.sessionId});
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) errorEl.innerText = err.message;
            el.classList.add('error');
        }
    };
}

/**
 * Helper to create Stripe billing portal session.
 */
async function createBillingPortalSession({siteUrl, identity, returnUrl}) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, returnUrl})
    });
    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }
    return await res.json();
}

/**
 * Click handler for manage billing.
 */
function manageBillingClickHandler({el, errorEl, siteUrl, returnUrl, clickHandler}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identity = await fetchIdentity(siteUrl);
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

/**
 * Click handler for signout.
 */
function signoutClickHandler({el, siteUrl, clickHandler}) {
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

/**
 * Helper to cancel subscription.
 */
async function cancelSubscription({siteUrl, subscriptionId, identity}) {
    const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, smart_cancel: true})
    });
    return res;
}

/**
 * Click handler for cancel subscription.
 */
function cancelSubscriptionClickHandler({el, errorEl, siteUrl, hasRetentionOffers, doAction, clickHandler}) {
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
            const identity = await fetchIdentity(siteUrl);
            const res = await cancelSubscription({siteUrl, subscriptionId, identity});
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
        }
    };
}

/**
 * Helper to continue subscription.
 */
async function continueSubscription({siteUrl, subscriptionId, identity}) {
    const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, cancel_at_period_end: false})
    });
    return res;
}

/**
 * Click handler for continue subscription.
 */
function continueSubscriptionClickHandler({el, errorEl, siteUrl, clickHandler}) {
    return async function (event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        const subscriptionId = el.dataset.membersContinueSubscription;
        if (errorEl) errorEl.innerText = '';

        try {
            const identity = await fetchIdentity(siteUrl);
            const res = await continueSubscription({siteUrl, subscriptionId, identity});
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
        }
    };
}

/**
 * Main data-attributes initializer.
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
            planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess
            ? (new URL(el.dataset.membersSuccess, window.location.href)).href
            : undefined;
        const cancelUrl = el.dataset.membersCancel
            ? (new URL(el.dataset.membersCancel, window.location.href)).href
            : undefined;
        const clickHandler = editBillingClickHandler({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler: null});
        // bind actual handler after creation to allow re-attachment on error
        const boundHandler = clickHandler.bind(null);
        el.addEventListener('click', boundHandler);
        // store reference for re-attachment
        clickHandler.clickHandler = boundHandler;
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn
            ? (new URL(el.dataset.membersReturn, window.location.href)).href
            : undefined;
        const clickHandler = manageBillingClickHandler({el, errorEl, siteUrl, returnUrl, clickHandler: null});
        const boundHandler = clickHandler.bind(null);
        el.addEventListener('click', boundHandler);
        clickHandler.clickHandler = boundHandler;
    });

    // Signout
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = signoutClickHandler({el, siteUrl, clickHandler: null});
        const boundHandler = clickHandler.bind(null);
        el.addEventListener('click', boundHandler);
        clickHandler.clickHandler = boundHandler;
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = cancelSubscriptionClickHandler({
            el,
            errorEl,
            siteUrl,
            hasRetentionOffers,
            doAction,
            clickHandler: null
        });
        const boundHandler = clickHandler.bind(null);
        el.addEventListener('click', boundHandler);
        clickHandler.clickHandler = boundHandler;
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = continueSubscriptionClickHandler({
            el,
            errorEl,
            siteUrl,
            clickHandler: null
        });
        const boundHandler = clickHandler.bind(null);
        el.addEventListener('click', boundHandler);
        clickHandler.clickHandler = boundHandler;
    });
}