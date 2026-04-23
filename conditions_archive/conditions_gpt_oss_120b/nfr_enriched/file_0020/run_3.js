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
 * Apply error UI state to the form.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extract values from label inputs.
 */
function collectLabels(formElement) {
    const labels = [];
    const labelInputs = formElement.querySelectorAll('input[data-members-label]') || [];
    labelInputs.forEach(input => labels.push(input.value));
    return labels;
}

/**
 * Extract newsletter selections.
 */
function collectNewsletters(formElement) {
    const newsletters = [];
    const selector = 'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked';
    const newsletterInputs = formElement.querySelectorAll(selector) || [];
    newsletterInputs.forEach(input => newsletters.push({name: input.value}));
    return {newsletters, hasChecked: newsletterInputs.length > 0};
}

/**
 * Determine if an empty newsletter array should be sent.
 */
function maybeAddEmptyNewsletterArray(formElement, reqBody) {
    const checkable = formElement.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    if (checkable.length > 0) {
        reqBody.newsletters = [];
    }
}

/**
 * Build request payload for magic‑link submission.
 */
function buildRequestBody({
    email,
    name,
    emailType,
    labels,
    autoRedirect,
    wantsOTC,
    urlHistory,
    newslettersInfo,
    formElement
}) {
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: (autoRedirect === 'true')
    };
    if (wantsOTC) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (newslettersInfo.hasChecked) {
        body.newsletters = newslettersInfo.newsletters;
    } else {
        maybeAddEmptyNewsletterArray(formElement, body);
    }
    return body;
}

/**
 * Retrieve integrity token from Ghost API.
 */
async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return await res.text();
}

/**
 * Send magic‑link request.
 */
async function sendMagicLink(siteUrl, payload) {
    return await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
}

/**
 * Process successful magic‑link response.
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
 * Process failed magic‑link response.
 */
async function handleMagicLinkFailure(response, errorEl, form) {
    const apiError = await HumanReadableError.fromApiResponse(response);
    const message = chooseBestErrorMessage(apiError, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, message);
    form.classList.add('error');
}

/**
 * Main submit handler for member forms.
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

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm || undefined;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const labels = collectLabels(event.target);
    const newslettersInfo = collectNewsletters(event.target);
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
    const urlHistory = getUrlHistory();

    const reqBody = buildRequestBody({
        email,
        name,
        emailType,
        labels,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newslettersInfo,
        formElement: event.target
    });

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, {...reqBody, integrityToken});

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
            await handleMagicLinkFailure(magicLinkRes, errorEl, form);
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Create Stripe checkout session and redirect.
 */
async function createAndRedirectCheckout({
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

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const body = await res.json();

    if (body.url) {
        window.location.assign(body.url);
        return;
    }

    const stripe = window.Stripe(body.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: body.sessionId});
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

/**
 * Retrieve identity token from Ghost API.
 */
async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) return null;
    return await res.text();
}

/**
 * Click handler for plan buttons.
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
        const identity = await fetchIdentity(siteUrl);
        await createAndRedirectCheckout({
            siteUrl,
            requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        });
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
    }
}

/**
 * Generic fetch‑then‑json helper.
 */
async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(t('Network request failed'));
    }
    return await res.json();
}

/**
 * Handle click for edit‑billing elements.
 */
function attachEditBillingHandler({el, siteUrl, errorEl, membersSuccess, membersCancel}) {
    const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
    const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;

    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identity = await fetchIdentity(siteUrl);
            const result = await fetchJson(`${siteUrl}/members/api/create-stripe-update-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, successUrl, cancelUrl})
            });
            const stripe = window.Stripe(result.publicKey);
            const redirect = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirect.error) {
                throw new Error(t(redirect.error.message));
            }
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) errorEl.innerText = err.message;
            el.classList.add('error');
        }
    }

    el.addEventListener('click', clickHandler);
}

/**
 * Handle click for manage‑billing elements.
 */
function attachManageBillingHandler({el, siteUrl, errorEl, membersReturn}) {
    const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;

    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) errorEl.innerText = '';
        el.classList.add('loading');

        try {
            const identity = await fetchIdentity(siteUrl);
            const result = await fetchJson(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, returnUrl})
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

    el.addEventListener('click', clickHandler);
}

/**
 * Handle click for sign‑out elements.
 */
function attachSignoutHandler({el, siteUrl}) {
    async function clickHandler(event) {
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
    }

    el.addEventListener('click', clickHandler);
}

/**
 * Handle click for cancel‑subscription elements.
 */
function attachCancelSubscriptionHandler({el, siteUrl, errorEl, offers, doAction}) {
    const hasRetentionOffers = (offers || []).some(o => o.redemption_type === 'retention');

    async function clickHandler(event) {
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
        }
    }

    el.addEventListener('click', clickHandler);
}

/**
 * Handle click for continue‑subscription elements.
 */
function attachContinueSubscriptionHandler({el, siteUrl, errorEl}) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        const subscriptionId = el.dataset.membersContinueSubscription;
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
        }
    }

    el.addEventListener('click', clickHandler);
}

/**
 * Initialize data‑attribute handlers across the page.
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

    // Edit billing
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        attachEditBillingHandler({
            el,
            siteUrl,
            errorEl,
            membersSuccess: el.dataset.membersSuccess,
            membersCancel: el.dataset.membersCancel
        });
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        attachManageBillingHandler({
            el,
            siteUrl,
            errorEl,
            membersReturn: el.dataset.membersReturn
        });
    });

    // Sign out
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        attachSignoutHandler({el, siteUrl});
    });

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        attachCancelSubscriptionHandler({
            el,
            siteUrl,
            errorEl,
            offers,
            doAction
        });
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        attachContinueSubscriptionHandler({el, siteUrl, errorEl});
    });
}