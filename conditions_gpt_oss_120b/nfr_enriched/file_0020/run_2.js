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
 * Apply error styling and display a human‑readable message.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extract values from the submitted form.
 */
function collectFormData(event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];

    const labels = Array.from(labelInputs, el => el.value);
    const newsletters = Array.from(newsletterInputs, el => ({name: el.value}));

    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels,
        newsletters,
        newsletterInputs,
        labelInputs
    };
}

/**
 * Build the request payload for the magic‑link endpoint.
 */
function buildRequestBody({
    email,
    name,
    labels,
    newsletters,
    autoRedirect,
    emailType,
    wantsOTC,
    siteUrl,
    form
}) {
    const urlHistory = getUrlHistory();
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        urlHistory: urlHistory || undefined
    };

    if (wantsOTC) {
        body.includeOTC = true;
    }

    if (newsletters.length) {
        body.newsletters = newsletters;
    } else {
        // No newsletters selected – ensure member isn’t subscribed to defaults
        body.newsletters = [];
    }

    return body;
}

/**
 * Retrieve an integrity token from the API.
 */
async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return await res.text();
}

/**
 * Send the magic‑link request.
 */
async function sendMagicLink(siteUrl, body) {
    return await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
}

/**
 * Process a successful magic‑link response, handling OTC if required.
 */
async function handleMagicLinkSuccess({
    response,
    wantsOTC,
    email,
    doAction,
    captureException,
    errorEl,
    form
}) {
    form.classList.add('success');

    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await response.clone().json();
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
}

/**
 * Main form submit handler – orchestrates validation, API calls and UI updates.
 */
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

    const {
        email,
        name,
        labels,
        newsletters,
        newsletterInputs
    } = collectFormData(event);

    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';

    form.classList.add('loading');

    const requestBody = buildRequestBody({
        email,
        name,
        labels,
        newsletters,
        autoRedirect,
        emailType,
        wantsOTC,
        siteUrl,
        form
    });

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, {...requestBody, integrityToken});

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            await handleMagicLinkSuccess({
                response: magicLinkRes,
                wantsOTC,
                email,
                doAction,
                captureException,
                errorEl,
                form
            });
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
 * Fetch the current session identity token.
 */
async function fetchSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) return null;
    return await res.text();
}

/**
 * Create a Stripe checkout or upgrade session.
 */
async function createStripeSession(siteUrl, endpoint, payload) {
    const res = await fetch(`${siteUrl}/members/api/${endpoint}/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return await res.json();
}

/**
 * Redirect the user to Stripe Checkout or a direct URL.
 */
function redirectToStripe(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }
    const stripe = window.Stripe(responseBody.publicKey);
    stripe.redirectToCheckout({sessionId: responseBody.sessionId})
        .then(result => {
            if (result.error) {
                throw new Error(result.error.message);
            }
        });
}

/**
 * Handles plan click – creates a checkout session and redirects.
 */
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
        const identity = await fetchSessionIdentity(siteUrl);
        const session = await createStripeSession(siteUrl, 'create-stripe-checkout-session', {
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        });
        redirectToStripe(session);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Initialize form submit listeners for all member forms.
 */
function initFormHandlers({siteUrl, doAction, captureException}) {
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
}

/**
 * Initialize plan click listeners.
 */
function initPlanHandlers({siteUrl, site, member}) {
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
}

/**
 * Generic async click handler creator for Stripe‑related actions.
 */
function createAsyncClickHandler(action) {
    return async function clickHandler(event) {
        const el = event.currentTarget;
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        const errorEl = el.querySelector('[data-members-error]') || el.parentElement?.querySelector('[data-members-error]');
        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identity = await fetchSessionIdentity(action.siteUrl);
            const payload = action.buildPayload({el, identity});
            const response = await fetch(`${action.siteUrl}/members/api/${action.endpoint}/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(t(action.errorMessage));
            }
            const result = await response.json();

            if (action.redirect) {
                action.redirect(result);
            } else {
                window.location.assign(result.url);
            }
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
 * Initialize edit‑billing click listeners.
 */
function initEditBillingHandlers({siteUrl}) {
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const successUrl = el.dataset.membersSuccess
            ? (new URL(el.dataset.membersSuccess, window.location.href)).href
            : undefined;
        const cancelUrl = el.dataset.membersCancel
            ? (new URL(el.dataset.membersCancel, window.location.href)).href
            : undefined;

        const handler = createAsyncClickHandler({
            siteUrl,
            endpoint: 'create-stripe-update-session',
            errorMessage: 'Could not create stripe checkout session',
            buildPayload: ({identity}) => ({identity, successUrl, cancelUrl}),
            redirect: ({publicKey, sessionId}) => {
                const stripe = window.Stripe(publicKey);
                return stripe.redirectToCheckout({sessionId});
            }
        });

        el.addEventListener('click', handler);
    });
}

/**
 * Initialize manage‑billing click listeners.
 */
function initManageBillingHandlers({siteUrl}) {
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const returnUrl = el.dataset.membersReturn
            ? (new URL(el.dataset.membersReturn, window.location.href)).href
            : undefined;

        const handler = createAsyncClickHandler({
            siteUrl,
            endpoint: 'create-stripe-billing-portal-session',
            errorMessage: 'Could not create Stripe billing portal session',
            buildPayload: ({identity}) => ({identity, returnUrl}),
            redirect: ({url}) => {
                window.location.assign(url);
            }
        });

        el.addEventListener('click', handler);
    });
}

/**
 * Initialize sign‑out click listeners.
 */
function initSignoutHandlers({siteUrl}) {
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = async event => {
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
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize cancel‑subscription click listeners.
 */
function initCancelSubscriptionHandlers({siteUrl, offers = [], doAction}) {
    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = async event => {
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
                const identity = await fetchSessionIdentity(siteUrl);
                const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, smart_cancel: true})
                });
                if (res.ok) {
                    window.location.reload();
                } else {
                    throw new Error(t('There was an error cancelling your subscription, please try again.'));
                }
            } catch (err) {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) errorEl.innerText = err.message;
            }
        };
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize continue‑subscription click listeners.
 */
function initContinueSubscriptionHandlers({siteUrl}) {
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            const subscriptionId = el.dataset.membersContinueSubscription;
            if (errorEl) errorEl.innerText = '';

            try {
                const identity = await fetchSessionIdentity(siteUrl);
                const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, cancel_at_period_end: false})
                });
                if (res.ok) {
                    window.location.reload();
                } else {
                    throw new Error(t('There was an error continuing your subscription, please try again.'));
                }
            } catch (err) {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) errorEl.innerText = err.message;
            }
        };
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Public entry point – wires up all data‑attribute handlers.
 */
export function handleDataAttributes({
    siteUrl,
    site = {},
    member,
    offers = [],
    doAction,
    captureException
} = {}) {
    if (!siteUrl) return;

    const normalizedSiteUrl = siteUrl.replace(/\/$/, '');

    initFormHandlers({siteUrl: normalizedSiteUrl, doAction, captureException});
    initPlanHandlers({siteUrl: normalizedSiteUrl, site, member});
    initEditBillingHandlers({siteUrl: normalizedSiteUrl});
    initManageBillingHandlers({siteUrl: normalizedSiteUrl});
    initSignoutHandlers({siteUrl: normalizedSiteUrl});
    initCancelSubscriptionHandlers({siteUrl: normalizedSiteUrl, offers, doAction});
    initContinueSubscriptionHandlers({siteUrl: normalizedSiteUrl});
}